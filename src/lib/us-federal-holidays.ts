/**
 * US federal holidays (OPM observed dates) for Forecast+ go-live math.
 *
 * PATH treats these as non-work calendar days when the holiday toggle is on:
 * New Year’s Day, MLK Day, Washington’s Birthday (Presidents Day), Memorial Day,
 * Juneteenth, Independence Day, Labor Day, Columbus Day / Indigenous Peoples’ Day,
 * Veterans Day, Thanksgiving, Christmas Day.
 *
 * Weekend holidays observe the adjacent weekday (Saturday → Friday, Sunday → Monday).
 * Inauguration Day is DC-area only and is not in this set.
 */

import { addDays, utcDayKey } from "@/lib/dates";

export type UsFederalHoliday = {
  /** UTC YYYY-MM-DD of the observed day off. */
  date: string;
  name: string;
};

const HOLIDAY_DEFS = [
  { name: "New Year’s Day", kind: "fixed" as const, month: 0, day: 1 },
  { name: "Birthday of Martin Luther King, Jr.", kind: "nth" as const, month: 0, weekday: 1, nth: 3 },
  { name: "Washington’s Birthday", kind: "nth" as const, month: 1, weekday: 1, nth: 3 },
  { name: "Memorial Day", kind: "last" as const, month: 4, weekday: 1 },
  { name: "Juneteenth National Independence Day", kind: "fixed" as const, month: 5, day: 19 },
  { name: "Independence Day", kind: "fixed" as const, month: 6, day: 4 },
  { name: "Labor Day", kind: "nth" as const, month: 8, weekday: 1, nth: 1 },
  { name: "Columbus Day / Indigenous Peoples’ Day", kind: "nth" as const, month: 9, weekday: 1, nth: 2 },
  { name: "Veterans Day", kind: "fixed" as const, month: 10, day: 11 },
  { name: "Thanksgiving Day", kind: "nth" as const, month: 10, weekday: 4, nth: 4 },
  { name: "Christmas Day", kind: "fixed" as const, month: 11, day: 25 },
];

export const US_FEDERAL_HOLIDAY_NAMES = HOLIDAY_DEFS.map((h) => h.name);

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(Date.UTC(year, month, 1, 12, 0, 0));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month, 1 + offset + (n - 1) * 7, 12, 0, 0));
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const last = new Date(Date.UTC(year, month + 1, 0, 12, 0, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return new Date(Date.UTC(year, month, last.getUTCDate() - offset, 12, 0, 0));
}

/** Saturday → Friday, Sunday → Monday; weekday stays put. May land in an adjacent year. */
export function observedFederalDate(year: number, month: number, day: number): Date {
  const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
  const dow = d.getUTCDay();
  if (dow === 6) return new Date(Date.UTC(year, month, day - 1, 12, 0, 0));
  if (dow === 0) return new Date(Date.UTC(year, month, day + 1, 12, 0, 0));
  return d;
}

function holidaysNamedInYear(year: number): { date: Date; name: string }[] {
  const out: { date: Date; name: string }[] = [];
  for (const def of HOLIDAY_DEFS) {
    const date =
      def.kind === "fixed"
        ? observedFederalDate(year, def.month, def.day)
        : def.kind === "nth"
          ? nthWeekdayOfMonth(year, def.month, def.weekday, def.nth)
          : lastWeekdayOfMonth(year, def.month, def.weekday);
    out.push({ date, name: def.name });
  }
  return out;
}

const yearCache = new Map<number, UsFederalHoliday[]>();

/**
 * Observed federal holidays whose day-off falls in `year`.
 * New Year’s observed on Dec 31 of the prior year is listed on that prior year.
 */
export function usFederalHolidaysForYear(year: number): UsFederalHoliday[] {
  const cached = yearCache.get(year);
  if (cached) return cached;

  const byKey = new Map<string, UsFederalHoliday>();
  for (const item of [...holidaysNamedInYear(year), ...holidaysNamedInYear(year + 1)]) {
    if (item.date.getUTCFullYear() !== year) continue;
    const date = utcDayKey(item.date);
    if (!byKey.has(date)) byKey.set(date, { date, name: item.name });
  }
  const list = [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date));
  yearCache.set(year, list);
  return list;
}

function holidayMapForYear(year: number): Map<string, string> {
  return new Map(usFederalHolidaysForYear(year).map((h) => [h.date, h.name]));
}

export function isUsFederalHoliday(d: Date): boolean {
  return holidayMapForYear(d.getUTCFullYear()).has(utcDayKey(d));
}

export function usFederalHolidayName(d: Date): string | null {
  return holidayMapForYear(d.getUTCFullYear()).get(utcDayKey(d)) ?? null;
}

/** Holidays strictly after `start` and on or before `end` (matches addDays / go-live windows). */
export function usFederalHolidaysInWindow(start: Date, end: Date): UsFederalHoliday[] {
  const out: UsFederalHoliday[] = [];
  const startKey = utcDayKey(start);
  const endKey = utcDayKey(end);
  const y0 = start.getUTCFullYear() - 1;
  const y1 = end.getUTCFullYear() + 1;
  for (let y = y0; y <= y1; y++) {
    for (const h of usFederalHolidaysForYear(y)) {
      if (h.date > startKey && h.date <= endKey) out.push(h);
    }
  }
  return out;
}

/**
 * Advance `days` calendar days from `start`, not counting US federal holidays.
 * Weekends still count (same as Prism Forecast+). Go-live never lands on a holiday.
 */
export function addDaysSkippingUsFederalHolidays(start: Date, days: number): Date {
  if (days <= 0) return start;
  let remaining = days;
  let current = start;
  const guard = days + 400;
  let stepped = 0;
  while (remaining > 0 && stepped < guard) {
    current = addDays(current, 1);
    stepped++;
    if (!isUsFederalHoliday(current)) remaining--;
  }
  return current;
}
