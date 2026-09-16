/**
 * Complete (or reopen) playbook milestones from section task completion.
 *
 * Matching is by name: "Discovery materials received" ↔ Discovery, etc.
 * The Go-Live milestone (`isGoLive`) stays manual — that is a business event,
 * not "every checklist row is ticked".
 */

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { milestones, phases, tasks } from "@/db/schema";

export type RollupMilestone = {
  id: string;
  name: string;
  isGoLive: boolean;
  completedAt: Date | null;
};

export type RollupPhase = { id: string; name: string };

export type RollupTask = {
  phaseId: string | null;
  status: string;
  notApplicable: boolean;
};

type KeywordPair = { milestone: RegExp; phase: RegExp; score: number };

const KEYWORD_PAIRS: KeywordPair[] = [
  { milestone: /\brcm kickoff\b/, phase: /\brcm kickoff\b/, score: 12 },
  { milestone: /\bkickoff\b/, phase: /\bkickoff\b/, score: 10 },
  { milestone: /\bdiscovery\b/, phase: /\bdiscovery\b/, score: 10 },
  { milestone: /\bconfiguration\b|\bsite config/, phase: /\bconfiguration\b/, score: 10 },
  { milestone: /\bimport\b/, phase: /\bimport\b/, score: 10 },
  { milestone: /\bcore training\b/, phase: /\bcore\b|\btrain the trainer\b/, score: 10 },
  { milestone: /\breadiness\b|\bsign-?off\b/, phase: /\bgo-live checklist\b/, score: 10 },
  { milestone: /\btier 2\b/, phase: /\btier 2\b/, score: 10 },
  { milestone: /\bpayer\b/, phase: /\bpayer\b/, score: 10 },
  { milestone: /\bclean claim\b/, phase: /\bhandoff\b|\bworkflow\b/, score: 8 },
];

export function matchMilestonePhaseId(
  milestoneName: string,
  phaseList: RollupPhase[],
): string | null {
  const m = milestoneName.toLowerCase();
  let best: { id: string; score: number } | null = null;
  for (const phase of phaseList) {
    const p = phase.name.toLowerCase();
    let score = 0;
    for (const pair of KEYWORD_PAIRS) {
      if (pair.milestone.test(m) && pair.phase.test(p)) {
        score = Math.max(score, pair.score);
      }
    }
    if (m.includes("rcm") === p.includes("rcm")) {
      if (score > 0) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { id: phase.id, score };
    }
  }
  return best?.id ?? null;
}

export function phaseClearedByTasks(phaseTasks: RollupTask[]): boolean {
  if (phaseTasks.length === 0) return false;
  const countable = phaseTasks.filter((t) => !t.notApplicable && t.status !== "CANCELLED");
  if (countable.length === 0) return true;
  return countable.every((t) => t.status === "DONE");
}

export type MilestoneRollupPatch = {
  id: string;
  completedAt: Date | null;
  action: "complete" | "reopen";
};

/**
 * Pure rollup: which milestones should complete or reopen given live tasks.
 * Skips `isGoLive`. Phases with no tasks are left alone.
 */
export function milestoneRollupPatches(opts: {
  milestones: RollupMilestone[];
  phases: RollupPhase[];
  tasks: RollupTask[];
  now?: Date;
}): MilestoneRollupPatch[] {
  const now = opts.now ?? new Date();
  const out: MilestoneRollupPatch[] = [];

  for (const ms of opts.milestones) {
    if (ms.isGoLive) continue;
    const phaseId = matchMilestonePhaseId(ms.name, opts.phases);
    if (!phaseId) continue;
    const phaseTasks = opts.tasks.filter((t) => t.phaseId === phaseId);
    if (phaseTasks.length === 0) continue;
    const cleared = phaseClearedByTasks(phaseTasks);
    if (cleared && !ms.completedAt) {
      out.push({ id: ms.id, completedAt: now, action: "complete" });
    } else if (!cleared && ms.completedAt) {
      out.push({ id: ms.id, completedAt: null, action: "reopen" });
    }
  }

  return out;
}

/** Apply rollup to the live project. Safe to call after any task mutation. */
export async function syncMilestonesFromTaskCompletion(projectId: string): Promise<MilestoneRollupPatch[]> {
  const [msRows, phaseRows, taskRows] = await Promise.all([
    db.query.milestones.findMany({
      where: eq(milestones.projectId, projectId),
      columns: { id: true, name: true, isGoLive: true, completedAt: true },
    }),
    db.query.phases.findMany({
      where: eq(phases.projectId, projectId),
      columns: { id: true, name: true },
    }),
    db.query.tasks.findMany({
      where: eq(tasks.projectId, projectId),
      columns: { phaseId: true, status: true, notApplicable: true },
    }),
  ]);

  const patches = milestoneRollupPatches({
    milestones: msRows,
    phases: phaseRows,
    tasks: taskRows,
  });

  for (const patch of patches) {
    await db
      .update(milestones)
      .set({ completedAt: patch.completedAt, updatedAt: new Date() })
      .where(eq(milestones.id, patch.id));
  }

  return patches;
}
