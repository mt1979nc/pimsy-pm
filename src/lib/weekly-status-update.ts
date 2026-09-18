/**
 * Weekly Thursday account-update reminder (Morgan Wave 4).
 *
 * Client-safe: no Postgres, Resend, or env. The cron runner lives in
 * `run-weekly-status-update-reminder.ts`.
 *
 * Cadence: Thursday in America/Chicago by default; a lead’s `user.time_zone`
 * wins when set. “This week’s update” = a status_update authored by the
 * project lead with publishedAt >= this Thursday 00:00 in that zone.
 */

import { calendarDayKey } from "@/lib/task-due-reminders";

export const WEEKLY_UPDATE_TIME_ZONE = "America/Chicago";

/** JS weekday: 0 Sunday … 4 Thursday. */
export const WEEKLY_UPDATE_WEEKDAY = 4;

/** Do not ping before this local hour on Thursday. */
export const WEEKLY_UPDATE_REMINDER_HOUR = 8;

export const WEEKLY_UPDATE_REMINDER_TYPE = "STATUS_UPDATE_DUE";

const WEEKDAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

export function weekdayInZone(d: Date, timeZone = WEEKLY_UPDATE_TIME_ZONE): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(d);
  return WEEKDAY_INDEX[name] ?? -1;
}

export function isWeeklyUpdateReminderDay(now: Date, timeZone = WEEKLY_UPDATE_TIME_ZONE): boolean {
  return weekdayInZone(now, timeZone) === WEEKLY_UPDATE_WEEKDAY;
}

/** Hour 0–23 in the zone (h23). */
export function hourInZone(d: Date, timeZone = WEEKLY_UPDATE_TIME_ZONE): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d).find((p) => p.type === "hour")?.value;
  return Number(hour ?? "0");
}

export function isAtOrAfterLocalHour(
  now: Date,
  hour: number,
  timeZone = WEEKLY_UPDATE_TIME_ZONE,
): boolean {
  return hourInZone(now, timeZone) >= hour;
}

/**
 * Send the Imp Spec ping on Thursday at/after 8:00 in their zone.
 * The 15-minute Logic App can hit this every interval; other days no-op.
 */
export function shouldSendWeeklyUpdateReminder(
  now: Date,
  timeZone = WEEKLY_UPDATE_TIME_ZONE,
): boolean {
  return (
    isWeeklyUpdateReminderDay(now, timeZone) &&
    isAtOrAfterLocalHour(now, WEEKLY_UPDATE_REMINDER_HOUR, timeZone)
  );
}

/** Offset of `date` in `timeZone` vs UTC, milliseconds (Chicago CDT = -5h). */
export function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - date.getTime();
}

/** Instant for a wall-clock Y-M-D HH:MM in an IANA zone. */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const instant = utcGuess - tzOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - tzOffsetMs(new Date(instant), timeZone));
}

export function addCalendarDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = Date.UTC(y!, m! - 1, (d ?? 1) + days, 12, 0, 0);
  return new Date(utc).toISOString().slice(0, 10);
}

/**
 * Thursday 00:00 in `timeZone` that starts the current update week.
 * If `now` is Thursday, that is today at midnight; otherwise the most
 * recent Thursday.
 */
export function thisThursdayStart(now: Date, timeZone = WEEKLY_UPDATE_TIME_ZONE): Date {
  const ymd = calendarDayKey(now, timeZone);
  const weekday = weekdayInZone(now, timeZone);
  const daysBack = (weekday - WEEKLY_UPDATE_WEEKDAY + 7) % 7;
  const thursday = addCalendarDays(ymd, -daysBack);
  const [y, m, d] = thursday.split("-").map(Number);
  return zonedWallTimeToUtc(y!, m!, d!, 0, 0, timeZone);
}

/**
 * Missing this week’s update: no lead-authored status update at or after
 * this Thursday 00:00 in the lead’s zone.
 */
export function siteNeedsThisWeekUpdate(
  lastLeadUpdateAt: Date | string | null | undefined,
  weekStart: Date,
): boolean {
  if (!lastLeadUpdateAt) return true;
  return new Date(lastLeadUpdateAt).getTime() < weekStart.getTime();
}

export type WeeklyUpdateSiteLabel = {
  id: string;
  code: string;
  crmAcronym?: string | null;
  name?: string | null;
};

/** Prefer acronym (CEDAR), then code. */
export function weeklyUpdateSiteLabel(site: WeeklyUpdateSiteLabel): string {
  const acronym = site.crmAcronym?.trim();
  if (acronym) return acronym;
  return site.code;
}

export function formatWeeklyUpdateSiteList(labels: string[]): string {
  return labels.join(", ");
}

export function weeklyUpdateReminderTitle(siteLabels: string[]): string {
  return `Due today: Provide account updates for sites ${formatWeeklyUpdateSiteList(siteLabels)}`;
}

export function weeklyUpdateReminderBody(siteLabels: string[]): string {
  return `Post this week’s account update for ${formatWeeklyUpdateSiteList(siteLabels)} — health / temperature, site concerns, and any new risks.`;
}

export function weeklyUpdateStaffPath(projectId: string): string {
  return `/projects/${projectId}`;
}

export function resolveLeadTimeZone(timeZone?: string | null): string {
  const tz = timeZone?.trim();
  return tz || WEEKLY_UPDATE_TIME_ZONE;
}
