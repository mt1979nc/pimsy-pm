"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, orgSettings, type NotificationPrefs, type NotificationType } from "@/db/schema";
import { requireUser, requireAdmin } from "@/lib/guard";
import { isAdmin, ForbiddenError, NotFoundError } from "@/lib/authz";
import {
  typesFor,
  sideForRole,
  builtInDefaults,
  getOrgSettings,
} from "@/lib/notification-prefs";
import { audit } from "@/lib/audit";
import { isAllowedTeamsWebhook, testTeamsWebhook } from "@/lib/teams";
import type { ActionState } from "./messages";

/** Reads the checkbox set out of a form for the side that applies. */
function prefsFromForm(formData: FormData, side: "staff" | "customer"): NotificationPrefs {
  const types: Partial<Record<NotificationType, boolean>> = {};
  for (const a of typesFor(side)) {
    types[a.type] = formData.get(`type.${a.type}`) === "on";
  }
  return {
    emailEnabled: formData.get("emailEnabled") === "on",
    types,
  };
}

/** Anyone can set their own alert preferences — staff and customers alike. */
export async function updateMyAlerts(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireUser();
  const side = sideForRole(actor.role);

  await db
    .update(users)
    .set({ notificationPrefs: prefsFromForm(formData, side), updatedAt: new Date() })
    .where(eq(users.id, actor.id));

  revalidatePath("/settings");
  revalidatePath("/portal/settings");
  return { ok: true };
}

/** Put someone back on the org defaults. */
export async function resetMyAlerts() {
  const actor = await requireUser();
  await db
    .update(users)
    .set({ notificationPrefs: null, updatedAt: new Date() })
    .where(eq(users.id, actor.id));
  revalidatePath("/settings");
  revalidatePath("/portal/settings");
}

/**
 * Admin override for one person. Useful when a customer contact asks you to
 * stop emailing them and you'd rather fix it than explain where the setting is.
 */
export async function updateAlertsForUser(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Missing person." };

  const target = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, role: true, email: true },
  });
  if (!target) throw new NotFoundError("That person no longer exists.");

  const side = sideForRole(target.role);
  await db
    .update(users)
    .set({ notificationPrefs: prefsFromForm(formData, side), updatedAt: new Date() })
    .where(eq(users.id, userId));

  await audit({
    actor,
    action: "user.alerts.changed",
    entityType: "user",
    entityId: userId,
    summary: `Alert settings changed for ${target.email}`,
  });

  revalidatePath("/admin/alerts");
  return { ok: true };
}

/** Org-wide defaults, applied to anyone who hasn't chosen their own. */
export async function updateOrgAlertDefaults(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireUser();
  if (!isAdmin(actor)) throw new ForbiddenError("Administrators only.");

  await getOrgSettings(); // make sure the row exists

  const scope = formData.get("scope")?.toString();
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (scope === "staff") patch.staffDefaults = prefsFromForm(formData, "staff");
  else if (scope === "customer") patch.customerDefaults = prefsFromForm(formData, "customer");
  else if (scope === "email") patch.emailEnabled = formData.get("emailEnabled") === "on";
  else if (scope === "teams") {
    const url = formData.get("teamsWebhookUrl")?.toString().trim() ?? "";
    const on = formData.get("teamsEnabled") === "on";

    // Refuse a destination we don't recognise rather than accepting it and
    // failing silently at send time. This feed can carry internal detail, so a
    // typo'd or pasted-from-elsewhere URL is a leak, not an inconvenience.
    if (url && !isAllowedTeamsWebhook(url)) {
      return {
        error:
          "That doesn't look like a Teams webhook. Copy the URL from Teams → your channel → ⋯ → Workflows → “Post to a channel when a webhook request is received”.",
      };
    }
    if (on && !url) return { error: "Add the webhook URL before turning Teams on." };

    patch.teamsWebhookUrl = url || null;
    patch.teamsEnabled = on;
  } else return { error: "Unknown settings section." };

  await db.update(orgSettings).set(patch).where(eq(orgSettings.id, "singleton"));

  await audit({
    actor,
    action: "org.alert_defaults.changed",
    entityType: "org_settings",
    entityId: "singleton",
    summary: `${scope} defaults updated`,
  });

  revalidatePath("/admin/alerts");
  return { ok: true };
}

/**
 * Posts a card to the saved Teams channel so an admin can confirm the wiring
 * before relying on it. Reports the actual failure rather than a shrug.
 */
export async function sendTeamsTest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireUser();
  if (!isAdmin(actor)) throw new ForbiddenError("Administrators only.");

  const url = formData.get("teamsWebhookUrl")?.toString().trim() || (await getOrgSettings()).teamsWebhookUrl;
  if (!url) return { error: "Save a webhook URL first." };

  const result = await testTeamsWebhook(url);
  if (!result.ok) return { error: result.error };

  await audit({
    actor,
    action: "org.teams.tested",
    entityType: "org_settings",
    entityId: "singleton",
    summary: "Test card posted to Teams",
  });
  return { ok: true };
}

export async function restoreOrgDefaults(scope: "staff" | "customer") {
  const actor = await requireUser();
  if (!isAdmin(actor)) throw new ForbiddenError("Administrators only.");
  await getOrgSettings();

  await db
    .update(orgSettings)
    .set(
      scope === "staff"
        ? { staffDefaults: builtInDefaults("staff"), updatedAt: new Date() }
        : { customerDefaults: builtInDefaults("customer"), updatedAt: new Date() },
    )
    .where(eq(orgSettings.id, "singleton"));

  revalidatePath("/admin/alerts");
}
