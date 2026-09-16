/**
 * Business-day snapping for recommended task / section due dates.
 *
 * Forecast+ go-live still counts weekends (Prism parity) and skips observed
 * US federal holidays when that toggle is on. Task and section dues are
 * different: they must land on a weekday. Saturday bumps to Friday (due) or
 * Monday (start); Sunday always bumps to Monday. Holiday skips reuse the
 * same OPM-observed calendar as go-live.
 */

import { addDays, utcDayKey } from "@/lib/dates";
import { isUsFederalHoliday } from "@/lib/us-federal-holidays";

export type BusinessDayRole = "start" | "due";

export type BusinessDayOptions = {
  /** Default true — same calendar as Forecast+ `skipUsFederalHolidays`. */
  skipUsFederalHolidays?: boolean;
  /**
   * `due` (default): Saturday → Friday, Sunday → Monday.
   * `start`: weekend → Monday so work does not begin on Saturday.
   */
  role?: BusinessDayRole;
};

export function utcWeekday(d: Date): number {
  return d.getUTCDay();
}

export function isWeekend(d: Date): boolean {
  const w = utcWeekday(d);
  return w === 0 || w === 6;
}

export function isBusinessDay(d: Date, skipUsFederalHolidays = true): boolean {
  if (isWeekend(d)) return false;
  if (skipUsFederalHolidays && isUsFederalHoliday(d)) return false;
  return true;
}

/**
 * Snap `date` onto a business day.
 *
 * Weekend: Saturday due → Friday, Saturday start → Monday, Sunday → Monday.
 * Then, if the toggle is on, keep walking in that direction across observed
 * US federal holidays. A weekday holiday (no weekend bump) walks forward so
 * a due is not pulled earlier than the work.
 */
export function toBusinessDay(date: Date, opts?: BusinessDayOptions): Date {
  const skip = opts?.skipUsFederalHolidays ?? true;
  const role: BusinessDayRole = opts?.role ?? "due";
  if (isBusinessDay(date, skip)) return date;

  const dow = utcWeekday(date);
  let dir: 1 | -1;
  if (dow === 6) {
    dir = role === "due" ? -1 : 1;
  } else if (dow === 0) {
    dir = 1;
  } else {
    dir = 1;
  }

  let current = date;
  let guard = 0;
  while (!isBusinessDay(current, skip) && guard < 21) {
    current = addDays(current, dir);
    guard += 1;
  }
  return current;
}

/** If bumping pulled due before start, land on the start’s business day. */
export function ensureDueOnOrAfterStart(start: Date, due: Date): Date {
  return utcDayKey(due) < utcDayKey(start) ? start : due;
}

export function snapStartAndDue(
  start: Date,
  due: Date,
  opts?: BusinessDayOptions,
): { startDate: Date; dueDate: Date } {
  const startDate = toBusinessDay(start, { ...opts, role: "start" });
  const dueDate = ensureDueOnOrAfterStart(startDate, toBusinessDay(due, { ...opts, role: "due" }));
  return { startDate, dueDate };
}
