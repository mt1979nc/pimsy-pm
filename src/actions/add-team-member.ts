"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { pathConfigPerson, users } from "@/db/schema";
import type { ActionState } from "@/actions/messages";
import { isAdmin, ForbiddenError } from "@/lib/authz";
import { requireStaff } from "@/lib/guard";
import { resetPathConfigCache } from "@/lib/path-config";
import { staffingRoleFromTitle } from "@/lib/staffing";
import { parseNewTeamMember } from "@/lib/team-member";

const HOURS = 30;

/** Owner or admin. Creates the login and the Settings person row together. */
export async function addTeamMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireStaff();
  if (!isAdmin(actor)) throw new ForbiddenError("Only an owner or admin can add a team member.");

  const parsed = parseNewTeamMember({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
    canLead: formData.get("canLead") === "on",
    capacityExempt: formData.get("capacityExempt") === "on",
    isDirector: formData.get("isDirector") === "on",
  });
  if (!parsed.ok) return { error: parsed.error };
  const person = parsed.value;

  const existing = await db.query.users.findFirst({
    where: eq(users.email, person.email),
    columns: { id: true },
  });
  if (existing) return { error: "That email is already on the team." };

  const [created] = await db
    .insert(users)
    .values({
      name: person.name,
      email: person.email,
      role: person.role,
      title: person.title,
      isActive: true,
      capacityHoursPerWeek: HOURS,
      canLead: person.canLead,
      capacityExempt: person.capacityExempt,
      isDirector: person.isDirector,
      pathManaged: true,
      staffingRole: staffingRoleFromTitle(person.title),
    })
    .returning({ id: users.id });
  if (!created) return { error: "Could not add that person." };

  await db.insert(pathConfigPerson).values({
    userId: created.id,
    canLead: person.canLead,
    capacityExempt: person.capacityExempt,
    isDirector: person.isDirector,
    capacityHidden: false,
    hoursPerWeek: HOURS,
  });
  resetPathConfigCache();
  revalidatePath("/settings");
  revalidatePath("/management/team");
  revalidatePath("/management/engagements");
  return { ok: true, message: `${person.name} added.` };
}
