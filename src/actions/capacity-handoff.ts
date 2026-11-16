"use server";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { projects } from "@/db/schema";
import { requirePortfolioAccess } from "@/lib/guard";
import { canManagePrismCapacity, ForbiddenError } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { parseDateInput, toDateInput } from "@/lib/dates";
import { nextPathManagedFields } from "@/lib/detail-locks";
import { revalidatePrismSurfaces } from "@/lib/prism-surfaces";
import type { ActionState } from "@/actions/messages";

/** Save or clear the date that removes a site from Team capacity tiles. */
export async function updateCapacityHandoff(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePortfolioAccess();
  if (!canManagePrismCapacity(actor)) throw new ForbiddenError("Prism access required.");

  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) return { error: "Missing project." };
  const raw = formData.get("capacityHandoffOn")?.toString() ?? "";
  const capacityHandoffOn = raw.trim() ? parseDateInput(raw) : null;
  if (raw.trim() && !capacityHandoffOn) return { error: "Handoff date must be a real date." };

  const before = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { id: true, code: true, capacityHandoffOn: true, pathManagedFields: true, archivedAt: true },
  });
  if (!before || before.archivedAt) return { error: "Engagement not found." };

  const changed = toDateInput(before.capacityHandoffOn) !== toDateInput(capacityHandoffOn);
  await db
    .update(projects)
    .set({
      capacityHandoffOn,
      ...(changed
        ? { pathManagedFields: nextPathManagedFields(before.pathManagedFields, ["capacityHandoffOn"]) }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  await audit({
    actor,
    action: "management.engagement.updated",
    entityType: "project",
    entityId: projectId,
    summary: `${before.code}: handoff date ${capacityHandoffOn ? "set" : "cleared"}`,
    metadata: { capacityHandoffOn: toDateInput(capacityHandoffOn) || null },
  });
  revalidatePrismSurfaces(projectId);
  return { ok: true, message: capacityHandoffOn ? "Handoff date saved." : "Handoff date cleared." };
}
