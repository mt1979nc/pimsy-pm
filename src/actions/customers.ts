"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { customerAccounts, users } from "@/db/schema";
import { requireStaff } from "@/lib/guard";
import { isAdmin, ForbiddenError, canCreateCustomers, canDeletePortfolioRecords } from "@/lib/authz";
import { revalidatePrismSurfaces } from "@/lib/prism-surfaces";
import {
  hardDeleteCustomer,
  loadCustomerForDelete,
  planCustomerDelete,
} from "@/lib/delete-records";
import { audit } from "@/lib/audit";
import { autoAssignForProjectRole } from "@/lib/task-assignees";
import type { ActionState } from "./messages";
import {
  parseExcludeFromAnalytics,
  parseExcludeFromAnalyticsIfPresent,
} from "@/lib/analytics-exclude";
import {
  autoInviteCustomerContact,
  parseOptionalPortalContact,
  sendCustomerInvite,
  STAFF_DOMAIN_CONTACT_ERROR,
} from "@/lib/customer-invite";
import { isReservedStaffEmail } from "@/lib/internal-email";
import { revalidateAboutSurfaces, revalidateCustomerAboutSurfaces } from "@/lib/about-revalidate";

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
  if (!canCreateCustomers(actor)) return { error: "You cannot create customers." };

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

  const portalContact = parseOptionalPortalContact(formData);
  if (!portalContact.ok) return { error: portalContact.error };

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
        excludeFromAnalytics: parseExcludeFromAnalytics(formData),
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

  if (portalContact.contact) {
    const invited = await autoInviteCustomerContact({
      customerAccountId: id,
      email: portalContact.contact.email,
      name: portalContact.contact.name,
      title: portalContact.contact.title,
      actor,
    });
    if (!invited.ok) {
      console.error("createCustomer auto-invite failed", invited.error);
    } else if (invited.created || invited.inviteUrl) {
      await audit({
        actor,
        action: "customer.contact.invited",
        entityType: "user",
        entityId: invited.userId,
        summary: `${invited.email} → ${d.name}`,
        metadata: { customerAccountId: id, auto: true, skipped: invited.skipped ?? false },
      });
    }
  }

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
  const excludeFromAnalytics = parseExcludeFromAnalyticsIfPresent(formData);
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
      ...(excludeFromAnalytics !== undefined ? { excludeFromAnalytics } : {}),
      updatedAt: new Date(),
    })
    .where(eq(customerAccounts.id, id));

  await audit({
    actor,
    action: "customer.updated",
    entityType: "customer_account",
    entityId: id,
  });

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  revalidatePrismSurfaces();
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
  phone: z.string().trim().max(40).optional(),
  projectId: z.string().optional(),
  memberRole: z.enum(["CUSTOMER_CONTACT", "CUSTOMER_PROJECT_LEAD", "CUSTOMER_BILLING"]).optional(),
});

/**
 * Provision a customer contact. This is the ONLY path that creates a CUSTOMER
 * user, and it always pins them to exactly one customer account — which is what
 * makes the portal scoping airtight. Invite email is sent automatically unless
 * an unused invite is still pending or they have already signed in.
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
    phone: formData.get("phone")?.toString() || undefined,
    projectId: formData.get("projectId")?.toString() || undefined,
    memberRole: formData.get("memberRole")?.toString() || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const d = parsed.data;
  if (isReservedStaffEmail(d.email)) return { error: STAFF_DOMAIN_CONTACT_ERROR };

  const force = formData.get("resend") === "1" || formData.get("resend") === "on";

  const result = await autoInviteCustomerContact({
    customerAccountId: d.customerAccountId,
    email: d.email,
    name: d.name,
    title: d.title,
    phone: d.phone,
    actor,
    projectId: d.projectId,
    memberRole: d.memberRole,
    force,
  });
  if (!result.ok) return { error: result.error };

  if (result.refuseReason === "inactive") {
    return { error: "That contact's access is revoked. Restore access first." };
  }

  if (d.projectId && result.userId) {
    await autoAssignForProjectRole({
      projectId: d.projectId,
      userId: result.userId,
      role: d.memberRole ?? "CUSTOMER_CONTACT",
      actorId: actor.id,
    });
  }

  if (result.created || result.inviteUrl) {
    await audit({
      actor,
      action: "customer.contact.invited",
      entityType: "user",
      entityId: result.userId,
      summary: `${d.email} → customer ${d.customerAccountId}`,
      metadata: {
        customerAccountId: d.customerAccountId,
        force,
        skipped: result.skipped ?? false,
      },
    });
  }

  revalidatePath(`/customers/${d.customerAccountId}`);
  await revalidateCustomerAboutSurfaces(d.customerAccountId);
  if (d.projectId) {
    revalidatePath(`/projects/${d.projectId}`);
    revalidateAboutSurfaces({ projectId: d.projectId, customerAccountId: d.customerAccountId });
  }
  return {
    ok: true,
    inviteUrl: result.inviteUrl,
    emailSkipped: result.emailSkipped ?? true,
    inviteSkipped: result.skipped ?? false,
  };
}

/** Explicit staff resend — mints a new set-password link and emails it. */
export async function resendCustomerInvite(userId: string): Promise<ActionState> {
  const actor = await requireStaff();
  const target = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, role: true, email: true, name: true, customerAccountId: true, isActive: true },
  });
  if (!target || target.role !== "CUSTOMER" || !target.customerAccountId) {
    return { error: "That contact no longer exists." };
  }
  if (!target.isActive) return { error: "Restore access before resending an invite." };

  const account = await db.query.customerAccounts.findFirst({
    where: eq(customerAccounts.id, target.customerAccountId),
    columns: { name: true },
  });
  if (!account) return { error: "That customer account no longer exists." };

  const sent = await sendCustomerInvite({
    userId: target.id,
    actor,
    customerName: account.name,
    force: true,
  });
  if (sent.refuseReason) {
    return { error: sent.refuseReason === "internal_staff_email" ? STAFF_DOMAIN_CONTACT_ERROR : "Could not resend." };
  }

  await audit({
    actor,
    action: "customer.contact.invited",
    entityType: "user",
    entityId: target.id,
    summary: `${target.email} → ${account.name} (resend)`,
    metadata: { customerAccountId: target.customerAccountId, force: true },
  });

  revalidatePath(`/customers/${target.customerAccountId}`);
  return {
    ok: true,
    inviteUrl: sent.inviteUrl,
    emailSkipped: sent.emailSkipped,
    inviteSkipped: false,
  };
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

  if (target.customerAccountId) {
    revalidatePath(`/customers/${target.customerAccountId}`);
    await revalidateCustomerAboutSurfaces(target.customerAccountId);
  }
  revalidatePath("/admin/users");
}

export async function updateCustomerContact(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireStaff();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Missing contact." };

  const name = formData.get("name")?.toString().trim() ?? "";
  const title = formData.get("title")?.toString().trim() ?? "";
  const phone = formData.get("phone")?.toString().trim() ?? "";
  if (!name) return { error: "Enter their name." };

  const target = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, role: true, email: true, customerAccountId: true },
  });
  if (!target || target.role !== "CUSTOMER") {
    return { error: "That contact no longer exists." };
  }

  await db
    .update(users)
    .set({
      name,
      title: title || null,
      phone: phone || null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  await audit({
    actor,
    action: "customer.contact.updated",
    entityType: "user",
    entityId: userId,
    summary: target.email,
  });

  if (target.customerAccountId) {
    await revalidateCustomerAboutSurfaces(target.customerAccountId);
  }
  return { ok: true };
}

export async function deleteCustomer(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireStaff();
  const customerId = String(formData.get("customerId") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  const cascadeProjects = formData.get("cascadeProjects") === "on";
  if (!customerId) return { error: "Missing customer." };
  if (!canDeletePortfolioRecords(actor)) {
    return { error: "Only owners, admins, and managers can delete a customer." };
  }

  const loaded = await loadCustomerForDelete(customerId);
  if (!loaded) return { error: "Customer not found." };

  const planned = planCustomerDelete({
    actor,
    confirmation,
    name: loaded.customer.name,
    slug: loaded.customer.slug,
    projectCount: loaded.projects.length,
    cascadeProjects,
    linkedUsers: loaded.linkedUsers,
  });
  if (!planned.ok) return { error: planned.error };

  await hardDeleteCustomer(customerId);
  await audit({
    actor,
    action: "customer.deleted",
    entityType: "customer_account",
    entityId: customerId,
    summary: loaded.customer.name,
    metadata: {
      slug: loaded.customer.slug,
      projectCount: loaded.projects.length,
      contactCount: loaded.linkedUsers.length,
      cascadeProjects,
    },
  });
  revalidatePrismSurfaces();
  revalidatePath("/customers");
  revalidatePath("/projects");
  revalidatePath("/admin/customers");
  redirect("/customers");
}
