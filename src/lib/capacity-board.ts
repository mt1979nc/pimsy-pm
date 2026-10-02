/**
 * Data for the Team capacity specialist cards.
 * Server-only.
 */

import { and, desc, eq, isNull, ne } from "drizzle-orm";

import { db } from "@/db";
import { projects, slipEvents } from "@/db/schema";
import {
  groupSitesUnderSpecialists,
  isCapacityPhase,
  modelCapacityPhase,
  type CapacitySiteRow,
} from "@/lib/capacity-phase";
import { includedInAnalytics } from "@/lib/analytics-scope";
import { round1, weeklyHoursForEngagement, type CapacityForecast, type ForecastEngagement } from "@/lib/forecast";
import { toDateInput, utcCalendarDaysBetween } from "@/lib/dates";
import { inferPrismStatus, type PrismStatus } from "@/lib/prism-status";

export type { CapacitySiteRow } from "@/lib/capacity-phase";

type SlipCause = "CUSTOMER" | "PIMSY" | null;

function shareHours(weekly: number, splitPercent: number): number {
  return round1((weekly * splitPercent) / 100);
}

export async function loadCapacityBoard(
  forecast: CapacityForecast,
  asOf = new Date(),
): Promise<{ sitesByMember: Record<string, CapacitySiteRow[]>; unassigned: CapacitySiteRow[] }> {
  const rows = await db.query.projects.findMany({
    where: and(
      isNull(projects.archivedAt),
      eq(projects.type, "IMPLEMENTATION"),
      ne(projects.status, "CANCELLED"),
      ne(projects.status, "COMPLETED"),
      includedInAnalytics(),
    ),
    columns: {
      id: true,
      code: true,
      name: true,
      status: true,
      leadId: true,
      coLeadId: true,
      ownerSplitPercent: true,
      customHoursPerWeek: true,
      prismStatus: true,
      prismNote: true,
      currentPhase: true,
      phaseRecordedAt: true,
      startDate: true,
      initialGoLiveDate: true,
      targetGoLiveDate: true,
      estimatedHours: true,
      crmAcronym: true,
      prismClientId: true,
    },
    with: {
      customerAccount: { columns: { name: true, status: true } },
      scope: { columns: { estimatedHours: true } },
      slipEvents: {
        orderBy: [desc(slipEvents.createdAt)],
        columns: {
          id: true,
          fromDate: true,
          toDate: true,
          days: true,
          cause: true,
          note: true,
          createdAt: true,
          goLiveApplied: true,
        },
      },
    },
  });

  const weeklyById = new Map(forecast.engagements.map((e) => [e.id, e.weeklyHours]));

  const sites = rows.map((row) => {
    const prismStatus: PrismStatus = inferPrismStatus({
      prismStatus: row.prismStatus,
      projectStatus: row.status,
      customerStatus: row.customerAccount?.status,
      startDate: row.startDate,
    });
    const engagement: ForecastEngagement = {
      id: row.id,
      code: row.code,
      name: row.customerAccount?.name ?? row.name,
      acronym: row.crmAcronym || row.prismClientId || row.code,
      prismStatus,
      leadId: row.leadId,
      coLeadId: row.coLeadId,
      ownerSplitPercent: row.ownerSplitPercent,
      estimatedHours: row.scope?.estimatedHours ?? row.estimatedHours,
      customHoursPerWeek: row.customHoursPerWeek,
      startDate: row.startDate,
      initialGoLiveDate: row.initialGoLiveDate,
      targetGoLiveDate: row.targetGoLiveDate,
    };
    const weekly = weeklyById.get(row.id) ?? weeklyHoursForEngagement(engagement);
    const initial = row.initialGoLiveDate ? new Date(row.initialGoLiveDate) : null;
    const target = row.targetGoLiveDate ? new Date(row.targetGoLiveDate) : null;
    const slipSpan = initial && target ? utcCalendarDaysBetween(initial, target) : 0;
    const recorded = isCapacityPhase(row.currentPhase) ? row.currentPhase : null;
    return {
      id: row.id,
      acronym: engagement.acronym,
      name: engagement.name,
      leadId: row.leadId,
      coLeadId: row.coLeadId,
      ownerSplitPercent: row.ownerSplitPercent,
      prismStatus,
      prismNote: row.prismNote,
      currentPhase: recorded,
      modelPhase: modelCapacityPhase({
        asOf,
        kickoff: row.startDate ? new Date(row.startDate) : null,
        goLive: target ?? initial,
      }),
      phaseRecordedAt: row.phaseRecordedAt ? new Date(row.phaseRecordedAt).toISOString() : null,
      weekly,
      slipDays: slipSpan > 0 ? slipSpan : 0,
      targetGoLive: toDateInput(target),
      slips: row.slipEvents.map((s) => ({
        id: s.id,
        fromDate: new Date(s.fromDate).toISOString(),
        toDate: new Date(s.toDate).toISOString(),
        days: s.days,
        cause: (s.cause ?? null) as SlipCause,
        note: s.note,
        createdAt: new Date(s.createdAt).toISOString(),
        goLiveApplied: s.goLiveApplied !== false,
      })),
    };
  });

  const grouped = groupSitesUnderSpecialists(
    forecast.staff.map((s) => s.id),
    sites,
  );

  function toRow(
    site: (typeof sites)[number] & { splitPercent: number; isSecondary: boolean },
  ): CapacitySiteRow {
    return {
      id: site.id,
      acronym: site.acronym,
      name: site.name,
      prismStatus: site.prismStatus,
      prismNote: site.prismNote,
      currentPhase: site.currentPhase,
      modelPhase: site.modelPhase,
      phaseRecordedAt: site.phaseRecordedAt,
      splitPercent: site.splitPercent,
      isSecondary: site.isSecondary,
      weeklyHours: shareHours(site.weekly, site.splitPercent),
      slipDays: site.slipDays,
      targetGoLive: site.targetGoLive,
      slips: site.slips,
    };
  }

  const sitesByMember: Record<string, CapacitySiteRow[]> = {};
  for (const [memberId, memberSites] of Object.entries(grouped.byMember)) {
    sitesByMember[memberId] = memberSites.map(toRow);
  }

  return {
    sitesByMember,
    unassigned: grouped.unassigned.map(toRow),
  };
}
