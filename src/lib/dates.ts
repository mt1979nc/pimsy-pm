import {
  format,
  formatDistanceToNowStrict,
  differenceInCalendarDays,
  isBefore,
  startOfDay,
  addDays,
} from "date-fns";

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return format(new Date(d), "MMM d, yyyy");
}

export function fmtShort(d: Date | string | null | undefined) {
  if (!d) return "—";
  return format(new Date(d), "MMM d");
}

export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return format(new Date(d), "MMM d, yyyy 'at' h:mm a");
}

export function fmtRelative(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  const days = Math.abs(differenceInCalendarDays(date, new Date()));
  if (days > 30) return format(date, "MMM d, yyyy");
  return `${formatDistanceToNowStrict(date)} ago`;
}

export function daysUntil(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  return differenceInCalendarDays(new Date(d), startOfDay(new Date()));
}

export function isOverdue(due: Date | string | null | undefined, completedAt?: Date | null) {
  if (!due || completedAt) return false;
  return isBefore(new Date(due), startOfDay(new Date()));
}

/** "Due in 3 days" / "2 days overdue" / "Due today" */
export function dueLabel(due: Date | string | null | undefined, completedAt?: Date | null) {
  if (!due) return null;
  if (completedAt) return `Completed ${fmtShort(completedAt)}`;
  const d = daysUntil(due);
  if (d === null) return null;
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue`;
  if (d <= 14) return `Due in ${d} days`;
  return `Due ${fmtShort(due)}`;
}

export { addDays, startOfDay, differenceInCalendarDays };

/** UTC YYYY-MM-DD key for calendar-day compares (ignores local TZ / noon vs midnight). */
export function utcDayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parse a date-only form value (`YYYY-MM-DD`) as UTC noon so CT (UTC-5/-6)
 * never shifts the displayed calendar day. Empty/invalid → null.
 */
export function parseDateInput(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Already an ISO datetime — accept as-is if valid.
  if (trimmed.includes("T")) {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(`${trimmed}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format a stored date for `<input type="date">` using UTC calendar parts. */
export function toDateInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  return utcDayKey(dt);
}

/** Signed calendar-day delta in UTC (to − from). */
export function utcCalendarDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}
