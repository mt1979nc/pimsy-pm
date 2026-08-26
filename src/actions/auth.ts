"use server";

import { redirect } from "next/navigation";
import { eq, and, isNull, gt } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { users, passwordResetTokens } from "@/db/schema";
import { requireUser } from "@/lib/guard";
import { env } from "@/lib/env";
import {
  hashPassword,
  verifyPassword,
  passwordIssue,
  generateResetToken,
  hashToken,
  RESET_TOKEN_TTL_MS,
} from "@/lib/password";
import { createDatabaseSession } from "@/lib/session";
import { sendEmail, passwordResetEmail } from "@/lib/email";
import { writePasswordResetLink } from "@/lib/reset-link";
import { audit } from "@/lib/audit";

export type ActionState = { error?: string; ok?: boolean };

/**
 * Where someone lands right after signing in, based on their role. Mirrors
 * the redirect already used by the magic-link/Google flow (see
 * src/app/signin/page.tsx and src/app/(app)/layout.tsx).
 */
function landingPathFor(role: string) {
  return role === "CUSTOMER" ? "/portal" : "/dashboard";
}

// ---------------------------------------------------------------------------
// Password sign-in
// ---------------------------------------------------------------------------

const signInSchema = z.object({
  email: z.string().trim().min(1).toLowerCase(),
  password: z.string().min(1),
});

/**
 * Deliberately generic — the same message whether the address doesn't exist,
 * has no password set, is deactivated, or the password is simply wrong. See
 * src/lib/authz.ts's own comment on the same principle for assertProjectAccess.
 */
const BAD_CREDENTIALS = "That email and password don't match, or this account doesn't have a password set yet.";

export async function signInWithPassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter your email and password." };

  const user = await db.query.users.findFirst({
    where: eq(users.email, parsed.data.email),
  });

  if (!user || !user.passwordHash || !user.isActive) {
    return { error: BAD_CREDENTIALS };
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) return { error: BAD_CREDENTIALS };

  await createDatabaseSession(user.id);
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id));

  redirect(landingPathFor(user.role));
}

// ---------------------------------------------------------------------------
// Forgot password / set a password
// ---------------------------------------------------------------------------

const requestResetSchema = z.object({
  email: z.string().trim().min(1).toLowerCase(),
});

/**
 * Always returns the same success message, regardless of whether the email
 * matches an account — otherwise this endpoint becomes a way to check which
 * addresses are provisioned. If it matches an active account, an email goes
 * out (or, with no email service configured, a link is written locally the
 * same way magic-link sign-in is — see writePasswordResetLink).
 */
export async function requestPasswordReset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = requestResetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "Enter your email address." };

  const genericOk: ActionState = { ok: true };

  const user = await db.query.users.findFirst({
    where: eq(users.email, parsed.data.email),
  });
  if (!user || !user.isActive) return genericOk;

  // One live link at a time — clears out anything requested earlier.
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));

  const { raw, hash } = generateResetToken();
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: hash,
    expires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  });

  const url = `${env.APP_URL}/reset-password?token=${raw}`;
  const hasExistingPassword = !!user.passwordHash;

  if (!env.EMAIL_ENABLED) {
    await writePasswordResetLink(user.email, url, !hasExistingPassword);
  } else {
    await sendEmail({
      to: user.email,
      subject: hasExistingPassword ? "Reset your PIMSY Implementations password" : "Set a password for PIMSY Implementations",
      html: passwordResetEmail(url, hasExistingPassword),
    });
  }

  return genericOk;
}

const resetSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(1),
    confirmPassword: z.string().min(1),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Those passwords don't match.",
    path: ["confirmPassword"],
  });

export async function resetPassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  const issue = passwordIssue(parsed.data.password);
  if (issue) return { error: issue };

  const tokenHash = hashToken(parsed.data.token);
  const row = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.tokenHash, tokenHash),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expires, new Date()),
    ),
  });
  if (!row) {
    return { error: "This link is invalid or has expired. Request a new one." };
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, row.userId) });
  if (!user || !user.isActive) {
    return { error: "This link is invalid or has expired. Request a new one." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const isNew = !user.passwordHash;

  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, row.id));
  // Any other outstanding link for this user is now stale.
  await db
    .delete(passwordResetTokens)
    .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));

  await audit({
    actor: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      customerAccountId: user.customerAccountId,
      isActive: user.isActive,
    },
    action: isNew ? "auth.password.set" : "auth.password.reset",
    entityType: "user",
    entityId: user.id,
    summary: isNew ? "Set a password" : "Reset password",
  });

  await createDatabaseSession(user.id);
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id));

  redirect(landingPathFor(user.role));
}

// ---------------------------------------------------------------------------
// Change password (signed in, from Settings)
// ---------------------------------------------------------------------------

const changeSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: z.string().min(1),
    confirmPassword: z.string().min(1),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Those passwords don't match.",
    path: ["confirmPassword"],
  });

export async function changeOwnPassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireUser();

  const parsed = changeSchema.safeParse({
    currentPassword: formData.get("currentPassword") || undefined,
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  const issue = passwordIssue(parsed.data.newPassword);
  if (issue) return { error: issue };

  const user = await db.query.users.findFirst({ where: eq(users.id, actor.id) });
  if (!user) return { error: "Something went wrong. Please try again." };

  if (user.passwordHash) {
    if (!parsed.data.currentPassword) {
      return { error: "Enter your current password." };
    }
    const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
    if (!valid) return { error: "That current password is incorrect." };
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  const isNew = !user.passwordHash;
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

  await audit({
    actor,
    action: isNew ? "auth.password.set" : "auth.password.changed",
    entityType: "user",
    entityId: actor.id,
    summary: isNew ? "Set a password" : "Changed password",
  });

  return { ok: true };
}
