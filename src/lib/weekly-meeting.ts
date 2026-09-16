/**
 * Weekly-meeting roster: every open Implementation site, with standup columns
 * and a hook for inline slip recording.
 *
 * Default hides analytics-excluded (test/E2E) rows; pass includeExcluded to
 * show them. Server-only — do not import from `"use client"` files.
 */

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { projects, slipEvents } from "@/db/schema";
import { isExcludedFromAnalytics } from "@/lib/analytics-exclude";
import { daysUntil } from "@/lib/dates";
import { pctComplete } from "@/lib/pct-complete";
import {
  OPEN_IMPLEMENTATION_STATUSES,
  type WeeklyMeetingSite,
} from "@/lib/weekly-meeting-types";

export {
  OPEN_IMPLEMENTATION_STATUSES,
  isOpenImplementationStatus,
  type LastSlipSummary,
  type WeeklyMeetingSite,
} from "@/lib/weekly-meeting-types";

export async function listWeeklyMeetingSites(opts?: {
  includeExcluded?: boolean;
}): Promise<WeeklyMeetingSite[]> {
  const includeExcluded = Boolean(opts?.includeExcluded);
  const rows = await db.query.projects.findMany({
    where: and(
      isNull(projects.archivedAt),
      eq(projects.type, "IMPLEMENTATION"),
      inArray(projects.status, OPEN_IMPLEMENTATION_STATUSES),
    ),
    with: {
      customerAccount: { columns: { id: true, name: true, excludeFromAnalytics: true } },
      lead: { columns: { id: true, name: true, email: true } },
      slipEvents: {
        columns: {
          id: true,
          days: true,
          cause: true,
          note: true,
          createdAt: true,
          fromDate: true,
          toDate: true,
        },
        orderBy: [desc(slipEvents.createdAt)],
        limit: 1,
      },
    },
    orderBy: [asc(projects.code)],
  });

  const mapped: WeeklyMeetingSite[] = rows
    .filter((r) => includeExcluded || !isExcludedFromAnalytics(r))
    .map((r) => {
      const last = r.slipEvents[0] ?? null;
    const target = r.targetGoLiveDate ? new Date(r.targetGoLiveDate) : null;
    return {
      id: r.id,
      name: r.name,
      code: r.code,
      acronym: r.crmAcronym || r.prismClientId || r.code,
      status: r.status,
      health: r.health,
      leadName: r.lead?.name ?? r.lead?.email ?? null,
      leadId: r.leadId,
      targetGoLiveDate: target,
      daysToGoLive: daysUntil(target),
      taskCountDone: r.taskCountDone,
      taskCountTotal: r.taskCountTotal,
      progressPct: pctComplete(r.taskCountDone, r.taskCountTotal),
      excludeFromAnalytics: isExcludedFromAnalytics(r),
      lastSlip: last
        ? {
            id: last.id,
            days: last.days,
            cause: last.cause,
            note: last.note,
            createdAt: last.createdAt,
            fromDate: last.fromDate,
            toDate: last.toDate,
          }
        : null,
    };
    });

  mapped.sort((a, b) => {
    const ad = a.daysToGoLive;
    const bd = b.daysToGoLive;
    if (ad == null && bd == null) return a.acronym.localeCompare(b.acronym);
    if (ad == null) return 1;
    if (bd == null) return -1;
    if (ad !== bd) return ad - bd;
    return a.acronym.localeCompare(b.acronym);
  });

  return mapped;
}
