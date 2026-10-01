/**
 * Client-safe sort for the weekly-meeting cards.
 * Default is nearest go-live (overdue first, missing dates last).
 * Kickoff age uses project start date — no schema change.
 */

import type { WeeklyMeetingSite } from "@/lib/weekly-meeting-types";

export type WeeklyMeetingSort =
  | "go-live-asc"
  | "go-live-desc"
  | "kickoff-desc"
  | "kickoff-asc"
  | "last-slip"
  | "health"
  | "lead";

export const DEFAULT_WEEKLY_MEETING_SORT: WeeklyMeetingSort = "go-live-asc";

export const WEEKLY_MEETING_SORT_OPTIONS: { value: WeeklyMeetingSort; label: string }[] = [
  { value: "go-live-asc", label: "Nearest go-live" },
  { value: "go-live-desc", label: "Latest go-live" },
  { value: "kickoff-desc", label: "Longest since kickoff" },
  { value: "kickoff-asc", label: "Newest kickoff" },
  { value: "last-slip", label: "Last slip" },
  { value: "health", label: "Health" },
  { value: "lead", label: "Lead" },
];

const HEALTH_RANK: Record<WeeklyMeetingSite["health"], number> = {
  RED: 0,
  YELLOW: 1,
  GREEN: 2,
};

function compareNullable(a: number | null, b: number | null, direction: "asc" | "desc"): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return direction === "asc" ? a - b : b - a;
}

function byAcronym(a: WeeklyMeetingSite, b: WeeklyMeetingSite): number {
  return a.acronym.localeCompare(b.acronym);
}

function slipTime(site: WeeklyMeetingSite): number | null {
  if (!site.lastSlip) return null;
  const t = new Date(site.lastSlip.createdAt).getTime();
  return Number.isNaN(t) ? null : t;
}

export function sortWeeklyMeetingSites(
  rows: readonly WeeklyMeetingSite[],
  sort: WeeklyMeetingSort = DEFAULT_WEEKLY_MEETING_SORT,
): WeeklyMeetingSite[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    let cmp = 0;
    switch (sort) {
      case "go-live-asc":
        cmp = compareNullable(a.daysToGoLive, b.daysToGoLive, "asc");
        break;
      case "go-live-desc":
        cmp = compareNullable(a.daysToGoLive, b.daysToGoLive, "desc");
        break;
      case "kickoff-desc":
        cmp = compareNullable(a.daysSinceKickoff, b.daysSinceKickoff, "desc");
        break;
      case "kickoff-asc":
        cmp = compareNullable(a.daysSinceKickoff, b.daysSinceKickoff, "asc");
        break;
      case "last-slip":
        cmp = compareNullable(slipTime(a), slipTime(b), "desc");
        if (cmp === 0) {
          cmp = compareNullable(a.lastSlip?.days ?? null, b.lastSlip?.days ?? null, "desc");
        }
        break;
      case "health":
        cmp = HEALTH_RANK[a.health] - HEALTH_RANK[b.health];
        break;
      case "lead": {
        const al = a.leadName?.trim() || null;
        const bl = b.leadName?.trim() || null;
        if (al == null && bl == null) cmp = 0;
        else if (al == null) cmp = 1;
        else if (bl == null) cmp = -1;
        else cmp = al.localeCompare(bl);
        break;
      }
      default: {
        const _exhaustive: never = sort;
        return _exhaustive;
      }
    }
    return cmp !== 0 ? cmp : byAcronym(a, b);
  });
  return copy;
}
