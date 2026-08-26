"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin, requireStaff } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { sendEmail, layout } from "@/lib/email";
import { env } from "@/lib/env";
import type { ActionState } from "./messages";

const inviteStaffSchema = z.object({
  email: z.email("Enter a valid email address."),
  name: z.string().trim().min(1, "Enter their name.").max(120),
  role: z.enum(["ADMIN", "MANAGER", "SPECIALIST", "MEMBER"]),
  title: z.string().trim().max(120).optional(),
  capacityHoursPerWeek: z.string().optional(),
});

export async function inviteStaff(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = inviteStaffSchema.safeParse({
    email: formData.get("email")?.toString().trim().toLowerCase(),
    name: formData.get("name"),
    role: formData.get("role") ?? "SPECIALIST",
    title: formData.get("title")?.toString() || undefined,
    capacityHoursPerWeek: formData.get("capacityHoursPerWeek")?.toString() || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const d = parsed.data;

  const existing = await db.query.users.findFirst({
    where: eq(users.email, d.email),
    columns: { id: true, role: true },
  });
  if (existing) {
    if (existing.role === "CUSTOMER") {
      return { error: "That address is already a customer contact." };
    }
    return { error: "That person already has an account." };
  }

  const [row] = await db
    .insert(users)
    .values({
      email: d.email,
      name: d.name,
      title: d.title || null,
      role: d.role,
      capacityHoursPerWeek: d.capacityHoursPerWeek ? Number(d.capacityHoursPerWeek) : 30,
    })
    .returning({ id: users.id });

  await audit({
    actor,
    action: "staff.invited",
    entityType: "user",
    entityId: row.id,
    summary: `${d.email} as ${d.role}`,
  });

  await sendEmail({
    to: d.email,
    subject: "You've been added to PIMSY Implementations",
    html: layout({
      heading: "Your account is ready",
      body: `<p style="margin:0">${escapeHtml(actor.name ?? actor.email)} added you to the PIMSY implementation workspace as <strong>${d.role.toLowerCase()}</strong>. Sign in with this email address.</p>`,
      cta: { label: "Sign in", url: `${env.APP_URL}/signin` },
    }),
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setUserRole(userId: string, role: string) {
  const actor = await requireAdmin();
  const parsed = z
    .enum(["OWNER", "ADMIN", "MANAGER", "SPECIALIST", "MEMBER"])
    .safeParse(role);
  if (!parsed.success) throw new Error("Unknown role.");

  const target = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, role: true, email: true },
  });
  if (!target) throw new Error("User not found.");
  if (target.role === "CUSTOMER") {
    throw new Error("Customer contacts cannot be promoted to staff roles.");
  }
  if (target.id === actor.id && parsed.data !== "OWNER" && actor.role === "OWNER") {
    throw new Error("You cannot remove your own owner access.");
  }

  await db.update(users).set({ role: parsed.data, updatedAt: new Date() }).where(eq(users.id, userId));
  await audit({
    actor,
    action: "user.role.changed",
    entityType: "user",
    entityId: userId,
    summary: `${target.email}: ${target.role} → ${parsed.data}`,
  });
  revalidatePath("/admin/users");
}

export async function updateOwnProfile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireStaff();
  const name = formData.get("name")?.toString().trim();
  const title = formData.get("title")?.toString().trim();
  const timeZone = formData.get("timeZone")?.toString().trim();
  const capacity = formData.get("capacityHoursPerWeek")?.toString();

  await db
    .update(users)
    .set({
      ...(name ? { name } : {}),
      ...(title !== undefined ? { title: title || null } : {}),
      ...(timeZone ? { timeZone } : {}),
      ...(capacity ? { capacityHoursPerWeek: Number(capacity) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, actor.id));

  revalidatePath("/settings");
  return { ok: true };
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
