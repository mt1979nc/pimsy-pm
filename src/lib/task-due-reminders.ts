/**
 * Due-soon / overdue classification for assignee reminders (P1-G).
 *
 * Client-safe: no Postgres, Resend, or env. Customer *digest emails* stay
 * on PR #39 — this module only decides which calendar bucket a due date
 * falls in so the scanner can notify every assignee (join table, not just
 * the primary `assignee_id`).
 */

/** Business calendar for “due today / tomorrow” (PIMSY is Eastern). */
export const DUE_REMINDER_TIME_ZONE = "America/New_York";

/** Today and tomorrow on the Eastern calendar. */
export const DUE_SOON_CALENDAR_DAYS = 1;

/** Do not re-flag the same user+task due-soon/overdue inside this window. */
export const DUE_REMINDER_COOLDOWN_MS = 20 * 60 * 60 * 1000;

export const OPEN_PROJECT_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "BLOCKED"] as const;

export type DueReminderKind = "overdue" | "due_soon";

/** YYYY-MM-DD in the given IANA zone (en-CA). */
export function calendarDayKey(d: Date, timeZone = DUE_REMINDER_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function calendarDaysUntilDue(
  due: Date | string,
  now: Date,
  timeZone = DUE_REMINDER_TIME_ZONE,
): number {
  const a = calendarDayKey(now, timeZone);
  const b = calendarDayKey(new Date(due), timeZone);
  const aMs = Date.parse(`${a}T12:00:00.000Z`);
  const bMs = Date.parse(`${b}T12:00:00.000Z`);
  return Math.round((bMs - aMs) / 86_400_000);
}

export function classifyDueReminder(
  due: Date | string | null | undefined,
  now: Date,
  timeZone = DUE_REMINDER_TIME_ZONE,
): DueReminderKind | null {
  if (!due) return null;
  const days = calendarDaysUntilDue(due, now, timeZone);
  if (days < 0) return "overdue";
  if (days <= DUE_SOON_CALENDAR_DAYS) return "due_soon";
  return null;
}

export function dueReminderDetail(due: Date | string, now: Date): string {
  const days = calendarDaysUntilDue(due, now);
  if (days < 0) {
    const n = Math.abs(days);
    return n === 1 ? "1 day overdue" : `${n} days overdue`;
  }
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

export function dueReminderStaffPath(projectId: string, taskId: string): string {
  return `/projects/${projectId}/tasks/${taskId}`;
}

export function dueReminderPortalPath(projectId: string, taskId: string): string {
  return `/portal/projects/${projectId}/tasks/${taskId}`;
}

/**
 * Everyone who should get a due/overdue ping: every join-table assignee,
 * plus the denormalized primary if the join is empty (legacy rows).
 */
export function dueReminderRecipientIds(opts: {
  assigneeIds: string[];
  primaryAssigneeId?: string | null;
}): string[] {
  const ids: string[] = [];
  for (const id of opts.assigneeIds) {
    if (id && !ids.includes(id)) ids.push(id);
  }
  if (opts.primaryAssigneeId && !ids.includes(opts.primaryAssigneeId)) {
    ids.push(opts.primaryAssigneeId);
  }
  return ids;
}

export function isOpenProjectStatus(status: string | null | undefined): boolean {
  return Boolean(
    status && (OPEN_PROJECT_STATUSES as readonly string[]).includes(status),
  );
}
