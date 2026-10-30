/**
 * People added in Settings, and the flags import must not reset.
 * No database here. The action and the seed scripts call these helpers.
 */

export const ADDABLE_STAFF_ROLES = ["SPECIALIST", "MEMBER", "MANAGER", "ADMIN"] as const;
export type AddableStaffRole = (typeof ADDABLE_STAFF_ROLES)[number];

export const STAFF_ROLE_LABELS: Record<AddableStaffRole, string> = {
  SPECIALIST: "Specialist",
  MEMBER: "Member",
  MANAGER: "Manager",
  ADMIN: "Admin",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type NewTeamMember = {
  name: string;
  email: string;
  role: AddableStaffRole;
  title: string;
  canLead: boolean;
  capacityExempt: boolean;
  isDirector: boolean;
};

export function isAddableStaffRole(value: string): value is AddableStaffRole {
  return (ADDABLE_STAFF_ROLES as readonly string[]).includes(value);
}

export function titleForStaffRole(role: AddableStaffRole): string {
  if (role === "SPECIALIST") return "Implementation Specialist";
  if (role === "MANAGER") return "Manager";
  if (role === "ADMIN") return "Admin";
  return "Member";
}

export function parseNewTeamMember(input: {
  name: string;
  email: string;
  role: string;
  canLead: boolean;
  capacityExempt: boolean;
  isDirector: boolean;
}): { ok: true; value: NewTeamMember } | { ok: false; error: string } {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Name needs 2–80 characters." };
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 120) return { ok: false, error: "Email is not valid." };
  if (!isAddableStaffRole(input.role)) return { ok: false, error: "Role must be Specialist, Member, Manager, or Admin." };
  return {
    ok: true,
    value: {
      name,
      email,
      role: input.role,
      title: titleForStaffRole(input.role),
      canLead: input.canLead,
      capacityExempt: input.capacityExempt,
      isDirector: input.isDirector,
    },
  };
}

type StaffFlags = { canLead: boolean; capacityExempt: boolean; isDirector: boolean };

/**
 * Existing people keep lead, exempt, and director.
 * Someone added in Settings is skipped entirely so import cannot rewrite them.
 * A missing row is inserted as given.
 */
export function preserveExistingStaff<T extends StaffFlags>(
  incoming: T,
  existing: { pathManaged: boolean } | null,
): T | "skip" | Omit<T, keyof StaffFlags> {
  if (!existing) return incoming;
  if (existing.pathManaged) return "skip";
  const { canLead: _canLead, capacityExempt: _exempt, isDirector: _director, ...rest } = incoming;
  return rest;
}
