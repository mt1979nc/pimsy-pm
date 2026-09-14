/**
 * PATH-native bulk complete for historical sites.
 *
 * Marks open tasks DONE with a completedAt that is on/before the due date
 * (or spread across kickoff → go-live when dues are missing) so they drop off
 * overdue / upcoming-due rollups. Does not invent completions for active WIP
 * unless the site is COMPLETED, post go-live, Onboarded, archived, or cancelled.
 */

import { and, eq, ne, asc } from "drizzle-orm";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import { utcCalendarDaysBetween } from "@/lib/dates";
import { refreshProjectCounters } from "@/lib/rollup";

export type HistoricalCompleteGate =
  | "completed"
  | "cancelled"
  | "archived"
  | "post-go-live"
  | "onboarded";

export type HistoricalProjectInput = {
  id?: string;
  status?: string | null;
  onboarded?: boolean | null;
  startDate?: Date | string | null;
  actualGoLiveDate?: Date | string | null;
  targetGoLiveDate?: Date | string | null;
  archivedAt?: Date | string | null;
};

export type OpenHistoricalTask = {
  id: string;
  title?: string;
  status: string;
  notApplicable?: boolean | null;
  dueDate?: Date | string | null;
  order?: number | null;
};

export type HistoricalCompleteAssessment =
  | { ok: true; gate: HistoricalCompleteGate; kickoff: Date; end: Date }
  | { ok: false; reason: string };

export type OnTimeCompletion = {
  id: string;
  completedAt: Date;
  dueDate: Date | null;
};

export function asInstant(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** UTC noon on the calendar day — same convention as date-only form fields. */
export function utcNoon(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
}

export function addUtcDays(d: Date, days: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days, 12, 0, 0));
}

export function historicalCompleteGate(
  project: HistoricalProjectInput,
  now = new Date(),
): HistoricalCompleteGate | null {
  const status = (project.status ?? "").toUpperCase();
  if (status === "COMPLETED") return "completed";
  if (status === "CANCELLED") return "cancelled";
  if (project.archivedAt) return "archived";
  const actual = asInstant(project.actualGoLiveDate);
  if (actual && actual.getTime() < now.getTime()) return "post-go-live";
  if (project.onboarded) return "onboarded";
  return null;
}

export function resolveHistoricalWindow(
  project: HistoricalProjectInput,
): { kickoff: Date; end: Date } | null {
  const kickoff = asInstant(project.startDate);
  const end = asInstant(project.actualGoLiveDate) ?? asInstant(project.targetGoLiveDate);
  if (!kickoff || !end) return null;
  return { kickoff, end: end.getTime() < kickoff.getTime() ? kickoff : end };
}

export function assessHistoricalComplete(
  project: HistoricalProjectInput,
  now = new Date(),
): HistoricalCompleteAssessment {
  const window = resolveHistoricalWindow(project);
  if (!asInstant(project.startDate)) {
    return { ok: false, reason: "Needs a kickoff / start date." };
  }
  if (!asInstant(project.actualGoLiveDate) && !asInstant(project.targetGoLiveDate)) {
    return { ok: false, reason: "Needs a go-live or actual end date." };
  }
  if (!window) {
    return { ok: false, reason: "Needs a kickoff / start date and a go-live or actual end date." };
  }
  const gate = historicalCompleteGate(project, now);
  if (!gate) {
    return {
      ok: false,
      reason:
        "Active WIP is skipped. Mark the site Onboarded, COMPLETED, archived, or record an actual go-live first.",
    };
  }
  return { ok: true, gate, kickoff: window.kickoff, end: window.end };
}

export function isOpenHistoricalTask(task: OpenHistoricalTask): boolean {
  if (task.notApplicable) return false;
  const status = (task.status ?? "").toUpperCase();
  return status !== "DONE" && status !== "CANCELLED";
}

/** Spread n stamps evenly from kickoff through end (UTC calendar days). */
export function spreadOnTimeStamps(kickoff: Date, end: Date, count: number): Date[] {
  if (count <= 0) return [];
  const start = utcNoon(kickoff);
  const finish = utcNoon(end);
  const days = Math.max(0, utcCalendarDaysBetween(start, finish));
  if (count === 1) return [finish];
  return Array.from({ length: count }, (_, i) => addUtcDays(start, Math.round((days * i) / (count - 1))));
}

function earliestOnTime(candidates: Date[]): Date {
  let min = candidates[0]!;
  for (const c of candidates) {
    if (c.getTime() < min.getTime()) min = c;
  }
  return utcNoon(min);
}

/**
 * completedAt on/before due when a due exists; otherwise spread across the
 * kickoff → go-live window. Stamps never sit in the future.
 */
export function planOnTimeCompletions(opts: {
  kickoff: Date;
  end: Date;
  tasks: OpenHistoricalTask[];
  now?: Date;
}): OnTimeCompletion[] {
  const now = utcNoon(opts.now ?? new Date());
  const end = utcNoon(opts.end);
  const open = opts.tasks.filter(isOpenHistoricalTask);
  const missingDue = open.filter((t) => !asInstant(t.dueDate));
  const spread = spreadOnTimeStamps(opts.kickoff, opts.end, missingDue.length);
  const spreadById = new Map(missingDue.map((t, i) => [t.id, spread[i]!]));

  return open.map((t) => {
    const due = asInstant(t.dueDate);
    let completedAt: Date;
    if (due) {
      completedAt = earliestOnTime([utcNoon(due), end, now]);
      if (completedAt.getTime() > utcNoon(due).getTime()) completedAt = utcNoon(due);
    } else {
      const stamped = spreadById.get(t.id) ?? end;
      completedAt = stamped.getTime() > now.getTime() ? now : stamped;
    }
    return { id: t.id, completedAt, dueDate: due };
  });
}

export async function loadHistoricalProject(projectId: string) {
  return db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: {
      id: true,
      name: true,
      code: true,
      crmAcronym: true,
      status: true,
      onboarded: true,
      startDate: true,
      actualGoLiveDate: true,
      targetGoLiveDate: true,
      archivedAt: true,
    },
  });
}

export async function loadOpenHistoricalTasks(projectId: string): Promise<OpenHistoricalTask[]> {
  const rows = await db.query.tasks.findMany({
    where: and(
      eq(tasks.projectId, projectId),
      ne(tasks.status, "DONE"),
      ne(tasks.status, "CANCELLED"),
      eq(tasks.notApplicable, false),
    ),
    columns: { id: true, title: true, status: true, notApplicable: true, dueDate: true, order: true },
    orderBy: [asc(tasks.order), asc(tasks.title)],
  });
  return rows;
}

export async function applyOnTimeCompletions(
  projectId: string,
  patches: OnTimeCompletion[],
): Promise<number> {
  if (patches.length === 0) return 0;
  const now = new Date();
  for (const patch of patches) {
    await db
      .update(tasks)
      .set({
        status: "DONE",
        completedAt: patch.completedAt,
        updatedAt: now,
      })
      .where(eq(tasks.id, patch.id));
  }
  await refreshProjectCounters(projectId);
  return patches.length;
}

export async function completeHistoricalProjectOnTime(
  projectId: string,
  opts: { apply: boolean; now?: Date } = { apply: false },
): Promise<{
  assessment: HistoricalCompleteAssessment;
  planned: OnTimeCompletion[];
  applied: number;
}> {
  const project = await loadHistoricalProject(projectId);
  if (!project) {
    return {
      assessment: { ok: false, reason: "Project not found." },
      planned: [],
      applied: 0,
    };
  }
  const assessment = assessHistoricalComplete(project, opts.now);
  if (!assessment.ok) return { assessment, planned: [], applied: 0 };
  const open = await loadOpenHistoricalTasks(projectId);
  const planned = planOnTimeCompletions({
    kickoff: assessment.kickoff,
    end: assessment.end,
    tasks: open,
    now: opts.now,
  });
  if (!opts.apply || planned.length === 0) {
    return { assessment, planned, applied: 0 };
  }
  const applied = await applyOnTimeCompletions(projectId, planned);
  return { assessment, planned, applied };
}
