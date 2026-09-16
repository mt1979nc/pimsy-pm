/**
 * Customer email digest job.
 *
 * 1. Scan SHARED customer-owned tasks due today/tomorrow or overdue.
 *    Write one in-app notification per task per contact (idempotent inside
 *    the cooldown window). Do not email yet.
 * 2. Collect unemailed coalescible rows (due soon, overdue, staff messages)
 *    and send **one** PATH summary per customer, with a portal deep link on
 *    each item. Staff email is not sent from this job.
 *
 * Trigger: POST/GET /api/cron/customer-digest with Bearer CRON_SECRET.
 * Azure: Logic App recurrence every 15 minutes (see azure/README.md).
 */

import { and, eq, inArray, isNull, isNotNull, ne, gte } from "drizzle-orm";
import { db } from "@/db";
import { notifications, tasks, users } from "@/db/schema";
import { env } from "@/lib/env";
import { sendEmail, layout, plainText } from "@/lib/email";
import { notify } from "@/lib/notify";
import { getOrgSettings, shouldEmail } from "@/lib/notification-prefs";
import { isCustomerVisiblePhase, isPortalFacingTask } from "@/lib/task-visibility";
import {
  CUSTOMER_DIGEST_TYPES,
  DIGEST_REMINDER_COOLDOWN_MS,
  classifyCustomerDue,
  composeCustomerDigest,
  dueSoonDetail,
  isCustomerDigestType,
  notificationToDigestItem,
  portalTaskPath,
  type DigestItem,
} from "@/lib/customer-digest";

const OPEN_PROJECT_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "BLOCKED"] as const;

export type CustomerDigestResult = {
  now: string;
  scannedTasks: number;
  notificationsCreated: number;
  emailsSent: number;
  recipients: number;
  skippedNoItems: number;
};

export async function runCustomerDigest(now = new Date()): Promise<CustomerDigestResult> {
  const created = await createDueNotifications(now);
  const sent = await sendPendingDigests(now);

  return {
    now: now.toISOString(),
    scannedTasks: created.scannedTasks,
    notificationsCreated: created.notificationsCreated,
    emailsSent: sent.emailsSent,
    recipients: sent.recipients,
    skippedNoItems: sent.skippedNoItems,
  };
}

async function createDueNotifications(now: Date) {
  const rows = await db.query.tasks.findMany({
    where: and(
      eq(tasks.visibility, "SHARED"),
      eq(tasks.ownerSide, "CUSTOMER"),
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
      parentTaskId: true,
      ownerSide: true,
      visibility: true,
      status: true,
      notApplicable: true,
    },
    with: {
      project: {
        columns: {
          id: true,
          name: true,
          code: true,
          portalEnabled: true,
          archivedAt: true,
          onboarded: true,
          status: true,
          customerAccountId: true,
        },
      },
      phase: { columns: { visibility: true, notApplicable: true, name: true } },
    },
  });

  const due = rows.filter((t) => {
    if (!t.dueDate) return false;
    if (!isPortalFacingTask(t)) return false;
    if (!isCustomerVisiblePhase(t.phase)) return false;
    const p = t.project;
    if (!p?.portalEnabled || p.archivedAt || p.onboarded) return false;
    if (!p.customerAccountId) return false;
    if (!OPEN_PROJECT_STATUSES.includes(p.status as (typeof OPEN_PROJECT_STATUSES)[number])) {
      return false;
    }
    return classifyCustomerDue(t.dueDate, now) !== null;
  });

  const accountIds = [
    ...new Set(due.map((t) => t.project.customerAccountId).filter((id): id is string => Boolean(id))),
  ];
  const contacts =
    accountIds.length === 0
      ? []
      : await db.query.users.findMany({
          where: and(
            eq(users.role, "CUSTOMER"),
            eq(users.isActive, true),
            inArray(users.customerAccountId, accountIds),
          ),
          columns: { id: true, customerAccountId: true },
        });

  const contactsByAccount = new Map<string, string[]>();
  for (const c of contacts) {
    if (!c.customerAccountId) continue;
    const list = contactsByAccount.get(c.customerAccountId) ?? [];
    list.push(c.id);
    contactsByAccount.set(c.customerAccountId, list);
  }

  const contactIds = contacts.map((c) => c.id);
  const since = new Date(now.getTime() - DIGEST_REMINDER_COOLDOWN_MS);
  const existing =
    contactIds.length === 0
      ? []
      : await db.query.notifications.findMany({
          where: and(
            inArray(notifications.userId, contactIds),
            inArray(notifications.type, ["TASK_DUE_SOON", "TASK_OVERDUE"]),
            gte(notifications.createdAt, since),
          ),
          columns: { userId: true, type: true, linkUrl: true },
        });

  const seen = new Set(existing.map((n) => `${n.userId}|${n.type}|${n.linkUrl ?? ""}`));

  let notificationsCreated = 0;
  for (const task of due) {
    const kind = classifyCustomerDue(task.dueDate, now);
    if (!kind || !task.dueDate) continue;
    const accountId = task.project.customerAccountId;
    if (!accountId) continue;
    const userIds = contactsByAccount.get(accountId) ?? [];
    if (userIds.length === 0) continue;

    const type = kind === "overdue" ? "TASK_OVERDUE" : "TASK_DUE_SOON";
    const portal = portalTaskPath(task.projectId, task.id);
    const fresh = userIds.filter((id) => !seen.has(`${id}|${type}|${portal}`));
    if (fresh.length === 0) continue;

    const detail = [dueSoonDetail(task.dueDate, now), task.project.name].filter(Boolean).join(" · ");
    await notify({
      userIds: fresh,
      type,
      title: `${kind === "overdue" ? "Overdue" : "Due soon"}: ${task.title}`,
      body: detail,
      linkUrl: `/projects/${task.projectId}/tasks/${task.id}`,
      portalLinkUrl: portal,
      ctaLabel: "Open the task",
      email: true,
    });
    notificationsCreated += fresh.length;
    for (const id of fresh) seen.add(`${id}|${type}|${portal}`);
  }

  return { scannedTasks: due.length, notificationsCreated };
}

async function sendPendingDigests(_now: Date) {
  const pending = await db.query.notifications.findMany({
    where: and(isNull(notifications.emailedAt), inArray(notifications.type, [...CUSTOMER_DIGEST_TYPES])),
    columns: {
      id: true,
      userId: true,
      type: true,
      title: true,
      body: true,
      linkUrl: true,
    },
  });
  if (pending.length === 0) {
    return { emailsSent: 0, recipients: 0, skippedNoItems: 0 };
  }

  const userIds = [...new Set(pending.map((n) => n.userId))];
  const recipients = await db.query.users.findMany({
    where: and(inArray(users.id, userIds), eq(users.role, "CUSTOMER"), eq(users.isActive, true)),
    columns: { id: true, email: true, name: true, role: true, notificationPrefs: true },
  });
  const byUser = new Map(recipients.map((r) => [r.id, r]));
  const org = await getOrgSettings();

  const grouped = new Map<string, typeof pending>();
  for (const row of pending) {
    if (!isCustomerDigestType(row.type)) continue;
    const user = byUser.get(row.userId);
    if (!user) continue;
    const list = grouped.get(row.userId) ?? [];
    list.push(row);
    grouped.set(row.userId, list);
  }

  let emailsSent = 0;
  let skippedNoItems = 0;
  const appUrl = env.APP_URL;

  for (const [userId, rows] of grouped) {
    const user = byUser.get(userId)!;
    const items: DigestItem[] = [];
    const includedIds: string[] = [];
    for (const row of rows) {
      if (!shouldEmail(user, row.type, org)) continue;
      const item = notificationToDigestItem(row);
      if (!item) continue;
      items.push(item);
      includedIds.push(row.id);
    }
    if (items.length === 0) {
      skippedNoItems += 1;
      continue;
    }

    const composed = composeCustomerDigest({ items, appUrl });
    if (!composed) {
      skippedNoItems += 1;
      continue;
    }

    try {
      await sendEmail({
        to: user.email,
        subject: composed.subject,
        html: layout(composed.opts),
        text: plainText(composed.opts),
      });
      await db
        .update(notifications)
        .set({ emailedAt: new Date() })
        .where(inArray(notifications.id, includedIds));
      emailsSent += 1;
    } catch (err) {
      console.error("customer digest send failed", user.email, err);
    }
  }

  return { emailsSent, recipients: grouped.size, skippedNoItems };
}
