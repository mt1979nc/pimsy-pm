import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orgSettings, type NotificationPrefs, type NotificationType, type Role } from "@/db/schema";

/**
 * Alert preferences.
 *
 * In-app notifications always happen — they are just a list, and suppressing
 * them would hide things people need. What is configurable is EMAIL, because
 * that is what interrupts someone's day.
 *
 * Resolution order: the person's own setting, then the org default for their
 * side, then the built-in default below.
 */

export type Audience = "staff" | "customer" | "both";

export const ALERT_TYPES: {
  type: NotificationType;
  label: string;
  description: string;
  audience: Audience;
  staffDefault: boolean;
  customerDefault: boolean;
}[] = [
  {
    type: "TASK_ASSIGNED",
    label: "Assigned to me",
    description: "Somebody puts a task in your name.",
    audience: "both",
    staffDefault: true,
    customerDefault: true,
  },
  {
    type: "TASK_DUE_SOON",
    label: "Due soon",
    description: "A reminder before something you own is due.",
    audience: "both",
    staffDefault: false,
    customerDefault: true,
  },
  {
    type: "TASK_OVERDUE",
    label: "Overdue",
    description: "Something you own has passed its due date.",
    audience: "both",
    staffDefault: true,
    customerDefault: true,
  },
  {
    type: "TASK_COMPLETED",
    label: "Work finished",
    description:
      "Someone finishes a task on a project you lead — including the customer clearing one of their action items.",
    audience: "both",
    staffDefault: true,
    customerDefault: true,
  },
  {
    type: "FILE_UPLOADED",
    label: "Files & links added",
    description: "A document, image or link is attached to a task on your project.",
    audience: "both",
    staffDefault: true,
    customerDefault: false,
  },
  {
    type: "TASK_COMMENTED",
    label: "Comments on my tasks",
    description: "Someone comments on a task you own or lead.",
    audience: "both",
    staffDefault: true,
    customerDefault: true,
  },
  {
    type: "MESSAGE_POSTED",
    label: "New messages",
    description: "A new message in a conversation you're part of.",
    audience: "both",
    staffDefault: true,
    customerDefault: true,
  },
  {
    type: "MENTIONED",
    label: "Mentions",
    description: "Someone mentions you by name in a message.",
    audience: "both",
    staffDefault: true,
    customerDefault: true,
  },
  {
    type: "STATUS_UPDATE_PUBLISHED",
    label: "Project updates",
    description: "A new status update is published on your project.",
    audience: "both",
    staffDefault: false,
    customerDefault: true,
  },
  {
    type: "MILESTONE_COMPLETED",
    label: "Milestones",
    description: "A milestone on your project is completed.",
    audience: "both",
    staffDefault: false,
    customerDefault: true,
  },
  {
    type: "PROJECT_HEALTH_CHANGED",
    label: "Project flagged at risk",
    description: "A project's health drops to at-risk. Leadership usually wants this.",
    audience: "staff",
    staffDefault: true,
    customerDefault: false,
  },
  {
    type: "RISK_RAISED",
    label: "New risks",
    description: "A risk is logged on a project you lead.",
    audience: "staff",
    staffDefault: true,
    customerDefault: false,
  },
];

export function builtInDefaults(side: "staff" | "customer"): NotificationPrefs {
  const types: Partial<Record<NotificationType, boolean>> = {};
  for (const a of ALERT_TYPES) {
    if (side === "staff" && a.audience === "customer") continue;
    if (side === "customer" && a.audience === "staff") continue;
    types[a.type] = side === "staff" ? a.staffDefault : a.customerDefault;
  }
  return { emailEnabled: true, types };
}

export function typesFor(side: "staff" | "customer") {
  return ALERT_TYPES.filter((a) => a.audience === "both" || a.audience === side);
}

export const sideForRole = (role: Role): "staff" | "customer" =>
  role === "CUSTOMER" ? "customer" : "staff";

/** Reads the org settings row, creating it on first use. */
export async function getOrgSettings() {
  const existing = await db.query.orgSettings.findFirst({
    where: eq(orgSettings.id, "singleton"),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(orgSettings)
    .values({
      id: "singleton",
      staffDefaults: builtInDefaults("staff"),
      customerDefaults: builtInDefaults("customer"),
      emailEnabled: true,
    })
    .onConflictDoNothing()
    .returning();

  return (
    created ??
    (await db.query.orgSettings.findFirst({ where: eq(orgSettings.id, "singleton") }))!
  );
}

/** The effective preferences for one person. */
export function resolvePrefs(
  user: { role: Role; notificationPrefs?: NotificationPrefs | null },
  org?: { staffDefaults?: NotificationPrefs | null; customerDefaults?: NotificationPrefs | null } | null,
): NotificationPrefs {
  const side = sideForRole(user.role);
  const fallback =
    (side === "staff" ? org?.staffDefaults : org?.customerDefaults) ?? builtInDefaults(side);

  if (!user.notificationPrefs) return fallback;
  return {
    emailEnabled: user.notificationPrefs.emailEnabled ?? fallback.emailEnabled,
    types: { ...fallback.types, ...user.notificationPrefs.types },
  };
}

/** Should this person be emailed about this event? */
export function shouldEmail(
  user: { role: Role; notificationPrefs?: NotificationPrefs | null },
  type: NotificationType,
  org?: { staffDefaults?: NotificationPrefs | null; customerDefaults?: NotificationPrefs | null; emailEnabled?: boolean } | null,
): boolean {
  if (org && org.emailEnabled === false) return false;
  const prefs = resolvePrefs(user, org);
  if (!prefs.emailEnabled) return false;
  const explicit = prefs.types[type];
  if (explicit !== undefined) return explicit;
  const meta = ALERT_TYPES.find((a) => a.type === type);
  if (!meta) return true;
  return sideForRole(user.role) === "staff" ? meta.staffDefault : meta.customerDefault;
}
