"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { customerAccounts, users, projectMembers, projects } from "@/db/schema";
import { requireStaff } from "@/lib/guard";
import { isAdmin, ForbiddenError } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { sendEmail, layout } from "@/lib/email";
import { env } from "@/lib/env";
import type { ActionState } from "./messages";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

const customerSchema = z.object({
  name: z.string().trim().min(1, "Practice name is required.").max(200),
  practiceType: z.string().trim().max(120).optional(),
  seatCount: z.string().optional(),
  priorSystem: z.string().trim().max(120).optional(),
  status: z.enum(["PROSPECT", "ONBOARDING", "LIVE", "AT_RISK", "CHURNED"]).optional(),
  phone: z.string().trim().max(40).optional(),
  website: z.string().trim().max(200).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(40).optional(),
  internalNotes: z.string().trim().max(10000).optional(),
});

export async function createCustomer(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireStaff();

  const parsed = customerSchema.safeParse({
    name: formData.get("name"),
    practiceType: formData.get("practiceType")?.toString() || undefined,
    seatCount: formData.get("seatCount")?.toString() || undefined,
    priorSystem: formData.get("priorSystem")?.toString() || undefined,
    status: formData.get("status")?.toString() || undefined,
    phone: formData.get("phone")?.toString() || undefined,
    website: formData.get("website")?.toString() || undefined,
    city: formData.get("city")?.toString() || undefined,
    state: formData.get("state")?.toString() || undefined,
    internalNotes: formData.get("internalNotes")?.toString() || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const d = parsed.data;

  let slug = slugify(d.name);
  for (let i = 2; i < 100; i++) {
    const clash = await db.query.customerAccounts.findFirst({
      where: eq(customerAccounts.slug, slug),
      columns: { id: true },
    });
    if (!clash) break;
    slug = `${slugify(d.name)}-${i}`;
  }

  let id: string;
  try {
    const [row] = await db
      .insert(customerAccounts)
      .values({
        name: d.name,
        slug,
        practiceType: d.practiceType || null,
        seatCount: d.seatCount ? Number(d.seatCount) : null,
        priorSystem: d.priorSystem || null,
        status: d.status ?? "ONBOARDING",
        phone: d.phone || null,
        website: d.website || null,
        city: d.city || null,
        state: d.state || null,
        internalNotes: d.internalNotes || null,
      })
      .returning({ id: customerAccounts.id });
    id = row.id;
  } catch (err) {
    console.error("createCustomer failed", err);
    return { error: "Could not create the customer. Please try again." };
  }

  await audit({
    actor,
    action: "customer.created",
    entityType: "customer_account",
    entityId: id,
    summary: d.name,
  });

  revalidatePath("/customers");
  redirect(`/customers/${id}`);
}

export async function updateCustomer(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireStaff();
  const id = String(formData.get("customerId") ?? "");
  if (!id) return { error: "Missing customer." };

  const status = formData.get("status")?.toString();
  await db
    .update(customerAccounts)
    .set({
      ...(formData.get("name") ? { name: String(formData.get("name")).trim() } : {}),
      ...(status ? { status: status as never } : {}),
      ...(formData.get("practiceType") !== null
        ? { practiceType: formData.get("practiceType")?.toString() || null }
        : {}),
      ...(formData.get("priorSystem") !== null
        ? { priorSystem: formData.get("priorSystem")?.toString() || null }
        : {}),
      ...(formData.get("seatCount") !== null
        ? {
            seatCount: formData.get("seatCount")?.toString()
              ? Number(formData.get("seatCount"))
              : null,
          }
        : {}),
      ...(formData.get("internalNotes") !== null
        ? { internalNotes: formData.get("internalNotes")?.toString() || null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(customerAccounts.id, id));

  await audit({
    actor,
    action: "customer.updated",
    entityType: "customer_account",
    entityId: id,
  });

  revalidatePath(`/customers/${id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Customer contacts — the only way an external user gets access
// ---------------------------------------------------------------------------

const inviteSchema = z.object({
  customerAccountId: z.string().min(1),
  email: z.email("Enter a valid email address."),
  name: z.string().trim().min(1, "Enter their name.").max(120),
  title: z.string().trim().max(120).optional(),
  projectId: z.string().optional(),
});

/**
 * Provision a customer contact. This is the ONLY path that creates a CUSTOMER
 * user, and it always pins them to exactly one customer account — which is what
 * makes the portal scoping airtight.
 */
export async function inviteCustomerContact(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireStaff();

  const parsed = inviteSchema.safeParse({
    customerAccountId: formData.get("customerAccountId"),
    email: formData.get("email")?.toString().trim().toLowerCase(),
    name: formData.get("name"),
    title: formData.get("title")?.toString() || undefined,
    projectId: formData.get("projectId")?.toString() || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const d = parsed.data;

  const account = await db.query.customerAccounts.findFirst({
    where: eq(customerAccounts.id, d.customerAccountId),
    columns: { id: true, name: true },
  });
  if (!account) return { error: "That customer account no longer exists." };

  const existing = await db.query.users.findFirst({
    where: eq(users.email, d.email),
    columns: { id: true, role: true, customerAccountId: true },
  });

  if (existing) {
    if (existing.role !== "CUSTOMER") {
      return { error: "That address belongs to an internal staff account." };
    }
    if (existing.customerAccountId !== d.customerAccountId) {
      return {
        error:
          "That address is already a contact for a different customer. Use a different address.",
      };
    }
  }

  let userId = existing?.id;
  if (!userId) {
    const [row] = await db
      .insert(users)
      .values({
        email: d.email,
        name: d.name,
        title: d.title || null,
        role: "CUSTOMER",
        customerAccountId: d.customerAccountId,
      })
      .returning({ id: users.id });
    userId = row.id;
  }

  if (d.projectId) {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, d.projectId),
      columns: { customerAccountId: true },
    });
    if (project?.customerAccountId === d.customerAccountId) {
      await db
        .insert(projectMembers)
        .values({ projectId: d.projectId, userId, role: "CUSTOMER_CONTACT" })
        .onConflictDoNothing();
    }
  }

  await audit({
    actor,
    action: "customer.contact.invited",
    entityType: "user",
    entityId: userId,
    summary: `${d.email} → ${account.name}`,
    metadata: { customerAccountId: d.customerAccountId },
  });

  await sendEmail({
    to: d.email,
    subject: `You've been invited to your PIMSY implementation workspace`,
    html: layout({
      heading: `Welcome, ${d.name.split(" ")[0]}`,
      body: `<p style="margin:0 0 12px">${escapeHtml(actor.name ?? actor.email)} has set up a workspace for <strong>${escapeHtml(account.name)}</strong>'s PIMSY implementation.</p>
             <p style="margin:0">You'll find your project timeline, the items we need from you, shared documents, and a direct line to your implementation team.</p>`,
      cta: { label: "Open your workspace", url: `${env.APP_URL}/signin` },
      footer:
        "Sign in with this email address — we'll send you a one-click link, so there's no password to remember. This workspace is for implementation logistics only; never post patient information here.",
    }),
    replyTo: actor.email,
  });

  revalidatePath(`/customers/${d.customerAccountId}`);
  if (d.projectId) revalidatePath(`/projects/${d.projectId}`);
  return { ok: true };
}

export async function setUserActive(userId: string, isActive: boolean) {
  const actor = await requireStaff();
  const target = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, role: true, email: true, customerAccountId: true },
  });
  if (!target) throw new ForbiddenError();
  // Deactivating internal staff is an admin action; customer contacts can be
  // managed by whoever runs the implementation.
  if (target.role !== "CUSTOMER" && !isAdmin(actor)) throw new ForbiddenError();

  await db.update(users).set({ isActive, updatedAt: new Date() }).where(eq(users.id, userId));
  await audit({
    actor,
    action: isActive ? "user.reactivated" : "user.deactivated",
    entityType: "user",
    entityId: userId,
    summary: target.email,
  });

  if (target.customerAccountId) revalidatePath(`/customers/${target.customerAccountId}`);
  revalidatePath("/admin/users");
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
