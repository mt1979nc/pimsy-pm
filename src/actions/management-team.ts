"use server";

import { revalidatePrismSurfaces } from "@/lib/prism-surfaces";
import { asc, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { pathConfigPerson, users } from "@/db/schema";
import { requirePortfolioAccess } from "@/lib/guard";
import { canManagePrismCapacity, ForbiddenError } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { loadPathConfig, resetPathConfigCache } from "@/lib/path-config";
import type { ActionState } from "@/actions/messages";

const teamColumns = {
  id: true,
  name: true,
  email: true,
  role: true,
  title: true,
  capacityHoursPerWeek: true,
  capacityExempt: true,
  canLead: true,
  isDirector: true,
  prismTeamId: true,
  image: true,
  isActive: true,
} as const;

/** Staff roster. Flags and hours come from Settings when a person row exists. */
export async function listManagementTeam() {
  await requirePortfolioAccess();
  const config = await loadPathConfig();
  const rows = await db.query.users.findMany({
    where: ne(users.role, "CUSTOMER"),
    columns: teamColumns,
    orderBy: [asc(users.name)],
  });
  const overlay = new Map(config.people.map((person) => [person.userId, person]));
  const mapped = rows.map((row) => {
    const saved = overlay.get(row.id);
    return {
      ...row,
      canLead: saved?.canLead ?? row.canLead,
      capacityExempt: saved?.capacityExempt ?? row.capacityExempt,
      isDirector: saved?.isDirector ?? row.isDirector,
      capacityHoursPerWeek: saved?.hoursPerWeek ?? row.capacityHoursPerWeek,
    };
  });
  return {
    active: mapped.filter((row) => row.isActive),
    former: mapped.filter((row) => !row.isActive),
  };
}

export async function updateTeamMemberFlags(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePortfolioAccess();
  if (!canManagePrismCapacity(actor)) {
    throw new ForbiddenError("Prism access required.");
  }

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Missing user." };

  const target = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      capacityHoursPerWeek: true,
      capacityHidden: true,
    },
  });
  if (!target || target.role === "CUSTOMER" || !target.isActive) {
    return { error: "Staff member not found." };
  }

  const hrsRaw = formData.get("capacityHoursPerWeek")?.toString() ?? "";
  const hrs = Number.parseInt(hrsRaw, 10);
  if (!Number.isFinite(hrs) || hrs < 0 || hrs > 80) {
    return { error: "Hours/week must be between 0 and 80." };
  }

  const capacityExempt = formData.get("capacityExempt") === "on";
  const canLead = formData.get("canLead") === "on";
  const isDirector = formData.get("isDirector") === "on";
  const prismTeamIdRaw = formData.get("prismTeamId")?.toString().trim() ?? "";
  const prismTeamId = prismTeamIdRaw || null;

  await db
    .update(users)
    .set({
      capacityHoursPerWeek: hrs,
      capacityExempt,
      canLead,
      isDirector,
      prismTeamId,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  await db
    .insert(pathConfigPerson)
    .values({
      userId,
      canLead,
      capacityExempt,
      isDirector,
      capacityHidden: target.capacityHidden,
      hoursPerWeek: hrs,
    })
    .onConflictDoUpdate({
      target: pathConfigPerson.userId,
      set: { canLead, capacityExempt, isDirector, hoursPerWeek: hrs },
    });
  resetPathConfigCache();

  await audit({
    actor,
    action: "management.team.updated",
    entityType: "user",
    entityId: userId,
    summary: `${target.name ?? target.email}: ${hrs}h/wk` +
      (capacityExempt ? ", exempt" : "") +
      (canLead ? ", canLead" : "") +
      (isDirector ? ", director" : ""),
    metadata: { capacityHoursPerWeek: hrs, capacityExempt, canLead, isDirector, prismTeamId },
  });

  revalidatePrismSurfaces();
  return { ok: true };
}
