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
