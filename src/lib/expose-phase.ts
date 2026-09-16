/**
 * Completing a Dock “Expose … tab” reminder flips that live phase to SHARED.
 * Same visibility column as the eyelid control — no second flag.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { phases } from "@/db/schema";
import {
  phaseMatchesExposeTarget,
  phaseNameToExposeFromTaskTitle,
} from "@/lib/dock-phase-visibility";

export async function exposePhaseFromCompletedTask(opts: {
  projectId: string;
  taskTitle: string;
}): Promise<{ phaseId: string; name: string } | null> {
  const target = phaseNameToExposeFromTaskTitle(opts.taskTitle);
  if (!target) return null;

  const rows = await db.query.phases.findMany({
    where: eq(phases.projectId, opts.projectId),
    columns: { id: true, name: true, visibility: true, notApplicable: true },
  });
  const match = rows.find((p) => !p.notApplicable && phaseMatchesExposeTarget(p.name, target));
  if (!match) return null;
  if (match.visibility === "SHARED") return { phaseId: match.id, name: match.name };

  await db.update(phases).set({ visibility: "SHARED" }).where(eq(phases.id, match.id));
  return { phaseId: match.id, name: match.name };
}
