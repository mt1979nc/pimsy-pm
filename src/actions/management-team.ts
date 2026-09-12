"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requirePortfolioAccess } from "@/lib/guard";
import { canManagePrismCapacity, ForbiddenError } from "@/lib/authz";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/actions/messages";

/** Active internal staff for the Management team roster. */
export async function listManagementTeam() {
  await requirePortfolioAccess();
  return db.query.users.findMany({
    where: and(eq(users.isActive, true), ne(users.role, "CUSTOMER")),
    columns: {
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
    },
    orderBy: [asc(users.name)],
  });
}

export async function updateTeamMemberFlags(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePortfolioAccess();
  if (!canManagePrismCapacity(actor)) {
    throw new ForbiddenError("Management access required.");
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

  revalidatePath("/management");
  revalidatePath("/management/team");
  revalidatePath("/management/forecast");
  revalidatePath("/reports/capacity");
  return { ok: true };
}
