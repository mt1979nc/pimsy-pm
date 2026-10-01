"use server";

import { eq } from "drizzle-orm";

import type { ActionState } from "@/actions/messages";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { audit } from "@/lib/audit";
import { isCeoStatusToken, parseCeoStatus, parseExpectedArr } from "@/lib/ceo-book";
import { parseDateInput } from "@/lib/dates";
import { requirePortfolioAccess } from "@/lib/guard";
import { revalidatePrismSurfaces } from "@/lib/prism-surfaces";

/**
 * Save the three CEO-sheet cells PATH does not already derive:
 * contract date, expected ARR, and CEO status.
 */
export async function updateCeoBookFields(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePortfolioAccess();
  const projectId = String(formData.get("projectId") ?? "").trim();
  if (!projectId) return { error: "Missing site." };

  const contractRaw = formData.get("contractDate")?.toString() ?? "";
  const contractTrimmed = contractRaw.trim();
  let contractDate: Date | null = null;
  if (contractTrimmed) {
    contractDate = parseDateInput(contractTrimmed);
    if (!contractDate) return { error: "Contract date must be a real date." };
  }

  const arr = parseExpectedArr(formData.get("expectedArr")?.toString());
  if (!arr.ok) return { error: arr.error };

  const statusRaw = formData.get("ceoStatus")?.toString() ?? "";
  if (!isCeoStatusToken(statusRaw)) return { error: "Pick a status from the list." };
  const ceoStatus = parseCeoStatus(statusRaw);

  const [project] = await db
    .select({
      id: projects.id,
      code: projects.code,
      type: projects.type,
      archivedAt: projects.archivedAt,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project || project.archivedAt || project.type !== "IMPLEMENTATION") {
    return { error: "That site is not on the executive book." };
  }

  await db
    .update(projects)
    .set({
      contractDate,
      expectedArr: arr.value,
      ceoStatus,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  await audit({
    actor,
    action: "project.ceo_book_updated",
    entityType: "project",
    entityId: projectId,
    summary: `${project.code}: executive book`,
    metadata: {
      contractDate: contractDate?.toISOString() ?? null,
      expectedArr: arr.value,
      ceoStatus,
    },
  });

  revalidatePrismSurfaces(projectId);
  return { ok: true, message: "Saved." };
}
