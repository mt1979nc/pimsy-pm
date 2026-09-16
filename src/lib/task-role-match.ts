/**
 * Client-safe helpers for who auto-assigns onto a task.
 *
 * Billing vs specialist vs customer-lead matching uses the live playbook
 * model already on the row: `defaultRole`, phase name, title, overlapKey,
 * and areaKey. No new tags.
 *
 * Auto-assignment is additive: a new role adds people and does not wipe
 * existing assignees (including a previous specialist or customer lead).
 */

import { canonicalStaffingRole } from "@/lib/staffing";

export type AutoAssignKind =
  | "STAFF_ALL"
  | "STAFF_BILLING"
  | "CUSTOMER_ALL"
  | "CUSTOMER_BILLING";

export type RoleMatchTask = {
  title: string;
  ownerSide: "INTERNAL" | "CUSTOMER" | string;
  defaultRole?: string | null;
  overlapKey?: string | null;
  areaKey?: string | null;
};

const BILLING_TITLE =
  /billing|claimmd|payer|invoice|authorization|auth training|payroll|payment/;

export function isBillingRelatedTask(
  task: RoleMatchTask,
  phaseName?: string | null,
): boolean {
  const role = canonicalStaffingRole(task.defaultRole);
  if (role === "T1_BILLING_SUPPORT" || role === "T2_BILLING_SUPPORT") return true;
  if (task.defaultRole === "BILLING_SUPPORT") return true;
  const phase = (phaseName ?? "").toLowerCase();
  if (phase.includes("billing")) return true;
  if (BILLING_TITLE.test(task.title.toLowerCase())) return true;
  const overlap = (task.overlapKey ?? "").toLowerCase();
  if (
    overlap.startsWith("billing_") ||
    overlap.includes("payer") ||
    overlap.includes("claimmd")
  ) {
    return true;
  }
  if ((task.areaKey ?? "").toLowerCase() === "payroll") return true;
  return false;
}

export function autoAssignKindForRole(role: string | null | undefined): AutoAssignKind | null {
  if (!role) return null;
  if (role === "CUSTOMER_PROJECT_LEAD") return "CUSTOMER_ALL";
  if (role === "CUSTOMER_BILLING") return "CUSTOMER_BILLING";
  const canonical = canonicalStaffingRole(role);
  if (role === "LEAD" || canonical === "IMPLEMENTATION_SPECIALIST") return "STAFF_ALL";
  if (canonical === "T1_BILLING_SUPPORT" || canonical === "T2_BILLING_SUPPORT") {
    return "STAFF_BILLING";
  }
  return null;
}

export function taskMatchesAutoAssign(
  task: RoleMatchTask,
  phaseName: string | null | undefined,
  kind: AutoAssignKind | null,
): boolean {
  if (!kind) return false;
  if (kind === "STAFF_ALL") return task.ownerSide === "INTERNAL";
  if (kind === "STAFF_BILLING") {
    // P1-G: billing specialist also lands on customer billing rows
    // (Billing Questionnaire), not only internal ClaimMD / T1 tasks.
    return isBillingRelatedTask(task, phaseName);
  }
  if (kind === "CUSTOMER_ALL") return task.ownerSide === "CUSTOMER";
  if (kind === "CUSTOMER_BILLING") {
    return task.ownerSide === "CUSTOMER" && isBillingRelatedTask(task, phaseName);
  }
  return false;
}

export function customerMayChangeAssignee(opts: {
  taskOwnerSide: string;
  taskVisibility: string;
  targetRole: string;
  actorAccountId: string | null | undefined;
  targetAccountId: string | null | undefined;
  targetIsProjectMember: boolean;
  removingStaff?: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (opts.taskOwnerSide !== "CUSTOMER" || opts.taskVisibility !== "SHARED") {
    return { ok: false, reason: "You can only reassign your practice's action items." };
  }
  if (opts.removingStaff) {
    return { ok: false, reason: "You cannot remove your implementation team from a task." };
  }
  if (opts.targetRole !== "CUSTOMER" || opts.targetAccountId !== opts.actorAccountId) {
    return { ok: false, reason: "You can only assign work to people on your team." };
  }
  if (!opts.targetIsProjectMember) {
    return { ok: false, reason: "That person is not on this project yet." };
  }
  return { ok: true };
}

export function customerMemberRoles(): readonly string[] {
  return ["CUSTOMER_PROJECT_LEAD", "CUSTOMER_BILLING", "CUSTOMER_CONTACT"];
}

export function isCustomerMemberRole(role: string | null | undefined): boolean {
  return Boolean(role && customerMemberRoles().includes(role));
}

/**
 * Everyone who should land on a newly materialized task from the create-site
 * roster. Specialist is added to every PIMSY (internal) row; billing support
 * is added on billing-related rows (staff tasks + customer Billing
 * Questionnaire / spreadsheet — P1-G); customer lead covers customer action
 * items; a designated customer billing contact is added on customer billing
 * rows without removing the lead.
 */
export function userIdsForNewTask(
  task: RoleMatchTask,
  phaseName: string | null | undefined,
  assignments: {
    specialistId?: string | null;
    billingSupportId?: string | null;
    t2BillingId?: string | null;
    defaultRoleAssigneeId?: string | null;
    customerLeadId?: string | null;
    customerBillingId?: string | null;
  },
): string[] {
  const ids: string[] = [];
  const add = (id?: string | null) => {
    if (id && !ids.includes(id)) ids.push(id);
  };

  if (task.ownerSide === "INTERNAL") {
    add(assignments.specialistId);
    if (isBillingRelatedTask(task, phaseName)) {
      add(assignments.billingSupportId);
      add(assignments.t2BillingId);
    }
    add(assignments.defaultRoleAssigneeId);
    return ids;
  }

  if (task.ownerSide === "CUSTOMER") {
    const billing = isBillingRelatedTask(task, phaseName);
    add(assignments.customerLeadId);
    if (billing) {
      add(assignments.customerBillingId);
      add(assignments.billingSupportId);
      add(assignments.t2BillingId);
    }
  }
  return ids;
}

export function staffingIdsFromAssignments(assignments: Record<string, string>): {
  specialistId: string | null;
  billingSupportId: string | null;
  t2BillingId: string | null;
  customerLeadId: string | null;
  customerBillingId: string | null;
} {
  return {
    specialistId:
      assignments.IMPLEMENTATION_SPECIALIST ||
      assignments.SPECIALIST ||
      assignments.LEAD ||
      null,
    billingSupportId: assignments.T1_BILLING_SUPPORT || assignments.BILLING_SUPPORT || null,
    t2BillingId: assignments.T2_BILLING_SUPPORT || null,
    customerLeadId: assignments.CUSTOMER_PROJECT_LEAD || null,
    customerBillingId: assignments.CUSTOMER_BILLING || null,
  };
}
