"use server";

import { eq } from "drizzle-orm";

import type { ActionState } from "@/actions/messages";
import { db } from "@/db";
import { projects, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { canManagePrismCapacity, ForbiddenError } from "@/lib/authz";
import { isCapacityPhase } from "@/lib/capacity-phase";
import { requirePortfolioAccess } from "@/lib/guard";
import { revalidatePrismSurfaces } from "@/lib/prism-surfaces";

export async function recordCapacityPhase(projectId: string, phase: string): Promise<ActionState> {
  const actor = await requirePortfolioAccess();
  if (!canManagePrismCapacity(actor)) {
    throw new ForbiddenError("Prism access required.");
  }
  if (!projectId) return { error: "Missing project." };
  if (!isCapacityPhase(phase)) return { error: "Pick a phase." };

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { id: true, code: true, archivedAt: true },
  });
  if (!project || project.archivedAt) return { error: "Project not found." };

  const recordedAt = new Date();
  await db
    .update(projects)
    .set({ currentPhase: phase, phaseRecordedAt: recordedAt, updatedAt: recordedAt })
    .where(eq(projects.id, projectId));

  await audit({
    actor,
    action: "project.phase.recorded",
    entityType: "project",
    entityId: projectId,
    summary: `${project.code}: phase ${phase}`,
    metadata: { phase },
  });

  revalidatePrismSurfaces(projectId);
  return { ok: true, message: "Phase recorded." };
}

export async function saveCapacityMember(input: {
  userId: string;
  capacityHoursPerWeek: number;
  capacityExempt: boolean;
  canLead: boolean;
  isDirector: boolean;
}): Promise<ActionState> {
  const actor = await requirePortfolioAccess();
  if (!canManagePrismCapacity(actor)) {
    throw new ForbiddenError("Prism access required.");
  }

  const target = await db.query.users.findFirst({
    where: eq(users.id, input.userId),
    columns: { id: true, name: true, email: true, role: true, isActive: true },
  });
  if (!target || target.role === "CUSTOMER" || !target.isActive) {
    return { error: "Staff member not found." };
  }

  const hrs = Math.round(Number(input.capacityHoursPerWeek));
  if (!Number.isFinite(hrs) || hrs < 0 || hrs > 80) {
    return { error: "Hours/week must be between 0 and 80." };
  }

  await db
    .update(users)
    .set({
      capacityHoursPerWeek: hrs,
      capacityExempt: input.capacityExempt,
      canLead: input.canLead,
      isDirector: input.isDirector,
      updatedAt: new Date(),
    })
    .where(eq(users.id, input.userId));

  await audit({
    actor,
    action: "management.team.updated",
    entityType: "user",
    entityId: input.userId,
    summary: `${target.name ?? target.email}: ${hrs}h/wk`,
    metadata: {
      capacityHoursPerWeek: hrs,
      capacityExempt: input.capacityExempt,
      canLead: input.canLead,
      isDirector: input.isDirector,
    },
  });

  revalidatePrismSurfaces();
  return { ok: true };
}
