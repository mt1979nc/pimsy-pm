/**
 * Permanent delete of a project or customer account.
 *
 * Child rows follow existing FK onDelete: cascade (tasks, threads, slips,
 * memberships, scope, files, …). Staff users are never deleted: a customer
 * account may only be removed when every linked user is a CUSTOMER contact
 * (portal login), not OWNER/ADMIN/MANAGER/SPECIALIST/MEMBER.
 */

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { customerAccounts, projects, users } from "@/db/schema";
import { isProtectedStaffEmail } from "@/lib/demo-entities";
import type { Actor } from "@/lib/authz";
import { canDeletePortfolioRecords } from "@/lib/authz";

export function normalizeConfirmToken(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function confirmationMatches(
  typed: string | null | undefined,
  candidates: Array<string | null | undefined>,
): boolean {
  const token = normalizeConfirmToken(typed);
  if (!token) return false;
  return candidates.some((c) => {
    const n = normalizeConfirmToken(c);
    return n.length > 0 && n === token;
  });
}

export type LinkedAccountUser = {
  id: string;
  email: string | null;
  role: string;
  name?: string | null;
};

/** Staff (or protected named staff) that must not be removed by customer delete. */
export function staffUsersBlockingCustomerDelete(linked: LinkedAccountUser[]): LinkedAccountUser[] {
  return linked.filter((u) => {
    if (isProtectedStaffEmail(u.email)) return true;
    return u.role !== "CUSTOMER";
  });
}

export function planProjectDelete(input: {
  actor: Pick<Actor, "role">;
  confirmation: string;
  name: string;
  code: string;
  acronym?: string | null;
}): { ok: true } | { ok: false; error: string } {
  if (!canDeletePortfolioRecords(input.actor)) {
    return { ok: false, error: "Only owners, admins, and managers can delete a project." };
  }
  if (!confirmationMatches(input.confirmation, [input.name, input.code, input.acronym])) {
    return {
      ok: false,
      error: "Type the project acronym or name exactly to confirm delete.",
    };
  }
  return { ok: true };
}

export function planCustomerDelete(input: {
  actor: Pick<Actor, "role">;
  confirmation: string;
  name: string;
  slug: string;
  projectCount: number;
  cascadeProjects: boolean;
  linkedUsers: LinkedAccountUser[];
}): { ok: true } | { ok: false; error: string } {
  if (!canDeletePortfolioRecords(input.actor)) {
    return { ok: false, error: "Only owners, admins, and managers can delete a customer." };
  }
  const blockers = staffUsersBlockingCustomerDelete(input.linkedUsers);
  if (blockers.length > 0) {
    const who = blockers
      .map((u) => u.email || u.name || u.id)
      .slice(0, 4)
      .join(", ");
    return {
      ok: false,
      error: `This account is linked to staff users (${who}). Staff accounts are never deleted here — unlink them first.`,
    };
  }
  if (!confirmationMatches(input.confirmation, [input.name, input.slug])) {
    return { ok: false, error: "Type the customer name to confirm delete." };
  }
  if (input.projectCount > 0 && !input.cascadeProjects) {
    const n = input.projectCount;
    return {
      ok: false,
      error: `This account still has ${n} project${n === 1 ? "" : "s"}. Delete those first, or check “Also delete projects”.`,
    };
  }
  return { ok: true };
}

export async function hardDeleteProject(projectId: string): Promise<void> {
  await db.delete(projects).where(eq(projects.id, projectId));
}

export async function hardDeleteCustomer(customerId: string): Promise<void> {
  await db.delete(customerAccounts).where(eq(customerAccounts.id, customerId));
}

export async function loadProjectForDelete(projectId: string) {
  return db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: {
      id: true,
      name: true,
      code: true,
      crmAcronym: true,
      prismClientId: true,
      customerAccountId: true,
    },
  });
}

export async function loadCustomerForDelete(customerId: string) {
  const customer = await db.query.customerAccounts.findFirst({
    where: eq(customerAccounts.id, customerId),
    columns: { id: true, name: true, slug: true },
  });
  if (!customer) return null;
  const [projectRows, linkedUsers] = await Promise.all([
    db.query.projects.findMany({
      where: eq(projects.customerAccountId, customerId),
      columns: { id: true, code: true, name: true },
    }),
    db.query.users.findMany({
      where: eq(users.customerAccountId, customerId),
      columns: { id: true, email: true, role: true, name: true },
    }),
  ]);
  return { customer, projects: projectRows, linkedUsers };
}
