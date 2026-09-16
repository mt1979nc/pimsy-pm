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
import { milestones, phases, projectScopes, projectTemplates, tasks } from "@/db/schema";
import type { ComplexityTier } from "@/db/schema";
import { snapStartAndDue, toBusinessDay } from "@/lib/business-days";
import { addDays, differenceInCalendarDays, utcCalendarDaysBetween, utcDayKey } from "@/lib/dates";

const MS_PER_DAY = 86_400_000;

export type TimelineScaleSource = "forecast" | "target" | "template";

/** Stretches the template window when there is no Forecast+ model. */
export const COMPLEXITY_WINDOW_MULTIPLIER: Record<ComplexityTier, number> = {
  STANDARD: 1,
  MODERATE: 1.1,
  HIGH: 1.2,
  ENTERPRISE: 1.35,
};

export type ResolvedPlaybookScale = {
  kickoff: Date;
  /** Effective go-live used for scaling (explicit target, forecast, or template end). */
  goLive: Date;
  calendarDays: number;
  scaleFactor: number;
  source: TimelineScaleSource;
};

export type ForecastSectionInput = {
  goLiveDate: Date;
  phases: Array<{ name: string; calendarDays: number }>;
};

export type PhaseScheduleInput = {
  name: string;
  offsetDays: number;
  durationDays: number;
};

export type ForecastSectionBucket = "kickoff" | "discovery" | "config" | "training" | "post" | "scaled";

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
 * offsets. Priority: forecast scenario days → explicit target → template
 * default. When the template default is used, complexity (if known) stretches
 * the window so higher-tier sites get more calendar room.
 */
export function resolvePlaybookScale(opts: {
  kickoff: Date;
  templateDurationDays: number;
  forecastCalendarDays?: number | null;
  targetGoLive?: Date | null;
  complexityTier?: ComplexityTier | null;
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

  const multiplier = opts.complexityTier
    ? (COMPLEXITY_WINDOW_MULTIPLIER[opts.complexityTier] ?? 1)
    : 1;
  const days = Math.max(Math.round(templateDurationDays * multiplier), 1);
  return {
    kickoff,
    goLive: addDays(kickoff, days),
    calendarDays: days,
    scaleFactor: computeScaleFactor(days, templateDurationDays),
    source: "template",
  };
}

export type ScheduleFromOffsetsOpts = {
  anchor: Date;
  offsetDays: number;
  durationDays: number;
  scaleFactor: number;
  /** Default true — recommended dues land on weekdays. */
  businessDays?: boolean;
  skipUsFederalHolidays?: boolean;
  /** Do not start before this day (typically project kickoff). */
  minDate?: Date | null;
};

/** Start/due from a phase- or task-relative offset, after scaling. */
export function scheduleFromOffsets(opts: ScheduleFromOffsetsOpts): { startDate: Date; dueDate: Date } {
  const rawStart = addDays(opts.anchor, scaleDays(opts.offsetDays, opts.scaleFactor));
  const rawDue = addDays(rawStart, scaleDays(opts.durationDays, opts.scaleFactor));
  if (opts.businessDays === false) {
    return { startDate: rawStart, dueDate: rawDue };
  }
  const snapped = snapStartAndDue(rawStart, rawDue, {
    skipUsFederalHolidays: opts.skipUsFederalHolidays,
  });
  if (opts.minDate && utcDayKey(snapped.startDate) < utcDayKey(opts.minDate)) {
    const startDate = toBusinessDay(opts.minDate, {
      skipUsFederalHolidays: opts.skipUsFederalHolidays,
      role: "start",
    });
    const dueDate = utcDayKey(snapped.dueDate) < utcDayKey(startDate) ? startDate : snapped.dueDate;
    return { startDate, dueDate };
  }
  return snapped;
}

/** Playbook section → Forecast+ Discovery / Config / Training window. */
export function forecastBucketForPhase(name: string): ForecastSectionBucket {
  const n = name.trim().toLowerCase();
  if (/\bpost go-live\b/.test(n) || /\bsurvey\b/.test(n)) return "post";
  if (/^rcm kickoff$/.test(n) || /^kickoff$/.test(n)) return "kickoff";
  if (n === "discovery" || /^discovery\b/.test(n)) return "discovery";
  if (
    n.includes("configuration") ||
    n.includes("accessing pimsy") ||
    n.includes("demographic import") ||
    n.includes("eprescribe") ||
    n.includes("inpatient") ||
    n.includes("payer")
  ) {
    return "config";
  }
  if (
    n.includes("train") ||
    n.includes("go-live checklist") ||
    n === "billing" ||
    n.includes("end-user") ||
    n.includes("workflow")
  ) {
    return "training";
  }
  return "scaled";
}

export function forecastWindowsFromProjection(
  kickoff: Date,
  forecast: ForecastSectionInput,
): {
  discovery: { start: Date; end: Date };
  config: { start: Date; end: Date };
  training: { start: Date; end: Date };
  goLive: Date;
} {
  const byName = (label: string) =>
    forecast.phases.find((p) => p.name.toLowerCase() === label.toLowerCase());
  const discoveryEnd = addDays(kickoff, byName("Discovery")?.calendarDays ?? 14);
  const configEnd = addDays(discoveryEnd, byName("Config")?.calendarDays ?? 21);
  return {
    discovery: { start: kickoff, end: discoveryEnd },
    config: { start: discoveryEnd, end: configEnd },
    training: { start: configEnd, end: forecast.goLiveDate },
    goLive: forecast.goLiveDate,
  };
}

function placePhasesInWindow(
  group: PhaseScheduleInput[],
  windowStart: Date,
  windowEnd: Date,
  skipUsFederalHolidays: boolean,
): Map<string, { startDate: Date; dueDate: Date }> {
  const out = new Map<string, { startDate: Date; dueDate: Date }>();
  if (group.length === 0) return out;
  const minOff = Math.min(...group.map((p) => p.offsetDays));
  const maxEnd = Math.max(...group.map((p) => p.offsetDays + Math.max(p.durationDays, 1)));
  const span = Math.max(maxEnd - minOff, 1);
  const windowDays = Math.max(utcCalendarDaysBetween(windowStart, windowEnd), 1);
  for (const p of group) {
    const startRatio = (p.offsetDays - minOff) / span;
    const endRatio = (p.offsetDays + Math.max(p.durationDays, 1) - minOff) / span;
    const rawStart = addDays(windowStart, Math.round(startRatio * windowDays));
    const rawDue = addDays(windowStart, Math.round(endRatio * windowDays));
    out.set(p.name, snapStartAndDue(rawStart, rawDue, { skipUsFederalHolidays }));
  }
  return out;
}

/**
 * Recommended section (phase) start/due dates.
 *
 * When a Forecast+ projection exists, Kickoff / Discovery / Config-like /
 * Training-like sections map onto the model windows; remaining sections keep
 * scaled template offsets. All recommended dates snap to business days.
 */
export function recommendPhaseSchedule(opts: {
  phases: PhaseScheduleInput[];
  kickoff: Date;
  scaleFactor: number;
  forecast?: ForecastSectionInput | null;
  skipUsFederalHolidays?: boolean;
}): Map<string, { startDate: Date; dueDate: Date }> {
  const skip = opts.skipUsFederalHolidays ?? true;
  const out = new Map<string, { startDate: Date; dueDate: Date }>();
  const fallback = (phase: PhaseScheduleInput) =>
    scheduleFromOffsets({
      anchor: opts.kickoff,
      offsetDays: phase.offsetDays,
      durationDays: phase.durationDays,
      scaleFactor: opts.scaleFactor,
      skipUsFederalHolidays: skip,
      minDate: opts.kickoff,
    });

  if (!opts.forecast) {
    for (const phase of opts.phases) out.set(phase.name, fallback(phase));
    return out;
  }

  const windows = forecastWindowsFromProjection(opts.kickoff, opts.forecast);
  const buckets = new Map<ForecastSectionBucket, PhaseScheduleInput[]>();
  for (const phase of opts.phases) {
    const bucket = forecastBucketForPhase(phase.name);
    const list = buckets.get(bucket) ?? [];
    list.push(phase);
    buckets.set(bucket, list);
  }

  for (const phase of buckets.get("kickoff") ?? []) {
    const scaledDue = addDays(opts.kickoff, scaleDays(Math.max(phase.durationDays, 1), opts.scaleFactor));
    const rawDue =
      utcDayKey(scaledDue) <= utcDayKey(windows.discovery.end) ? scaledDue : windows.discovery.end;
    out.set(phase.name, snapStartAndDue(opts.kickoff, rawDue, { skipUsFederalHolidays: skip }));
  }

  for (const phase of buckets.get("discovery") ?? []) {
    out.set(
      phase.name,
      snapStartAndDue(windows.discovery.start, windows.discovery.end, { skipUsFederalHolidays: skip }),
    );
  }

  for (const [name, dates] of placePhasesInWindow(
    buckets.get("config") ?? [],
    windows.config.start,
    windows.config.end,
    skip,
  )) {
    out.set(name, dates);
  }

  for (const [name, dates] of placePhasesInWindow(
    buckets.get("training") ?? [],
    windows.training.start,
    windows.training.end,
    skip,
  )) {
    out.set(name, dates);
  }

  for (const phase of [...(buckets.get("post") ?? []), ...(buckets.get("scaled") ?? [])]) {
    out.set(phase.name, fallback(phase));
  }

  return out;
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
 * Prefer +slipDays when set (form always posts targetGoLiveDate). Otherwise a
 * new target calendar day (UTC YYYY-MM-DD ≠ current) is the push. Rejects
 * cause/note-only slips.
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

  // Prefer explicit slipDays when set. The engagement/settings form always posts
  // targetGoLiveDate (default value); date round-trip noise (UTC midnight vs
  // UTC noon, or toISOString day-shift in CT) can make requested look ±1 day
  // off and would otherwise steal the push with a bogus +1d history.
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

  // Explicit new calendar day (no slipDays) → that's the push.
  // Compare UTC YYYY-MM-DD, not raw getTime, so noon vs midnight is not a slip.
  if (requested && current && utcDayKey(requested) !== utcDayKey(current)) {
    const days = utcCalendarDaysBetween(current, requested);
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

  // Cause/note without an actual date push — reject.
  if (hasSlipMeta && (cause || note)) {
    if (
      !requested ||
      !current ||
      utcDayKey(requested) === utcDayKey(current)
    ) {
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
  const skipUsFederalHolidays = await projectSkipsHolidays(opts.projectId);
  if (opts.previous) {
    return proportionalCascade({
      projectId: opts.projectId,
      previous: opts.previous,
      next: opts.next,
      skipUsFederalHolidays,
    });
  }

  if (opts.templateId) {
    return templateCascade({
      projectId: opts.projectId,
      templateId: opts.templateId,
      next: opts.next,
      skipUsFederalHolidays,
    });
  }

  return { phasesUpdated: 0, tasksUpdated: 0, milestonesUpdated: 0, mode: "none" };
}

async function projectSkipsHolidays(projectId: string): Promise<boolean> {
  const row = await db.query.projectScopes.findFirst({
    where: eq(projectScopes.projectId, projectId),
    columns: { skipUsFederalHolidays: true },
  });
  return row?.skipUsFederalHolidays ?? true;
}

function snapMappedDates(
  start: Date | null,
  due: Date | null,
  skipUsFederalHolidays: boolean,
): { startDate: Date | null; dueDate: Date | null } {
  if (!start && !due) return { startDate: null, dueDate: null };
  if (start && due) {
    const snapped = snapStartAndDue(start, due, { skipUsFederalHolidays });
    return { startDate: snapped.startDate, dueDate: snapped.dueDate };
  }
  return {
    startDate: start ? toBusinessDay(start, { skipUsFederalHolidays, role: "start" }) : null,
    dueDate: due ? toBusinessDay(due, { skipUsFederalHolidays, role: "due" }) : null,
  };
}

async function proportionalCascade(opts: {
  projectId: string;
  previous: CascadeWindow;
  next: CascadeWindow;
  skipUsFederalHolidays: boolean;
}): Promise<CascadeRescheduleResult> {
  const { projectId, previous, next, skipUsFederalHolidays } = opts;
  let phasesUpdated = 0;
  let tasksUpdated = 0;
  let milestonesUpdated = 0;

  const projectPhases = await db.query.phases.findMany({
    where: eq(phases.projectId, projectId),
  });
  for (const phase of projectPhases) {
    if (!isOpenPhaseStatus(phase.status)) continue;
    const mappedStart = mapDateAcrossWindows(
      phase.startDate,
      previous.kickoff,
      previous.calendarDays,
      next.kickoff,
      next.calendarDays,
    );
    const mappedDue = mapDateAcrossWindows(
      phase.dueDate,
      previous.kickoff,
      previous.calendarDays,
      next.kickoff,
      next.calendarDays,
    );
    const { startDate, dueDate } = snapMappedDates(mappedStart, mappedDue, skipUsFederalHolidays);
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
    if (!isOpenTaskStatus(task.status) || task.notApplicable) continue;
    const mappedStart = mapDateAcrossWindows(
      task.startDate,
      previous.kickoff,
      previous.calendarDays,
      next.kickoff,
      next.calendarDays,
    );
    const mappedDue = mapDateAcrossWindows(
      task.dueDate,
      previous.kickoff,
      previous.calendarDays,
      next.kickoff,
      next.calendarDays,
    );
    const { startDate, dueDate } = snapMappedDates(mappedStart, mappedDue, skipUsFederalHolidays);
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
      : (() => {
          const mapped = mapDateAcrossWindows(
            ms.dueDate,
            previous.kickoff,
            previous.calendarDays,
            next.kickoff,
            next.calendarDays,
          );
          return mapped
            ? toBusinessDay(mapped, { skipUsFederalHolidays, role: "due" })
            : mapped;
        })();
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
  skipUsFederalHolidays: boolean;
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
      skipUsFederalHolidays: opts.skipUsFederalHolidays,
      minDate: opts.next.kickoff,
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
      if (!isOpenTaskStatus(lt.status) || lt.notApplicable) continue;
      const { startDate, dueDate } = scheduleFromOffsets({
        anchor: phaseStart,
        offsetDays: tt.offsetDays,
        durationDays: tt.durationDays,
        scaleFactor,
        skipUsFederalHolidays: opts.skipUsFederalHolidays,
        minDate: opts.next.kickoff,
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
        : toBusinessDay(addDays(opts.next.kickoff, scaleDays(tm.offsetDays, scaleFactor)), {
            skipUsFederalHolidays: opts.skipUsFederalHolidays,
            role: "due",
          });
    await db
      .update(milestones)
      .set({ dueDate, updatedAt: new Date() })
      .where(eq(milestones.id, live.id));
    milestonesUpdated++;
  }

  return { phasesUpdated, tasksUpdated, milestonesUpdated, mode: "template" };
}
