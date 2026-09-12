/**
 * v1.10 weekly hours + peak-week forecast.
 *
 * Simpler hours model first (Prism Capacity daily workflow):
 *   weeklyHrs = customHoursPerWeek  OR  estimatedHours / weeks(kickoff → current go-live)
 * Pipeline is excluded from active load. Capacity-exempt staff still show
 * personal load but are left out of department cap / headroom / hire-now.
 * Owner split assigns the same weekly figure across lead + co-lead.
 *
 * A go-live slip lengthens the window and drops weekly hours unless the
 * engagement has a custom hrs/wk override (Prism customHpw).
 *
 * Analysis "primary averages" exclude SENSORI / MHC / LECHRIS by default —
 * the locked Prism outliers — and the list is org-configurable.
 *
 * Native Postgres only. Dual-read of Prism Azure SQL is v1.11
 * (see src/lib/prism-dual-read.ts).
 */

import { addDays, startOfDay, startOfWeek } from "date-fns";
import { utcCalendarDaysBetween } from "@/lib/dates";
import type { PrismStatus } from "@/lib/prism-status";

/** Locked Prism Analysis exclusions — primary on-time / duration averages. */
export const DEFAULT_ANALYSIS_EXCLUSION_CODES = ["SENSORI", "MHC", "LECHRIS"] as const;

/** Hire-now fires when peak-week billable load exceeds this share of dept cap. */
export const HIRE_NOW_THRESHOLD = 1;
/** Amber "near" band on the same ratio. */
export const HIRE_NEAR_THRESHOLD = 0.85;
/** Typical specialist week used only as an FTE hint on the hire-now banner. */
export const TYPICAL_HIRE_HOURS_PER_WEEK = 30;

export type ForecastStaffMember = {
  id: string;
  name: string | null;
  email?: string | null;
  capacityHoursPerWeek: number;
  capacityExempt: boolean;
  canLead?: boolean;
  isDirector?: boolean;
  image?: string | null;
};

export type ForecastEngagement = {
  id: string;
  code: string;
  name: string;
  acronym: string;
  prismStatus: PrismStatus;
  leadId: string | null;
  coLeadId: string | null;
  ownerSplitPercent: number;
  estimatedHours: number | null;
  customHoursPerWeek: number | null;
  startDate: Date | null;
  initialGoLiveDate: Date | null;
  targetGoLiveDate: Date | null;
};

export type WeekAllocation = {
  weekOf: Date;
  byPerson: { id: string; hours: number }[];
  /** Hours on non-exempt staff only — used for dept headroom / hire-now. */
  billableHours: number;
  /** All staff including exempt. */
  totalHours: number;
  headroom: number;
  utilization: number;
};

export type EngagementLoadRow = {
  id: string;
  code: string;
  acronym: string;
  name: string;
  prismStatus: PrismStatus;
  weeklyHours: number;
  onCalendar: boolean;
  leadId: string | null;
  coLeadId: string | null;
  ownerSplitPercent: number;
  customHoursPerWeek: number | null;
  estimatedHours: number | null;
  startDate: Date | null;
  targetGoLiveDate: Date | null;
  slipDays: number | null;
  slipWeeklyDelta: number | null;
  countsTowardLoad: boolean;
};

export type HireNowSignal = {
  hireNow: boolean;
  nearCapacity: boolean;
  peakUtilization: number;
  hoursShort: number;
  fteHint: number;
  peakWeekOf: Date | null;
};

export type CapacityForecast = {
  asOf: Date;
  weeksAhead: number;
  staff: ForecastStaffMember[];
  deptCapacityHours: number;
  billableStaffCount: number;
  thisWeek: WeekAllocation | null;
  peakWeek: WeekAllocation | null;
  thisWeekHeadroom: number;
  peakHeadroom: number;
  hire: HireNowSignal;
  weeks: WeekAllocation[];
  engagements: EngagementLoadRow[];
};

export function normalizeForecastCode(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase();
}

export function parseExclusionCodes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_ANALYSIS_EXCLUSION_CODES];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const code = normalizeForecastCode(item);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

export function isExcludedFromPrimaryAverages(
  code: string | null | undefined,
  exclusions: readonly string[] = DEFAULT_ANALYSIS_EXCLUSION_CODES,
): boolean {
  const normalized = normalizeForecastCode(code);
  if (!normalized) return false;
  const set = new Set(exclusions.map(normalizeForecastCode));
  return set.has(normalized);
}

export function countsTowardActiveLoad(status: PrismStatus): boolean {
  return status === "active" || status === "pre-kickoff";
}

export function startOfForecastWeek(d: Date): Date {
  return startOfWeek(startOfDay(d), { weekStartsOn: 1 });
}

/** Inclusive kickoff → go-live span in whole weeks (minimum 1 when both dates exist). */
export function weeksInWindow(start: Date, end: Date): number {
  const days = utcCalendarDaysBetween(start, end);
  if (days <= 0) return 1;
  return Math.max(1, Math.ceil(days / 7));
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Weekly hours for one engagement under the simpler-hours model.
 * customHoursPerWeek wins. Otherwise estimatedHours spread across the
 * current kickoff → go-live window. Zero when we would have to guess.
 */
export function weeklyHoursForEngagement(e: ForecastEngagement): number {
  if (e.customHoursPerWeek != null && e.customHoursPerWeek > 0) {
    return round1(e.customHoursPerWeek);
  }
  if (!e.estimatedHours || e.estimatedHours <= 0) return 0;
  const start = e.startDate;
  const end = e.targetGoLiveDate ?? e.initialGoLiveDate;
  if (!start || !end) return 0;
  return round1(e.estimatedHours / weeksInWindow(start, end));
}

/**
 * How a go-live slip changed weekly hours. Null when customHpw is set
 * (override ignores window length) or when either date is missing.
 */
export function slipWeeklyImpact(e: ForecastEngagement): {
  initialWeekly: number;
  currentWeekly: number;
  delta: number;
  slipDays: number;
} | null {
  if (!e.startDate || !e.initialGoLiveDate || !e.targetGoLiveDate) return null;
  const slipDays = utcCalendarDaysBetween(e.initialGoLiveDate, e.targetGoLiveDate);
  if (slipDays === 0) return null;
  if (e.customHoursPerWeek != null && e.customHoursPerWeek > 0) {
    return {
      initialWeekly: round1(e.customHoursPerWeek),
      currentWeekly: round1(e.customHoursPerWeek),
      delta: 0,
      slipDays,
    };
  }
  if (!e.estimatedHours || e.estimatedHours <= 0) {
    return { initialWeekly: 0, currentWeekly: 0, delta: 0, slipDays };
  }
  const initialWeekly = round1(e.estimatedHours / weeksInWindow(e.startDate, e.initialGoLiveDate));
  const currentWeekly = round1(e.estimatedHours / weeksInWindow(e.startDate, e.targetGoLiveDate));
  return {
    initialWeekly,
    currentWeekly,
    delta: round1(currentWeekly - initialWeekly),
    slipDays,
  };
}

export function splitWeeklyHours(
  weeklyHours: number,
  ownerSplitPercent: number,
  hasCoLead: boolean,
): { lead: number; coLead: number } {
  if (!hasCoLead) return { lead: weeklyHours, coLead: 0 };
  const pct = Math.min(100, Math.max(0, ownerSplitPercent));
  const lead = round1((weeklyHours * pct) / 100);
  return { lead, coLead: round1(weeklyHours - lead) };
}

export function engagementOverlapsWeek(
  e: ForecastEngagement,
  weekStart: Date,
  weeklyHours: number,
): boolean {
  if (weeklyHours <= 0) return false;
  const start = e.startDate;
  const end = e.targetGoLiveDate ?? e.initialGoLiveDate;
  if (!start || !end) return false;
  const weekEnd = addDays(weekStart, 7);
  return weekEnd > start && weekStart < end;
}

export function departmentCapacityHours(staff: readonly ForecastStaffMember[]): number {
  return staff.filter((s) => !s.capacityExempt).reduce((sum, s) => sum + (s.capacityHoursPerWeek || 0), 0);
}

export function hireNowSignal(peak: WeekAllocation | null, deptCapacity: number): HireNowSignal {
  if (!peak || deptCapacity <= 0) {
    return {
      hireNow: false,
      nearCapacity: false,
      peakUtilization: 0,
      hoursShort: 0,
      fteHint: 0,
      peakWeekOf: peak?.weekOf ?? null,
    };
  }
  const util = peak.utilization;
  const hoursShort = Math.max(0, round1(peak.billableHours - deptCapacity));
  return {
    hireNow: util >= HIRE_NOW_THRESHOLD,
    nearCapacity: util >= HIRE_NEAR_THRESHOLD && util < HIRE_NOW_THRESHOLD,
    peakUtilization: util,
    hoursShort,
    fteHint: hoursShort > 0 ? Math.round((hoursShort / TYPICAL_HIRE_HOURS_PER_WEEK) * 10) / 10 : 0,
    peakWeekOf: peak.weekOf,
  };
}

function engagementRow(e: ForecastEngagement): EngagementLoadRow {
  const weeklyHours = weeklyHoursForEngagement(e);
  const slip = slipWeeklyImpact(e);
  const onCalendar = Boolean(e.startDate && (e.targetGoLiveDate || e.initialGoLiveDate) && weeklyHours > 0);
  return {
    id: e.id,
    code: e.code,
    acronym: e.acronym,
    name: e.name,
    prismStatus: e.prismStatus,
    weeklyHours,
    onCalendar,
    leadId: e.leadId,
    coLeadId: e.coLeadId,
    ownerSplitPercent: e.ownerSplitPercent,
    customHoursPerWeek: e.customHoursPerWeek,
    estimatedHours: e.estimatedHours,
    startDate: e.startDate,
    targetGoLiveDate: e.targetGoLiveDate,
    slipDays: slip?.slipDays ?? null,
    slipWeeklyDelta: slip?.delta ?? null,
    countsTowardLoad: countsTowardActiveLoad(e.prismStatus),
  };
}

export function buildCapacityForecast(input: {
  asOf: Date;
  weeksAhead?: number;
  staff: ForecastStaffMember[];
  engagements: ForecastEngagement[];
}): CapacityForecast {
  const weeksAhead = input.weeksAhead ?? 12;
  const asOf = startOfDay(input.asOf);
  const week0 = startOfForecastWeek(asOf);
  const staff = input.staff;
  const deptCapacityHours = departmentCapacityHours(staff);
  const billableIds = new Set(staff.filter((s) => !s.capacityExempt).map((s) => s.id));

  const active = input.engagements.filter((e) => countsTowardActiveLoad(e.prismStatus));
  const weeklyById = new Map(active.map((e) => [e.id, weeklyHoursForEngagement(e)]));

  const weeks: WeekAllocation[] = Array.from({ length: weeksAhead }, (_, i) => {
    const weekOf = addDays(week0, i * 7);
    const perPerson = new Map<string, number>();

    for (const e of active) {
      const weekly = weeklyById.get(e.id) ?? 0;
      if (!engagementOverlapsWeek(e, weekOf, weekly)) continue;
      const split = splitWeeklyHours(weekly, e.ownerSplitPercent, Boolean(e.coLeadId));
      if (e.leadId) perPerson.set(e.leadId, (perPerson.get(e.leadId) ?? 0) + split.lead);
      if (e.coLeadId) perPerson.set(e.coLeadId, (perPerson.get(e.coLeadId) ?? 0) + split.coLead);
    }

    const byPerson = staff.map((s) => ({
      id: s.id,
      hours: round1(perPerson.get(s.id) ?? 0),
    }));
    const billableHours = round1(
      byPerson.filter((p) => billableIds.has(p.id)).reduce((sum, p) => sum + p.hours, 0),
    );
    const totalHours = round1(byPerson.reduce((sum, p) => sum + p.hours, 0));
    const headroom = round1(deptCapacityHours - billableHours);
    const utilization = deptCapacityHours > 0 ? Math.round((billableHours / deptCapacityHours) * 1000) / 1000 : 0;

    return { weekOf, byPerson, billableHours, totalHours, headroom, utilization };
  });

  const thisWeek = weeks[0] ?? null;
  const peakWeek =
    weeks.length === 0
      ? null
      : weeks.reduce((best, w) => (w.billableHours > best.billableHours ? w : best), weeks[0]!);

  return {
    asOf,
    weeksAhead,
    staff,
    deptCapacityHours,
    billableStaffCount: staff.filter((s) => !s.capacityExempt).length,
    thisWeek,
    peakWeek,
    thisWeekHeadroom: thisWeek?.headroom ?? deptCapacityHours,
    peakHeadroom: peakWeek?.headroom ?? deptCapacityHours,
    hire: hireNowSignal(peakWeek, deptCapacityHours),
    weeks,
    engagements: input.engagements.map(engagementRow),
  };
}

export type AccuracyRow = {
  code?: string | null;
  variance: number | null;
  durationDays: number | null;
};

export type AccuracySummary = {
  completed: number;
  onTimeRate: number | null;
  lateCount: number;
  avgVariance: number | null;
  avgDuration: number | null;
};

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

/** Forecast accuracy over rows that already have a variance. */
export function summarizeForecastAccuracy(rows: AccuracyRow[]): AccuracySummary {
  const withData = rows.filter((r) => r.variance !== null);
  const onTime = withData.filter((r) => (r.variance ?? 0) <= 0).length;
  const misses = withData.filter((r) => (r.variance ?? 0) > 0);
  return {
    completed: withData.length,
    onTimeRate: withData.length > 0 ? Math.round((onTime / withData.length) * 100) : null,
    lateCount: misses.length,
    avgVariance: avg(withData.map((r) => r.variance!)),
    avgDuration: avg(withData.filter((r) => r.durationDays !== null).map((r) => r.durationDays!)),
  };
}

export function applyPrimaryAverageExclusions<T extends AccuracyRow>(
  rows: T[],
  exclusions: readonly string[] = DEFAULT_ANALYSIS_EXCLUSION_CODES,
): { primary: T[]; excluded: T[] } {
  const primary: T[] = [];
  const excluded: T[] = [];
  for (const row of rows) {
    if (isExcludedFromPrimaryAverages(row.code, exclusions)) excluded.push(row);
    else primary.push(row);
  }
  return { primary, excluded };
}
