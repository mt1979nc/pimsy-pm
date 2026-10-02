/**
 * Project staffing roles (v1.9).
 *
 * App-level roles (OWNER / ADMIN / SPECIALIST / …) stay as they are. These
 * values live on `project_member.role` and optionally `user.staffingRole`.
 * v1.8.1 shipped SPECIALIST / RCM / BILLING_SUPPORT. Those stay as a read
 * path for rows already stored. New writes use the canonical names below.
 * No schema migrate — the enum values are not dropped in this release.
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

/**
 * Read path only. Live `project_member.role` rows may still say SPECIALIST,
 * RCM, or BILLING_SUPPORT. Do not add new call sites — use
 * `canonicalStaffingRole` or `userIdForStaffingRole`. Drop this map after
 * those rows are rewritten. Not exported.
 */
const LEGACY_STAFFING_ALIASES = {
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

/**
 * Roles a template task can name as its default assignee. These are staffing /
 * playbook roles — never a person. Customer lead + billing sit beside the
 * PATH team roles already used for auto-assign.
 */
export const TEMPLATE_ASSIGNEE_ROLES = [
  ...STAFFING_ROLES,
  "CUSTOMER_PROJECT_LEAD",
  "CUSTOMER_BILLING",
] as const;

export type TemplateAssigneeRole = (typeof TEMPLATE_ASSIGNEE_ROLES)[number];

export const CUSTOMER_TEMPLATE_ROLES = [
  "CUSTOMER_PROJECT_LEAD",
  "CUSTOMER_BILLING",
] as const satisfies readonly TemplateAssigneeRole[];

/** Roles that get a site overview card even when they own no individual tasks. */
export const MANAGER_OVERVIEW_ROLES: readonly StaffingRole[] = [
  "RCM_MANAGER",
  "IMPLEMENTATION_DIRECTOR",
  "SUPPORT_DIRECTOR",
];

/** Roles a project member form may store. Legacy aliases are rewritten, not listed. */
export const ASSIGNABLE_PROJECT_ROLES: readonly ProjectMemberRole[] = [
  "LEAD",
  ...STAFFING_ROLES,
  "CONTRIBUTOR",
  "OBSERVER",
  "CUSTOMER_CONTACT",
  "CUSTOMER_PROJECT_LEAD",
  "CUSTOMER_BILLING",
];

/**
 * Canonical role for a new write. SPECIALIST / RCM / BILLING_SUPPORT become
 * the v1.9 names. Unknown strings return null.
 */
export function normalizeAssignableProjectRole(
  raw: string | null | undefined,
): ProjectMemberRole | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const canonical = canonicalStaffingRole(value);
  if (canonical) return canonical;
  if ((ASSIGNABLE_PROJECT_ROLES as readonly string[]).includes(value)) {
    return value as ProjectMemberRole;
  }
  return null;
}

/** Roster id for a canonical staffing role, including a legacy assignment key. */
export function userIdForStaffingRole(
  assignments: Record<string, string | null | undefined>,
  role: StaffingRole,
): string | null {
  const direct = assignments[role];
  if (direct) return direct;
  for (const [alias, target] of Object.entries(LEGACY_STAFFING_ALIASES)) {
    if (target === role && assignments[alias]) return assignments[alias];
  }
  return null;
}

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
  if (role === "CUSTOMER_PROJECT_LEAD") return "Customer project lead";
  if (role === "CUSTOMER_BILLING") return "Customer billing";
  return role.toLowerCase().replaceAll("_", " ");
}

/** Sort key for About implementation-team cards (lead, then playbook roles). */
export function staffingRoleRank(role: string | null | undefined): number {
  if (role === "LEAD") return 0;
  const canonical = canonicalStaffingRole(role);
  if (canonical) return 1 + STAFFING_ROLES.indexOf(canonical);
  if (role === "CONTRIBUTOR") return 20;
  if (role === "OBSERVER") return 21;
  if (role === "CUSTOMER_CONTACT") return 90;
  return 40;
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
 * Persist / parse a template task's default assignee role (never a user id).
 * Legacy staffing aliases are stored as the canonical role.
 */
export function parseTemplateDefaultRole(
  raw: string | null | undefined,
): ProjectMemberRole | null {
  return normalizeAssignableProjectRole(raw);
}

export function isCustomerTemplateRole(role: string | null | undefined): boolean {
  return Boolean(role && (CUSTOMER_TEMPLATE_ROLES as readonly string[]).includes(role));
}

export function suggestedTemplateDefaultRole(
  ownerSide: "INTERNAL" | "CUSTOMER",
): TemplateAssigneeRole {
  return ownerSide === "CUSTOMER" ? "CUSTOMER_PROJECT_LEAD" : "IMPLEMENTATION_SPECIALIST";
}

/**
 * Pick the assignee for a template task from the create-project roster.
 * Looks up the named default role first (staff or customer). Falls back to
 * the implementation lead only for specialist-owned internal work. Missing
 * role holders return null — callers leave the task unassigned.
 */
export function resolveAssigneeForRole(
  defaultRole: string | null | undefined,
  assignments: Record<string, string>,
  fallbackLeadId: string | null,
  ownerSide: "INTERNAL" | "CUSTOMER",
): string | null {
  const keys = roleAssignmentKeys(defaultRole);
  for (const key of keys) {
    if (assignments[key]) return assignments[key];
  }
  if (ownerSide === "CUSTOMER") return null;
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
