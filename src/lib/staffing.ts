/**
 * Project staffing roles (v1.9).
 *
 * App-level roles (OWNER / ADMIN / SPECIALIST / …) stay as they are. These
 * values live on `project_member.role` and optionally `user.staffingRole`.
 * v1.8.1 shipped SPECIALIST / RCM / BILLING_SUPPORT — those remain valid
 * aliases so existing memberships and WIP imports keep working.
 */

import type { ProjectMemberRole } from "@/db/schema";

export const STAFFING_ROLES = [
  "IMPLEMENTATION_SPECIALIST",
  "T1_BILLING_SUPPORT",
  "T2_BILLING_SUPPORT",
  "RCM_IMPLEMENTATION_SPECIALIST",
  "RCM_MANAGER",
  "IMPLEMENTATION_DIRECTOR",
  "SUPPORT_DIRECTOR",
] as const;

export type StaffingRole = (typeof STAFFING_ROLES)[number];

/** Legacy v1.8.1 values that still appear on live rows. */
export const LEGACY_STAFFING_ALIASES = {
  SPECIALIST: "IMPLEMENTATION_SPECIALIST",
  RCM: "RCM_IMPLEMENTATION_SPECIALIST",
  BILLING_SUPPORT: "T1_BILLING_SUPPORT",
} as const satisfies Record<string, StaffingRole>;

const ALIAS_TO_CANONICAL: Record<string, StaffingRole> = {
  ...LEGACY_STAFFING_ALIASES,
  IMPLEMENTATION_SPECIALIST: "IMPLEMENTATION_SPECIALIST",
  T1_BILLING_SUPPORT: "T1_BILLING_SUPPORT",
  T2_BILLING_SUPPORT: "T2_BILLING_SUPPORT",
  RCM_IMPLEMENTATION_SPECIALIST: "RCM_IMPLEMENTATION_SPECIALIST",
  RCM_MANAGER: "RCM_MANAGER",
  IMPLEMENTATION_DIRECTOR: "IMPLEMENTATION_DIRECTOR",
  SUPPORT_DIRECTOR: "SUPPORT_DIRECTOR",
};

export const STAFFING_ROLE_LABELS: Record<StaffingRole, string> = {
  IMPLEMENTATION_SPECIALIST: "Implementation Specialist",
  T1_BILLING_SUPPORT: "T1 Billing Support",
  T2_BILLING_SUPPORT: "T2 Billing Support",
  RCM_IMPLEMENTATION_SPECIALIST: "RCM Implementation Specialist",
  RCM_MANAGER: "RCM Manager",
  IMPLEMENTATION_DIRECTOR: "Implementation Director",
  SUPPORT_DIRECTOR: "Support Director",
};

/** Roles that get a site overview card even when they own no individual tasks. */
export const MANAGER_OVERVIEW_ROLES: readonly StaffingRole[] = [
  "RCM_MANAGER",
  "IMPLEMENTATION_DIRECTOR",
  "SUPPORT_DIRECTOR",
];

export const ASSIGNABLE_PROJECT_ROLES: readonly ProjectMemberRole[] = [
  "LEAD",
  "IMPLEMENTATION_SPECIALIST",
  "T1_BILLING_SUPPORT",
  "T2_BILLING_SUPPORT",
  "RCM_IMPLEMENTATION_SPECIALIST",
  "RCM_MANAGER",
  "IMPLEMENTATION_DIRECTOR",
  "SUPPORT_DIRECTOR",
  "SPECIALIST",
  "RCM",
  "BILLING_SUPPORT",
  "CONTRIBUTOR",
  "OBSERVER",
];

export function canonicalStaffingRole(
  role: string | null | undefined,
): StaffingRole | null {
  if (!role) return null;
  return ALIAS_TO_CANONICAL[role] ?? null;
}

export function staffingRoleLabel(role: string | null | undefined): string {
  const canonical = canonicalStaffingRole(role);
  if (canonical) return STAFFING_ROLE_LABELS[canonical];
  if (!role) return "Unassigned";
  if (role === "LEAD") return "Lead";
  if (role === "CONTRIBUTOR") return "Contributor";
  if (role === "OBSERVER") return "Observer";
  if (role === "CUSTOMER_CONTACT") return "Customer contact";
  return role.toLowerCase().replaceAll("_", " ");
}

export function isManagerOverviewRole(role: string | null | undefined): boolean {
  const canonical = canonicalStaffingRole(role);
  return canonical !== null && MANAGER_OVERVIEW_ROLES.includes(canonical);
}

/** Roles that match when auto-assigning a template task. */
export function roleAssignmentKeys(role: string | null | undefined): string[] {
  const canonical = canonicalStaffingRole(role);
  if (!canonical) return role ? [role] : [];
  const keys = new Set<string>([canonical]);
  if (role) keys.add(role);
  for (const [alias, target] of Object.entries(LEGACY_STAFFING_ALIASES)) {
    if (target === canonical) keys.add(alias);
  }
  return [...keys];
}

/**
 * Pick the assignee for a template task from the create-project roster.
 * Falls back to the implementation lead for specialist-owned internal work.
 */
export function resolveAssigneeForRole(
  defaultRole: string | null | undefined,
  assignments: Record<string, string>,
  fallbackLeadId: string | null,
  ownerSide: "INTERNAL" | "CUSTOMER",
): string | null {
  if (ownerSide === "CUSTOMER") return null;
  const keys = roleAssignmentKeys(defaultRole);
  for (const key of keys) {
    if (assignments[key]) return assignments[key];
  }
  const canonical = canonicalStaffingRole(defaultRole);
  if (!canonical || canonical === "IMPLEMENTATION_SPECIALIST") {
    return fallbackLeadId;
  }
  return null;
}

/** Infer a staffing role from a free-text title (seed / import). */
export function staffingRoleFromTitle(title: string | null | undefined): StaffingRole | null {
  if (!title) return null;
  const t = title.toLowerCase();
  if (t.includes("support director") || t.includes("director of support")) {
    return "SUPPORT_DIRECTOR";
  }
  if (t.includes("implementation director") || t.includes("director of implementation")) {
    return "IMPLEMENTATION_DIRECTOR";
  }
  if (t.includes("rcm manager")) return "RCM_MANAGER";
  if (t.includes("rcm") && t.includes("specialist")) return "RCM_IMPLEMENTATION_SPECIALIST";
  if (t.includes("t2") && t.includes("billing")) return "T2_BILLING_SUPPORT";
  if (t.includes("t1") && t.includes("billing")) return "T1_BILLING_SUPPORT";
  if (t.includes("billing")) return "T1_BILLING_SUPPORT";
  if (t.includes("rcm")) return "RCM_IMPLEMENTATION_SPECIALIST";
  if (t.includes("implementation specialist") || t.includes("specialist")) {
    return "IMPLEMENTATION_SPECIALIST";
  }
  return null;
}
