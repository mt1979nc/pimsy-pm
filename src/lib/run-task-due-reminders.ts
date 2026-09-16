/**
 * Assignee due-soon / overdue reminders (P1-G).
 *
 * Writes one in-app TASK_DUE_SOON / TASK_OVERDUE per assignee per task
 * (join table, not only primary `assignee_id`). Uses existing `notify()` —
 * staff email is immediate per prefs; customer email is also offered here
 * so Inbox still fills. Batch customer digest mail is PR #39 and must not
 * be rebuilt in this slice.
 *
 * Trigger: POST/GET /api/cron/task-due-reminders with Bearer CRON_SECRET.
 */

import { and, eq, gte, inArray, isNotNull, ne } from "drizzle-orm";

import { db } from "@/db";
import { notifications, taskAssignees, tasks } from "@/db/schema";
import { notify } from "@/lib/notify";
import {
  classifyDueReminder,
  dueReminderDetail,
  dueReminderPortalPath,
  dueReminderRecipientIds,
  dueReminderStaffPath,
  DUE_REMINDER_COOLDOWN_MS,
  isOpenProjectStatus,
  type DueReminderKind,
} from "@/lib/task-due-reminders";

export type TaskDueReminderResult = {
  now: string;
  scannedTasks: number;
  notificationsCreated: number;
};

export async function runTaskDueReminders(now = new Date()): Promise<TaskDueReminderResult> {
  const rows = await db.query.tasks.findMany({
    where: and(
      eq(tasks.notApplicable, false),
      ne(tasks.status, "CANCELLED"),
      ne(tasks.status, "DONE"),
      isNotNull(tasks.dueDate),
    ),
    columns: {
      id: true,
      title: true,
      dueDate: true,
      projectId: true,
      assigneeId: true,
      visibility: true,
      ownerSide: true,
    },
    with: {
      project: {
        columns: {
          id: true,
          name: true,
          code: true,
          archivedAt: true,
          onboarded: true,
          status: true,
        },
      },
    },
  });

  const due = rows.filter((t) => {
    if (!t.dueDate) return false;
    if (!t.project || t.project.archivedAt || t.project.onboarded) return false;
    if (!isOpenProjectStatus(t.project.status)) return false;
    return classifyDueReminder(t.dueDate, now) !== null;
  });

  const taskIds = due.map((t) => t.id);
  const joinRows =
    taskIds.length === 0
      ? []
      : await db.query.taskAssignees.findMany({
          where: inArray(taskAssignees.taskId, taskIds),
          columns: { taskId: true, userId: true },
        });
  const assigneesByTask = new Map<string, string[]>();
  for (const row of joinRows) {
    const list = assigneesByTask.get(row.taskId) ?? [];
    list.push(row.userId);
    assigneesByTask.set(row.taskId, list);
  }

  const recipientIds = [
    ...new Set(
      due.flatMap((t) =>
        dueReminderRecipientIds({
          assigneeIds: assigneesByTask.get(t.id) ?? [],
          primaryAssigneeId: t.assigneeId,
        }),
      ),
    ),
  ];

  const since = new Date(now.getTime() - DUE_REMINDER_COOLDOWN_MS);
  const existing =
    recipientIds.length === 0
      ? []
      : await db.query.notifications.findMany({
          where: and(
            inArray(notifications.userId, recipientIds),
            inArray(notifications.type, ["TASK_DUE_SOON", "TASK_OVERDUE"]),
            gte(notifications.createdAt, since),
          ),
          columns: { userId: true, type: true, linkUrl: true },
        });
  const seen = new Set(existing.map((n) => `${n.userId}|${n.type}|${n.linkUrl ?? ""}`));

  let notificationsCreated = 0;
  for (const task of due) {
    const kind = classifyDueReminder(task.dueDate, now);
    if (!kind || !task.dueDate) continue;
    const userIds = dueReminderRecipientIds({
      assigneeIds: assigneesByTask.get(task.id) ?? [],
      primaryAssigneeId: task.assigneeId,
    });
    if (userIds.length === 0) continue;

    const type = kind === "overdue" ? "TASK_OVERDUE" : "TASK_DUE_SOON";
    const staffPath = dueReminderStaffPath(task.projectId, task.id);
    const portalPath = dueReminderPortalPath(task.projectId, task.id);
    const fresh = userIds.filter(
      (id) => !seen.has(`${id}|${type}|${staffPath}`) && !seen.has(`${id}|${type}|${portalPath}`),
    );
    if (fresh.length === 0) continue;

    const detail = [dueReminderDetail(task.dueDate, now), task.project.name].filter(Boolean).join(" · ");
    await notify({
      userIds: fresh,
      type,
      title: reminderTitle(kind, task.title),
      body: detail,
      facts: [
        { name: "Project", value: `${task.project.name} (${task.project.code})` },
        { name: "When", value: dueReminderDetail(task.dueDate, now) },
      ],
      linkUrl: staffPath,
      portalLinkUrl: portalPath,
      ctaLabel: "Open the task",
      email: true,
      projectId: task.projectId,
    });
    notificationsCreated += fresh.length;
    for (const id of fresh) {
      seen.add(`${id}|${type}|${staffPath}`);
      seen.add(`${id}|${type}|${portalPath}`);
    }
  }

  return {
    now: now.toISOString(),
    scannedTasks: due.length,
    notificationsCreated,
  };
}

function reminderTitle(kind: DueReminderKind, title: string): string {
  return `${kind === "overdue" ? "Overdue" : "Due soon"}: ${title}`;
}
