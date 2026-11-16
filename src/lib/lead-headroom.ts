import { utcDayKey } from "@/lib/dates";

/**
 * Who has the most room to lead a new Forecast+ site.
 * Weekly load must already be the capacity forecast: per-person percent
 * shares, and sites whose handoff date has arrived left out.
 * Only pass active people who can lead.
 */

export type LeadLoad = {
  id: string;
  name: string;
  capacityHoursPerWeek: number;
  /** Committed hours for each week in `weekStarts`, same order. */
  weeklyLoad: number[];
};

export type LeadHeadroomPick = {
  id: string;
  name: string;
  /** Tightest free hours in the kickoff → go-live window. */
  freeHoursPerWeek: number;
  reason: string;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function hoursLabel(n: number): string {
  const rounded = round1(n);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function weekOverlaps(weekStartIso: string, kickoff: Date, goLive: Date): boolean {
  const weekStart = new Date(`${weekStartIso.slice(0, 10)}T12:00:00.000Z`);
  if (!Number.isFinite(weekStart.getTime())) return false;
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);
  return weekEnd > kickoff && weekStart < goLive;
}

/** Minimum free hours/week inside the window. No overlapping week means their full capacity. */
export function freeHoursInWindow(person: LeadLoad, weekStarts: readonly string[], kickoff: Date, goLive: Date): number {
  const overlapping = weekStarts
    .map((week, index) => ({ week, load: person.weeklyLoad[index] ?? 0 }))
    .filter((entry) => weekOverlaps(entry.week, kickoff, goLive));
  if (overlapping.length === 0) return round1(person.capacityHoursPerWeek);
  const tightest = overlapping.reduce((min, entry) => {
    const free = person.capacityHoursPerWeek - entry.load;
    return Math.min(min, free);
  }, Number.POSITIVE_INFINITY);
  return round1(tightest);
}

/** Copy committed hours off a capacity forecast. Handoff and percent shares are already in those hours. */
export function leadLoadsFromForecast(input: {
  weeks: readonly { weekOf: Date; byPerson: readonly { id: string; hours: number }[] }[];
  staff: readonly {
    id: string;
    name: string | null;
    email?: string | null;
    capacityHoursPerWeek: number;
    canLead?: boolean;
  }[];
  allowedIds: ReadonlySet<string>;
}): { weekStarts: string[]; candidates: LeadLoad[] } {
  const weekStarts = input.weeks.map((week) => utcDayKey(week.weekOf));
  const candidates = input.staff
    .filter((person) => person.canLead !== false && input.allowedIds.has(person.id))
    .map((person) => ({
      id: person.id,
      name: person.name?.trim() || person.email?.trim() || "Unnamed",
      capacityHoursPerWeek: person.capacityHoursPerWeek,
      weeklyLoad: input.weeks.map((week) => week.byPerson.find((row) => row.id === person.id)?.hours ?? 0),
    }));
  return { weekStarts, candidates };
}

export function rankLeadHeadroom(input: {
  candidates: readonly LeadLoad[];
  weekStarts: readonly string[];
  kickoff: Date;
  goLive: Date;
}): { suggested: LeadHeadroomPick | null; runnerUp: LeadHeadroomPick | null } {
  const ranked = input.candidates
    .map((person) => ({
      id: person.id,
      name: person.name,
      freeHoursPerWeek: freeHoursInWindow(person, input.weekStarts, input.kickoff, input.goLive),
    }))
    .sort((a, b) => b.freeHoursPerWeek - a.freeHoursPerWeek || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  const suggested = ranked[0];
  const runnerUp = ranked[1];
  if (!suggested) return { suggested: null, runnerUp: null };
  return {
    suggested: {
      ...suggested,
      reason: `Most room: ${hoursLabel(suggested.freeHoursPerWeek)} h/wk free`,
    },
    runnerUp: runnerUp
      ? {
          ...runnerUp,
          reason: `Next: ${runnerUp.name}, ${hoursLabel(runnerUp.freeHoursPerWeek)} h/wk free`,
        }
      : null,
  };
}
