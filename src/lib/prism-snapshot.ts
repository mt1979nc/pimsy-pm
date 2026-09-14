/**
 * Director / Pipeline / morning snapshot from PATH Postgres.
 *
 * Routines that used to query Prism Azure SQL should GET /api/prism/snapshot
 * instead. This is the book of business as PATH knows it after cutover.
 */

import { addDays, startOfDay } from "date-fns";

import { loadCapacityForecast, loadForecastExclusions } from "@/lib/forecast-data";
import {
  DEFAULT_ANALYSIS_EXCLUSION_CODES,
  memberLoadsFromForecast,
  type CapacityForecast,
  type EngagementLoadRow,
} from "@/lib/forecast";
import { utcDayKey } from "@/lib/dates";

export type SnapshotEngagement = {
  id: string;
  acronym: string;
  name: string;
  status: EngagementLoadRow["prismStatus"];
  weeklyHours: number;
  customHoursPerWeek: number | null;
  estimatedHours: number | null;
  leadId: string | null;
  coLeadId: string | null;
  ownerSplitPercent: number;
  kickoff: string | null;
  goLive: string | null;
  slipDays: number | null;
  slipWeeklyDelta: number | null;
  countsTowardLoad: boolean;
};

export type SnapshotGoLive = {
  acronym: string;
  name: string;
  goLive: string;
  daysUntil: number;
  weeklyHours: number;
};

export type DirectorSnapshot = {
  source: "pimsy-pm";
  asOf: string;
  hireNow: boolean;
  nearCapacity: boolean;
  thisWeekLoad: number;
  thisWeekHeadroom: number;
  peakWeekLoad: number;
  peakWeekOf: string | null;
  peakHeadroom: number;
  deptCapacityHours: number;
  billableStaffCount: number;
  pipelineCount: number;
  activeCount: number;
  slippedCount: number;
  analysisExclusions: string[];
  goLivesNext14: SnapshotGoLive[];
  pipeline: SnapshotEngagement[];
  slipped: SnapshotEngagement[];
  engagements: SnapshotEngagement[];
  team: {
    id: string;
    name: string | null;
    email: string | null;
    capacityHoursPerWeek: number;
    capacityExempt: boolean;
    canLead: boolean;
    isDirector: boolean;
    thisWeekHours: number;
    peakHours: number;
  }[];
  forecastWeeks: {
    weekOf: string;
    billableHours: number;
    headroom: number;
    utilization: number;
  }[];
};

function isoDay(d: Date | null | undefined): string | null {
  if (!d) return null;
  return utcDayKey(d);
}

function toEngagement(e: EngagementLoadRow, nameById: Map<string, string>): SnapshotEngagement {
  void nameById;
  return {
    id: e.id,
    acronym: e.acronym,
    name: e.name,
    status: e.prismStatus,
    weeklyHours: e.weeklyHours,
    customHoursPerWeek: e.customHoursPerWeek,
    estimatedHours: e.estimatedHours,
    leadId: e.leadId,
    coLeadId: e.coLeadId,
    ownerSplitPercent: e.ownerSplitPercent,
    kickoff: isoDay(e.startDate),
    goLive: isoDay(e.targetGoLiveDate),
    slipDays: e.slipDays,
    slipWeeklyDelta: e.slipWeeklyDelta,
    countsTowardLoad: e.countsTowardLoad,
  };
}

export function buildDirectorSnapshot(input: {
  asOf: Date;
  forecast: CapacityForecast;
  exclusions?: string[];
}): DirectorSnapshot {
  const asOf = startOfDay(input.asOf);
  const horizon = addDays(asOf, 14);
  const nameById = new Map(input.forecast.staff.map((s) => [s.id, s.name ?? s.email ?? s.id]));
  const engagements = input.forecast.engagements.map((e) => toEngagement(e, nameById));
  const pipeline = engagements.filter((e) => e.status === "pipeline");
  const slipped = engagements.filter((e) => e.countsTowardLoad && e.slipDays != null && e.slipDays !== 0);
  const memberLoads = memberLoadsFromForecast(input.forecast);
  const loadById = new Map(memberLoads.map((m) => [m.id, m]));

  const goLivesNext14: SnapshotGoLive[] = [];
  for (const e of input.forecast.engagements) {
    if (!e.countsTowardLoad || !e.targetGoLiveDate) continue;
    const gl = startOfDay(e.targetGoLiveDate);
    if (gl < asOf || gl > horizon) continue;
    goLivesNext14.push({
      acronym: e.acronym,
      name: e.name,
      goLive: utcDayKey(e.targetGoLiveDate),
      daysUntil: Math.round((gl.getTime() - asOf.getTime()) / 86_400_000),
      weeklyHours: e.weeklyHours,
    });
  }
  goLivesNext14.sort((a, b) => a.daysUntil - b.daysUntil);

  return {
    source: "pimsy-pm",
    asOf: asOf.toISOString(),
    hireNow: input.forecast.hire.hireNow,
    nearCapacity: input.forecast.hire.nearCapacity,
    thisWeekLoad: input.forecast.thisWeek?.billableHours ?? 0,
    thisWeekHeadroom: input.forecast.thisWeekHeadroom,
    peakWeekLoad: input.forecast.peakWeek?.billableHours ?? 0,
    peakWeekOf: input.forecast.peakWeek ? utcDayKey(input.forecast.peakWeek.weekOf) : null,
    peakHeadroom: input.forecast.peakHeadroom,
    deptCapacityHours: input.forecast.deptCapacityHours,
    billableStaffCount: input.forecast.billableStaffCount,
    pipelineCount: pipeline.length,
    activeCount: engagements.filter((e) => e.countsTowardLoad).length,
    slippedCount: slipped.length,
    analysisExclusions: input.exclusions ?? [...DEFAULT_ANALYSIS_EXCLUSION_CODES],
    goLivesNext14,
    pipeline,
    slipped,
    engagements,
    team: input.forecast.staff.map((s) => {
      const load = loadById.get(s.id);
      return {
        id: s.id,
        name: s.name ?? null,
        email: s.email ?? null,
        capacityHoursPerWeek: s.capacityHoursPerWeek,
        capacityExempt: s.capacityExempt,
        canLead: Boolean(s.canLead),
        isDirector: Boolean(s.isDirector),
        thisWeekHours: load?.thisWeekHours ?? 0,
        peakHours: load?.peakHours ?? 0,
      };
    }),
    forecastWeeks: input.forecast.weeks.map((w) => ({
      weekOf: utcDayKey(w.weekOf),
      billableHours: w.billableHours,
      headroom: w.headroom,
      utilization: w.utilization,
    })),
  };
}

export async function loadDirectorSnapshot(weeksAhead = 12, asOf = new Date()): Promise<DirectorSnapshot> {
  const [forecast, exclusions] = await Promise.all([
    loadCapacityForecast(weeksAhead, asOf),
    loadForecastExclusions(),
  ]);
  return buildDirectorSnapshot({ asOf, forecast, exclusions });
}
