/**
 * Auto-invite for customer portal users.
 *
 * Provisioning a CUSTOMER user is the only way an external address gets PATH
 * access. The invite email (Resend, or a local set-password file when no key
 * is configured) is sent at the natural creation/assignment points — not as a
 * separate "remember to invite" step.
 *
 * Idempotent: a pending unused invite, an existing password, or a prior
 * sign-in skips a repeat send. Staff can force a resend from the contact row.
 *
 * Staff-domain addresses (INTERNAL_EMAIL_DOMAINS / bootstrap owner) are
 * refused — customers are not staff.
 */

import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { customerAccounts, passwordResetTokens, projectMembers, users } from "@/db/schema";
import type { Actor } from "@/lib/authz";
import { customerInviteEmail, sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { isReservedStaffEmail } from "@/lib/internal-email";
import { generateResetToken, RESET_TOKEN_TTL_MS } from "@/lib/password";
import { writePasswordResetLink } from "@/lib/reset-link";

export const STAFF_DOMAIN_CONTACT_ERROR =
  "That address is a staff email domain. Customer portal users cannot use INTERNAL_EMAIL_DOMAINS.";

export type InviteSkipReason = "already_signed_in" | "pending_invite";
export type InviteRefuseReason = "internal_staff_email" | "not_customer" | "inactive";
export type InviteSendReason = "first_invite" | "resend" | "expired_invite";

export type CustomerInviteDecision =
  | { action: "refuse"; reason: InviteRefuseReason }
  | { action: "skip"; reason: InviteSkipReason }
  | { action: "send"; reason: InviteSendReason };

export type CustomerInviteInput = {
  email: string;
  isReservedStaffEmail: boolean;
  /** Null when the user row does not exist yet. */
  role: string | null;
  isActive: boolean;
  lastSeenAt: Date | null;
  hasPassword: boolean;
  unusedInviteExpiresAt: Date | null;
  force?: boolean;
  now?: Date;
};

export function decideCustomerInvite(input: CustomerInviteInput): CustomerInviteDecision {
  if (input.isReservedStaffEmail) {
    return { action: "refuse", reason: "internal_staff_email" };
  }
  if (input.role && input.role !== "CUSTOMER") {
    return { action: "refuse", reason: "not_customer" };
  }
  if (input.role && !input.isActive) {
    return { action: "refuse", reason: "inactive" };
  }

  if (input.force) return { action: "send", reason: "resend" };

  if (input.lastSeenAt || input.hasPassword) {
    return { action: "skip", reason: "already_signed_in" };
  }

  const now = input.now ?? new Date();
  if (input.unusedInviteExpiresAt && input.unusedInviteExpiresAt.getTime() > now.getTime()) {
    return { action: "skip", reason: "pending_invite" };
  }
  if (input.unusedInviteExpiresAt) {
    return { action: "send", reason: "expired_invite" };
  }
  return { action: "send", reason: "first_invite" };
}

export type PortalContactFields = {
  name: string;
  email: string;
  title?: string;
  phone?: string;
};

/**
 * Optional portal-contact fields on New customer / New project.
 * Empty pair → no contact. Name without email (or the reverse) is an error.
 */
export function parseOptionalPortalContact(
  formData: FormData,
): { ok: true; contact: PortalContactFields | null } | { ok: false; error: string } {
  const name = String(formData.get("contactName") ?? "").trim();
  const emailRaw = String(formData.get("contactEmail") ?? "").trim().toLowerCase();
  const titleRaw = String(formData.get("contactTitle") ?? "").trim();
  const phoneRaw = String(formData.get("contactPhone") ?? "").trim();

  if (!name && !emailRaw) return { ok: true, contact: null };
  if (!name) return { ok: false, error: "Enter the portal contact's name." };
  if (!emailRaw) return { ok: false, error: "Enter the portal contact's work email." };

  const parsed = z.email("Enter a valid email address.").safeParse(emailRaw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid email address." };
  }
  if (isReservedStaffEmail(parsed.data)) {
    return { ok: false, error: STAFF_DOMAIN_CONTACT_ERROR };
  }
  return {
    ok: true,
    contact: {
      name: name.slice(0, 120),
      email: parsed.data,
      title: titleRaw ? titleRaw.slice(0, 120) : undefined,
      phone: phoneRaw ? phoneRaw.slice(0, 40) : undefined,
    },
  };
}

export type InviteDeliver = (args: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  inviteUrl: string;
}) => Promise<{ emailed: boolean }>;

export async function defaultInviteDeliver(args: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  inviteUrl: string;
}): Promise<{ emailed: boolean }> {
  if (!env.EMAIL_ENABLED) {
    await writePasswordResetLink(args.to, args.inviteUrl, true);
    return { emailed: false };
  }
  await sendEmail({
    to: args.to,
    subject: args.subject,
    html: args.html,
    replyTo: args.replyTo,
  });
  return { emailed: true };
}

export type ProvisionResult =
  | { ok: true; userId: string; created: boolean; email: string; name: string }
  | { ok: false; error: string };

/**
 * Create or reuse a CUSTOMER user pinned to one customer account.
 * Does not send mail.
 */
export async function provisionCustomerContact(opts: {
  customerAccountId: string;
  email: string;
  name: string;
  title?: string | null;
  phone?: string | null;
}): Promise<ProvisionResult> {
  const email = opts.email.trim().toLowerCase();
  const name = opts.name.trim();
  if (!email || !name) return { ok: false, error: "Name and email are required." };
  if (isReservedStaffEmail(email)) return { ok: false, error: STAFF_DOMAIN_CONTACT_ERROR };

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true, role: true, customerAccountId: true, name: true },
  });

  if (existing) {
    if (existing.role !== "CUSTOMER") {
      return { ok: false, error: "That address belongs to an internal staff account." };
    }
    if (existing.customerAccountId !== opts.customerAccountId) {
      return {
        ok: false,
        error: "That address is already a contact for a different customer. Use a different address.",
      };
    }
    return { ok: true, userId: existing.id, created: false, email, name: existing.name ?? name };
  }

  const [row] = await db
    .insert(users)
    .values({
      email,
      name,
      title: opts.title?.trim() || null,
      phone: opts.phone?.trim() || null,
      role: "CUSTOMER",
      customerAccountId: opts.customerAccountId,
    })
    .returning({ id: users.id });

  return { ok: true, userId: row.id, created: true, email, name };
}

export type SendInviteResult = {
  emailed: boolean;
  skipped: boolean;
  skipReason?: InviteSkipReason;
  refuseReason?: InviteRefuseReason;
  inviteUrl?: string;
  emailSkipped: boolean;
  reason?: InviteSendReason;
};

async function unusedInviteExpiry(userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ expires: passwordResetTokens.expires })
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)))
    .orderBy(desc(passwordResetTokens.createdAt))
    .limit(1);
  return row?.expires ?? null;
}

/**
 * Mint a set-password invite and send it when `decideCustomerInvite` says so.
 */
export async function sendCustomerInvite(opts: {
  userId: string;
  actor: Pick<Actor, "email" | "name">;
  customerName: string;
  force?: boolean;
  deliver?: InviteDeliver;
}): Promise<SendInviteResult> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, opts.userId),
    columns: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastSeenAt: true,
      passwordHash: true,
    },
  });
  if (!user) {
    return { emailed: false, skipped: true, emailSkipped: true, refuseReason: "not_customer" };
  }

  const decision = decideCustomerInvite({
    email: user.email,
    isReservedStaffEmail: isReservedStaffEmail(user.email),
    role: user.role,
    isActive: user.isActive,
    lastSeenAt: user.lastSeenAt,
    hasPassword: Boolean(user.passwordHash),
    unusedInviteExpiresAt: await unusedInviteExpiry(user.id),
    force: opts.force,
  });

  if (decision.action === "refuse") {
    return { emailed: false, skipped: true, emailSkipped: true, refuseReason: decision.reason };
  }
  if (decision.action === "skip") {
    return {
      emailed: false,
      skipped: true,
      skipReason: decision.reason,
      emailSkipped: true,
    };
  }

  if (opts.force) {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
  }

  const { raw, hash } = generateResetToken();
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: hash,
    expires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  });
  const inviteUrl = `${env.APP_URL}/reset-password?token=${raw}`;
  const firstName = (user.name ?? "").split(" ")[0] || "there";
  const html = customerInviteEmail({
    firstName,
    customerName: opts.customerName,
    inviterName: opts.actor.name ?? opts.actor.email,
    inviteUrl,
  });
  const subject = `You're invited to PATH — ${opts.customerName}`;

  const deliver = opts.deliver ?? defaultInviteDeliver;
  try {
    const sent = await deliver({
      to: user.email,
      subject,
      html,
      replyTo: opts.actor.email,
      inviteUrl,
    });
    return {
      emailed: sent.emailed,
      skipped: false,
      inviteUrl,
      emailSkipped: !sent.emailed,
      reason: decision.reason,
    };
  } catch (err) {
    console.error("sendCustomerInvite email failed; invite link still valid", err);
    return {
      emailed: false,
      skipped: false,
      inviteUrl,
      emailSkipped: true,
      reason: decision.reason,
    };
  }
}

export type AutoInviteResult = ProvisionResult &
  Partial<SendInviteResult> & {
    invited?: boolean;
  };

/**
 * Provision + invite a single contact. Idempotent unless `force`.
 */
export async function autoInviteCustomerContact(opts: {
  customerAccountId: string;
  email: string;
  name: string;
  title?: string | null;
  phone?: string | null;
  actor: Pick<Actor, "id" | "email" | "name">;
  projectId?: string;
  memberRole?: "CUSTOMER_CONTACT" | "CUSTOMER_PROJECT_LEAD" | "CUSTOMER_BILLING";
  force?: boolean;
  deliver?: InviteDeliver;
}): Promise<AutoInviteResult> {
  const account = await db.query.customerAccounts.findFirst({
    where: eq(customerAccounts.id, opts.customerAccountId),
    columns: { id: true, name: true },
  });
  if (!account) return { ok: false, error: "That customer account no longer exists." };

  const provisioned = await provisionCustomerContact({
    customerAccountId: opts.customerAccountId,
    email: opts.email,
    name: opts.name,
    title: opts.title,
    phone: opts.phone,
  });
  if (!provisioned.ok) return provisioned;

  if (opts.projectId) {
    const role = opts.memberRole ?? "CUSTOMER_CONTACT";
    await db
      .insert(projectMembers)
      .values({ projectId: opts.projectId, userId: provisioned.userId, role })
      .onConflictDoUpdate({
        target: [projectMembers.projectId, projectMembers.userId],
        set: { role },
      });
  }

  const sent = await sendCustomerInvite({
    userId: provisioned.userId,
    actor: opts.actor,
    customerName: account.name,
    force: opts.force,
    deliver: opts.deliver,
  });

  return {
    ...provisioned,
    ...sent,
    invited: sent.emailed || Boolean(sent.inviteUrl),
  };
}

/**
 * When a PATH site is portal-enabled: add every account contact to the
 * project and invite anyone who has not yet signed in / has no pending invite.
 */
export async function autoInviteCustomerContactsForProject(opts: {
  projectId: string;
  customerAccountId: string;
  actor: Pick<Actor, "id" | "email" | "name">;
  deliver?: InviteDeliver;
}): Promise<{ invitedUserIds: string[]; skippedUserIds: string[] }> {
  const account = await db.query.customerAccounts.findFirst({
    where: eq(customerAccounts.id, opts.customerAccountId),
    columns: { id: true, name: true },
  });
  if (!account) return { invitedUserIds: [], skippedUserIds: [] };

  const contacts = await db.query.users.findMany({
    where: and(eq(users.customerAccountId, opts.customerAccountId), eq(users.role, "CUSTOMER")),
    columns: { id: true, isActive: true },
  });

  const invitedUserIds: string[] = [];
  const skippedUserIds: string[] = [];

  for (const contact of contacts) {
    if (!contact.isActive) {
      skippedUserIds.push(contact.id);
      continue;
    }
    await db
      .insert(projectMembers)
      .values({ projectId: opts.projectId, userId: contact.id, role: "CUSTOMER_CONTACT" })
      .onConflictDoNothing();

    const sent = await sendCustomerInvite({
      userId: contact.id,
      actor: opts.actor,
      customerName: account.name,
      deliver: opts.deliver,
    });
    if (sent.inviteUrl) invitedUserIds.push(contact.id);
    else skippedUserIds.push(contact.id);
  }

  return { invitedUserIds, skippedUserIds };
}
