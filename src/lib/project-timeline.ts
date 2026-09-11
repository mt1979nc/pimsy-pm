/**
 * Prism kickoff → go-live timeline scaling.
 *
 * Playbook templates carry static `offsetDays` / `durationDays` on a nominal
 * duration (e.g. 90). When an implementation has a kickoff and a target/forecast
 * go-live, those offsets are scaled so the whole playbook fits the window.
 *
 * Used by project create and management engagement updates so the math cannot
 * diverge between the two paths. A recorded slip is a schedule push: it moves
 * `targetGoLiveDate` and then cascades open phase/task dates through this helper.
 */

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { milestones, phases, projectTemplates, tasks } from "@/db/schema";
import { addDays, differenceInCalendarDays } from "@/lib/dates";

const MS_PER_DAY = 86_400_000;

export type TimelineScaleSource = "forecast" | "target" | "template";

export type ResolvedPlaybookScale = {
  kickoff: Date;
  /** Effective go-live used for scaling (explicit target, forecast, or template end). */
  goLive: Date;
  calendarDays: number;
  scaleFactor: number;
  source: TimelineScaleSource;
};

/** Calendar span from kickoff to go-live (date-fns calendar days). */
export function calendarDaysBetween(start: Date, end: Date): number {
  return Math.max(0, differenceInCalendarDays(end, start));
}

export function computeScaleFactor(
  windowCalendarDays: number | null | undefined,
  templateDurationDays: number | null | undefined,
): number {
  if (
    windowCalendarDays == null ||
    windowCalendarDays <= 0 ||
    templateDurationDays == null ||
    templateDurationDays <= 0
  ) {
    return 1;
  }
  return windowCalendarDays / templateDurationDays;
}

export function scaleDays(days: number, scaleFactor: number): number {
  return Math.max(0, Math.round(days * scaleFactor));
}

/**
 * Resolve kickoff→go-live window length and the scale to apply to template
 * offsets. Priority: forecast scenario days → explicit target → template default
 * (scaleFactor 1).
 */
export function resolvePlaybookScale(opts: {
  kickoff: Date;
  templateDurationDays: number;
  forecastCalendarDays?: number | null;
  targetGoLive?: Date | null;
}): ResolvedPlaybookScale {
  const { kickoff, templateDurationDays } = opts;

  if (opts.forecastCalendarDays != null && opts.forecastCalendarDays > 0) {
    return {
      kickoff,
      goLive: addDays(kickoff, opts.forecastCalendarDays),
      calendarDays: opts.forecastCalendarDays,
      scaleFactor: computeScaleFactor(opts.forecastCalendarDays, templateDurationDays),
      source: "forecast",
    };
  }

  if (opts.targetGoLive && !Number.isNaN(opts.targetGoLive.getTime())) {
    const calendarDays = calendarDaysBetween(kickoff, opts.targetGoLive);
    const days = Math.max(calendarDays, 1);
    return {
      kickoff,
      goLive: opts.targetGoLive,
      calendarDays: days,
      scaleFactor: computeScaleFactor(days, templateDurationDays),
      source: "target",
    };
  }

  const days = Math.max(templateDurationDays, 1);
  return {
    kickoff,
    goLive: addDays(kickoff, days),
    calendarDays: days,
    scaleFactor: 1,
    source: "template",
  };
}

/** Start/due from a phase- or task-relative offset, after scaling. */
export function scheduleFromOffsets(opts: {
  anchor: Date;
  offsetDays: number;
  durationDays: number;
  scaleFactor: number;
}): { startDate: Date; dueDate: Date } {
  const startDate = addDays(opts.anchor, scaleDays(opts.offsetDays, opts.scaleFactor));
  const dueDate = addDays(startDate, scaleDays(opts.durationDays, opts.scaleFactor));
  return { startDate, dueDate };
}

export function isOpenTaskStatus(status: string): boolean {
  return status !== "DONE" && status !== "CANCELLED";
}

export function isOpenPhaseStatus(status: string): boolean {
  return status !== "COMPLETED" && status !== "SKIPPED";
}

/**
 * Map a date from an old kickoff→go-live window into a new one, preserving
 * fractional position along the timeline.
 */
export function mapDateAcrossWindows(
  date: Date | null | undefined,
  oldKickoff: Date,
  oldCalendarDays: number,
  newKickoff: Date,
  newCalendarDays: number,
): Date | null {
  if (!date) return null;
  const oldLen = Math.max(oldCalendarDays, 1) * MS_PER_DAY;
  const newLen = Math.max(newCalendarDays, 1) * MS_PER_DAY;
  const offsetMs = date.getTime() - oldKickoff.getTime();
  const ratio = offsetMs / oldLen;
  return new Date(newKickoff.getTime() + ratio * newLen);
}

function sameInstant(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
}

export type CascadeWindow = {
  kickoff: Date;
  goLive: Date;
  calendarDays: number;
  source: TimelineScaleSource;
};

export function resolveCascadeWindow(opts: {
  kickoff: Date | null;
  goLive: Date | null;
  forecastCalendarDays?: number | null;
}): CascadeWindow | null {
  if (!opts.kickoff) return null;
  if (opts.goLive) {
    const calendarDays = Math.max(calendarDaysBetween(opts.kickoff, opts.goLive), 1);
    return {
      kickoff: opts.kickoff,
      goLive: opts.goLive,
      calendarDays,
      source: "target",
    };
  }
  if (opts.forecastCalendarDays != null && opts.forecastCalendarDays > 0) {
    return {
      kickoff: opts.kickoff,
      goLive: addDays(opts.kickoff, opts.forecastCalendarDays),
      calendarDays: opts.forecastCalendarDays,
      source: "forecast",
    };
  }
  return null;
}

/**
 * Decide whether an engagement/project save should cascade-reschedule open work.
 */
export function shouldCascadeReschedule(opts: {
  previousKickoff: Date | null;
  previousGoLive: Date | null;
  previousForecastCalendarDays?: number | null;
  nextKickoff: Date | null;
  nextGoLive: Date | null;
  nextForecastCalendarDays?: number | null;
}): {
  cascade: boolean;
  previous: CascadeWindow | null;
  next: CascadeWindow | null;
} {
  const next = resolveCascadeWindow({
    kickoff: opts.nextKickoff,
    goLive: opts.nextGoLive,
    forecastCalendarDays: opts.nextForecastCalendarDays,
  });
  if (!next) return { cascade: false, previous: null, next: null };

  const previous = resolveCascadeWindow({
    kickoff: opts.previousKickoff,
    goLive: opts.previousGoLive,
    forecastCalendarDays: opts.previousForecastCalendarDays,
  });

  const kickoffChanged = !sameInstant(opts.previousKickoff, opts.nextKickoff);
  const goLiveChanged = !sameInstant(opts.previousGoLive, opts.nextGoLive);
  const usingForecast =
    !opts.nextGoLive &&
    opts.nextForecastCalendarDays != null &&
    opts.nextForecastCalendarDays > 0;
  const forecastChanged =
    usingForecast &&
    (opts.previousForecastCalendarDays ?? null) !== (opts.nextForecastCalendarDays ?? null);

  const newlySchedulable = !previous && !!next;

  const cascade =
    newlySchedulable ||
    (previous != null &&
      (kickoffChanged ||
        goLiveChanged ||
        forecastChanged ||
        previous.calendarDays !== next.calendarDays ||
        !sameInstant(previous.kickoff, next.kickoff)));

  return { cascade, previous, next };
}

/**
 * Resolve a slip into a pushed go-live. Slip = schedule push, not a note.
 * Requires either a new target date different from the current one, or +slipDays
 * against an existing go-live. Rejects cause/note-only slips.
 */
export function resolveSlipPush(opts: {
  currentGoLive: Date | null;
  requestedGoLive: Date | null;
  slipDaysRaw: string | undefined;
  slipCause: string | undefined;
  slipNote: string | undefined;
}):
  | { ok: true; nextGoLive: Date | null; slipped: false }
  | {
      ok: true;
      nextGoLive: Date;
      slipped: true;
      fromDate: Date;
      days: number;
      cause: "CUSTOMER" | "PIMSY" | null;
      note: string | null;
    }
  | { ok: false; error: string } {
  const cause =
    opts.slipCause === "CUSTOMER" || opts.slipCause === "PIMSY" ? opts.slipCause : null;
  const note = opts.slipNote?.trim() ? opts.slipNote.trim() : null;
  const hasSlipMeta = Boolean(cause || note || (opts.slipDaysRaw && opts.slipDaysRaw.trim() !== ""));

  let slipDays: number | null = null;
  if (opts.slipDaysRaw != null && opts.slipDaysRaw.trim() !== "") {
    const n = Number.parseInt(opts.slipDaysRaw.trim(), 10);
    if (!Number.isFinite(n) || n === 0) {
      return { ok: false, error: "Slip days must be a non-zero whole number (e.g. +7 or -3)." };
    }
    slipDays = n;
  }

  const current = opts.currentGoLive;
  const requested = opts.requestedGoLive;

  // Explicit new date that differs from current → that's the push.
  if (requested && current && requested.getTime() !== current.getTime()) {
    const days = Math.round((requested.getTime() - current.getTime()) / MS_PER_DAY);
    return {
      ok: true,
      nextGoLive: requested,
      slipped: true,
      fromDate: current,
      days,
      cause,
      note,
    };
  }

  // +N / -N days against the current go-live.
  if (slipDays != null) {
    if (!current) {
      return {
        ok: false,
        error: "Set a current go-live before recording a slip by days.",
      };
    }
    const nextGoLive = addDays(current, slipDays);
    return {
      ok: true,
      nextGoLive,
      slipped: true,
      fromDate: current,
      days: slipDays,
      cause,
      note,
    };
  }

  // Cause/note without an actual date push — reject.
  if (hasSlipMeta && (cause || note)) {
    if (!requested || !current || requested.getTime() === current.getTime()) {
      return {
        ok: false,
        error:
          "A slip must push the go-live: enter a new target date or slip days (+N). Cause/note alone is not a slip.",
      };
    }
  }

  // First-time set (no prior go-live) — not a slip, just an assignment.
  if (requested && !current) {
    return { ok: true, nextGoLive: requested, slipped: false };
  }

  // Unchanged / cleared.
  return { ok: true, nextGoLive: requested, slipped: false };
}

export type CascadeRescheduleResult = {
  phasesUpdated: number;
  tasksUpdated: number;
  milestonesUpdated: number;
  mode: "proportional" | "template" | "none";
};

/**
 * Rescale incomplete phases/tasks (and open milestones) into a new
 * kickoff→go-live window. Titles/status/`completedAt` are left alone; terminal
 * DONE/CANCELLED tasks and COMPLETED/SKIPPED phases skip date updates.
 */
export async function cascadeRescheduleProject(opts: {
  projectId: string;
  templateId?: string | null;
  previous: CascadeWindow | null;
  next: CascadeWindow;
}): Promise<CascadeRescheduleResult> {
  if (opts.previous) {
    return proportionalCascade({
      projectId: opts.projectId,
      previous: opts.previous,
      next: opts.next,
    });
  }

  if (opts.templateId) {
    return templateCascade({
      projectId: opts.projectId,
      templateId: opts.templateId,
      next: opts.next,
    });
  }

  return { phasesUpdated: 0, tasksUpdated: 0, milestonesUpdated: 0, mode: "none" };
}

async function proportionalCascade(opts: {
  projectId: string;
  previous: CascadeWindow;
  next: CascadeWindow;
}): Promise<CascadeRescheduleResult> {
  const { projectId, previous, next } = opts;
  let phasesUpdated = 0;
  let tasksUpdated = 0;
  let milestonesUpdated = 0;

  const projectPhases = await db.query.phases.findMany({
    where: eq(phases.projectId, projectId),
  });
  for (const phase of projectPhases) {
    if (!isOpenPhaseStatus(phase.status)) continue;
    const startDate = mapDateAcrossWindows(
      phase.startDate,
      previous.kickoff,
      previous.calendarDays,
      next.kickoff,
      next.calendarDays,
    );
    const dueDate = mapDateAcrossWindows(
      phase.dueDate,
      previous.kickoff,
      previous.calendarDays,
      next.kickoff,
      next.calendarDays,
    );
    if (!startDate && !dueDate) continue;
    await db
      .update(phases)
      .set({
        ...(startDate ? { startDate } : {}),
        ...(dueDate ? { dueDate } : {}),
        updatedAt: new Date(),
      })
      .where(eq(phases.id, phase.id));
    phasesUpdated++;
  }

  const projectTasks = await db.query.tasks.findMany({
    where: eq(tasks.projectId, projectId),
  });
  for (const task of projectTasks) {
    if (!isOpenTaskStatus(task.status)) continue;
    const startDate = mapDateAcrossWindows(
      task.startDate,
      previous.kickoff,
      previous.calendarDays,
      next.kickoff,
      next.calendarDays,
    );
    const dueDate = mapDateAcrossWindows(
      task.dueDate,
      previous.kickoff,
      previous.calendarDays,
      next.kickoff,
      next.calendarDays,
    );
    if (!startDate && !dueDate) continue;
    await db
      .update(tasks)
      .set({
        ...(startDate ? { startDate } : {}),
        ...(dueDate ? { dueDate } : {}),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, task.id));
    tasksUpdated++;
  }

  const projectMilestones = await db.query.milestones.findMany({
    where: eq(milestones.projectId, projectId),
  });
  for (const ms of projectMilestones) {
    if (ms.completedAt) continue;
    const dueDate = ms.isGoLive
      ? next.goLive
      : mapDateAcrossWindows(
          ms.dueDate,
          previous.kickoff,
          previous.calendarDays,
          next.kickoff,
          next.calendarDays,
        );
    if (!dueDate) continue;
    await db
      .update(milestones)
      .set({ dueDate, updatedAt: new Date() })
      .where(eq(milestones.id, ms.id));
    milestonesUpdated++;
  }

  return { phasesUpdated, tasksUpdated, milestonesUpdated, mode: "proportional" };
}

async function templateCascade(opts: {
  projectId: string;
  templateId: string;
  next: CascadeWindow;
}): Promise<CascadeRescheduleResult> {
  const template = await db.query.projectTemplates.findFirst({
    where: eq(projectTemplates.id, opts.templateId),
    with: {
      phases: { with: { tasks: true }, orderBy: (p, { asc }) => [asc(p.order)] },
      milestones: { orderBy: (m, { asc }) => [asc(m.order)] },
    },
  });
  if (!template || template.durationDays <= 0) {
    return { phasesUpdated: 0, tasksUpdated: 0, milestonesUpdated: 0, mode: "none" };
  }

  const scaleFactor = computeScaleFactor(opts.next.calendarDays, template.durationDays);
  let phasesUpdated = 0;
  let tasksUpdated = 0;
  let milestonesUpdated = 0;

  const livePhases = await db.query.phases.findMany({
    where: eq(phases.projectId, opts.projectId),
    orderBy: (p, { asc }) => [asc(p.order)],
    with: { tasks: true },
  });

  const templatePhases = [...template.phases].sort((a, b) => a.order - b.order);
  const phaseCount = Math.min(livePhases.length, templatePhases.length);

  for (let i = 0; i < phaseCount; i++) {
    const live = livePhases[i]!;
    const tp = templatePhases[i]!;
    const { startDate: phaseStart, dueDate: phaseDue } = scheduleFromOffsets({
      anchor: opts.next.kickoff,
      offsetDays: tp.offsetDays,
      durationDays: tp.durationDays,
      scaleFactor,
    });

    if (isOpenPhaseStatus(live.status)) {
      await db
        .update(phases)
        .set({ startDate: phaseStart, dueDate: phaseDue, updatedAt: new Date() })
        .where(eq(phases.id, live.id));
      phasesUpdated++;
    }

    const liveTasks = [...live.tasks].sort((a, b) => a.order - b.order);
    const tmplTasks = [...tp.tasks].sort((a, b) => a.order - b.order);
    const taskCount = Math.min(liveTasks.length, tmplTasks.length);
    for (let j = 0; j < taskCount; j++) {
      const lt = liveTasks[j]!;
      const tt = tmplTasks[j]!;
      if (!isOpenTaskStatus(lt.status)) continue;
      const { startDate, dueDate } = scheduleFromOffsets({
        anchor: phaseStart,
        offsetDays: tt.offsetDays,
        durationDays: tt.durationDays,
        scaleFactor,
      });
      await db
        .update(tasks)
        .set({ startDate, dueDate, updatedAt: new Date() })
        .where(eq(tasks.id, lt.id));
      tasksUpdated++;
    }
  }

  const liveMilestones = await db.query.milestones.findMany({
    where: eq(milestones.projectId, opts.projectId),
    orderBy: (m, { asc }) => [asc(m.order)],
  });
  const tmplMs = [...template.milestones].sort((a, b) => a.order - b.order);
  const msCount = Math.min(liveMilestones.length, tmplMs.length);
  for (let i = 0; i < msCount; i++) {
    const live = liveMilestones[i]!;
    const tm = tmplMs[i]!;
    if (live.completedAt) continue;
    const dueDate =
      (live.isGoLive || tm.isGoLive) && opts.next.goLive
        ? opts.next.goLive
        : addDays(opts.next.kickoff, scaleDays(tm.offsetDays, scaleFactor));
    await db
      .update(milestones)
      .set({ dueDate, updatedAt: new Date() })
      .where(eq(milestones.id, live.id));
    milestonesUpdated++;
  }

  return { phasesUpdated, tasksUpdated, milestonesUpdated, mode: "template" };
}
