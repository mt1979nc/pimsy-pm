/**
 * Thursday Imp Spec reminder: sites whose lead has not posted a status
 * update since this Thursday 00:00 (lead TZ, default America/Chicago).
 *
 * Writes one in-app STATUS_UPDATE_DUE row per lead and emails immediately
 * (staff default on). Idempotent for the rest of Thursday.
 *
 * Trigger: POST/GET /api/cron/weekly-status-update-reminder with Bearer
 * CRON_SECRET. Safe to call every 15 minutes — no-ops off Thursday / before
 * 8:00 local.
 */

import { and, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/db";
import { notifications, projects, statusUpdates } from "@/db/schema";
import { isExcludedFromAnalytics } from "@/lib/analytics-exclude";
import { notify } from "@/lib/notify";
import { OPEN_IMPLEMENTATION_STATUSES } from "@/lib/weekly-meeting-types";
import {
  resolveLeadTimeZone,
  shouldSendWeeklyUpdateReminder,
  siteNeedsThisWeekUpdate,
  thisThursdayStart,
  weeklyUpdateReminderBody,
  weeklyUpdateReminderTitle,
  WEEKLY_UPDATE_REMINDER_TYPE,
  weeklyUpdateSiteLabel,
  weeklyUpdateStaffPath,
} from "@/lib/weekly-status-update";

export type WeeklyStatusUpdateReminderResult = {
  now: string;
  scannedProjects: number;
  missingSites: number;
  leadsNotified: number;
  notificationsCreated: number;
  skippedNotDueDay: number;
  skippedAlreadyNotified: number;
};

type LeadBucket = {
  leadId: string;
  timeZone: string;
  sites: { id: string; label: string }[];
};

export async function runWeeklyStatusUpdateReminder(
  now = new Date(),
): Promise<WeeklyStatusUpdateReminderResult> {
  const result: WeeklyStatusUpdateReminderResult = {
    now: now.toISOString(),
    scannedProjects: 0,
    missingSites: 0,
    leadsNotified: 0,
    notificationsCreated: 0,
    skippedNotDueDay: 0,
    skippedAlreadyNotified: 0,
  };

  const rows = await db.query.projects.findMany({
    where: and(
      eq(projects.type, "IMPLEMENTATION"),
      inArray(projects.status, [...OPEN_IMPLEMENTATION_STATUSES]),
      isNull(projects.archivedAt),
      eq(projects.onboarded, false),
      isNotNull(projects.leadId),
    ),
    columns: {
      id: true,
      name: true,
      code: true,
      crmAcronym: true,
      leadId: true,
      onboarded: true,
      excludeFromAnalytics: true,
    },
    with: {
      lead: {
        columns: {
          id: true,
          name: true,
          email: true,
          timeZone: true,
          isActive: true,
          role: true,
        },
      },
      customerAccount: { columns: { id: true, excludeFromAnalytics: true } },
    },
  });

  const open = rows.filter((p) => {
    if (!p.leadId || !p.lead || !p.lead.isActive) return false;
    if (p.lead.role === "CUSTOMER") return false;
    if (isExcludedFromAnalytics(p)) return false;
    return true;
  });
  result.scannedProjects = open.length;
  if (open.length === 0) return result;

  const lookback = new Date(now.getTime() - 8 * 86_400_000);
  const leadIds = [...new Set(open.map((p) => p.leadId!))];
  const projectIds = open.map((p) => p.id);

  const updates = await db.query.statusUpdates.findMany({
    where: and(
      inArray(statusUpdates.projectId, projectIds),
      inArray(statusUpdates.authorId, leadIds),
      gte(statusUpdates.publishedAt, lookback),
    ),
    columns: {
      projectId: true,
      authorId: true,
      publishedAt: true,
    },
  });

  const lastByProjectLead = new Map<string, Date>();
  for (const u of updates) {
    if (!u.publishedAt) continue;
    const key = `${u.projectId}|${u.authorId}`;
    const prev = lastByProjectLead.get(key);
    if (!prev || u.publishedAt.getTime() > prev.getTime()) {
      lastByProjectLead.set(key, u.publishedAt);
    }
  }

  const buckets = new Map<string, LeadBucket>();
  for (const project of open) {
    const leadId = project.leadId!;
    const timeZone = resolveLeadTimeZone(project.lead?.timeZone);
    if (!shouldSendWeeklyUpdateReminder(now, timeZone)) {
      result.skippedNotDueDay += 1;
      continue;
    }
    const weekStart = thisThursdayStart(now, timeZone);
    const last = lastByProjectLead.get(`${project.id}|${leadId}`) ?? null;
    if (!siteNeedsThisWeekUpdate(last, weekStart)) continue;

    const bucket = buckets.get(leadId) ?? { leadId, timeZone, sites: [] };
    bucket.sites.push({
      id: project.id,
      label: weeklyUpdateSiteLabel({
        id: project.id,
        code: project.code,
        crmAcronym: project.crmAcronym,
        name: project.name,
      }),
    });
    buckets.set(leadId, bucket);
  }

  result.missingSites = [...buckets.values()].reduce((n, b) => n + b.sites.length, 0);
  if (buckets.size === 0) return result;

  const recipientIds = [...buckets.keys()];
  const existing = await db.query.notifications.findMany({
    where: and(
      inArray(notifications.userId, recipientIds),
      eq(notifications.type, WEEKLY_UPDATE_REMINDER_TYPE),
      gte(notifications.createdAt, new Date(now.getTime() - 8 * 86_400_000)),
    ),
    columns: { userId: true, createdAt: true },
  });
  const already = new Set<string>();
  for (const row of existing) {
    const bucket = buckets.get(row.userId);
    if (!bucket) continue;
    const weekStart = thisThursdayStart(now, bucket.timeZone);
    if (row.createdAt.getTime() >= weekStart.getTime()) already.add(row.userId);
  }

  for (const bucket of buckets.values()) {
    if (bucket.sites.length === 0) continue;
    if (already.has(bucket.leadId)) {
      result.skippedAlreadyNotified += 1;
      continue;
    }
    const labels = [...new Set(bucket.sites.map((s) => s.label))].sort((a, b) =>
      a.localeCompare(b),
    );
    const first = bucket.sites[0]!;
    await notify({
      userIds: [bucket.leadId],
      type: WEEKLY_UPDATE_REMINDER_TYPE,
      title: weeklyUpdateReminderTitle(labels),
      body: weeklyUpdateReminderBody(labels),
      facts: [{ name: "Sites", value: labels.join(", ") }],
      linkUrl: weeklyUpdateStaffPath(first.id),
      ctaLabel: labels.length === 1 ? "Open the project" : "Open PATH",
      email: true,
      projectId: first.id,
    });
    result.leadsNotified += 1;
    result.notificationsCreated += 1;
  }

  return result;
}
