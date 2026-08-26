/**
 * Microsoft Teams channel feed.
 *
 * Microsoft retired the Office 365 "Incoming Webhook" connector on 22 May 2026.
 * The supported replacement is a Power Automate **Workflows** webhook, created
 * from inside Teams itself:
 *
 *   Channel → ⋯ → Workflows → "Post to a channel when a webhook request is
 *   received" → pick the team and channel → copy the URL.
 *
 * That needs no Azure app registration and no admin consent, which is why this
 * is the integration we ship. It posts an Adaptive Card into one channel.
 *
 * ---------------------------------------------------------------------------
 * TWO RULES, BOTH LOAD-BEARING
 *
 * 1. This is a STAFF channel inside your own tenant, so a card may carry
 *    internal detail. It follows that a card must never be sent on behalf of,
 *    or about, a customer's private view — callers pass what they want shown.
 *    Customers are external to the tenant and can never receive one.
 *
 * 2. Because cards can carry internal detail, the destination is not free-form.
 *    A pasted URL must resolve to a Microsoft-operated host (see ALLOWED_HOSTS)
 *    or we refuse to send. Without this, one bad paste into an admin field —
 *    or one injected value — quietly forwards the internal back channel to a
 *    third party.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { env } from "./env";
import { getOrgSettings } from "./notification-prefs";

/**
 * Hosts a Power Automate Workflows webhook can legitimately live on. Power
 * Automate mints URLs under regional Logic Apps hosts; the last two are the
 * retired connector hosts, kept so an old URL fails loudly at Microsoft rather
 * than silently here.
 */
const ALLOWED_HOSTS = [
  "logic.azure.com",
  "logic.azure.us",
  "azure-apim.net",
  "powerplatform.com",
  "powerautomate.com",
  "webhook.office.com",
  "office.com",
];

export function isAllowedTeamsWebhook(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export type TeamsCard = {
  /** Headline, e.g. "Riverbend Counseling — customer completed a task". */
  title: string;
  /** One or two sentences of context. */
  text?: string;
  /** Label/value rows rendered as a fact table. */
  facts?: { name: string; value: string }[];
  /** App-relative path; turned into an absolute URL for the card button. */
  linkUrl?: string;
  linkLabel?: string;
  /** Drives the colour bar down the left of the card. */
  tone?: "good" | "warning" | "attention" | "accent";
};

/**
 * Resolves the destination for a project: its own channel if it has one, else
 * the org-wide channel. Returns null when Teams is off or unconfigured.
 */
async function resolveWebhook(projectId?: string): Promise<string | null> {
  const org = await getOrgSettings();
  if (!org.teamsEnabled) return null;

  let url = org.teamsWebhookUrl?.trim() || null;

  if (projectId) {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
      columns: { teamsWebhookUrl: true },
    });
    const override = project?.teamsWebhookUrl?.trim();
    if (override) url = override;
  }

  if (!url) return null;
  if (!isAllowedTeamsWebhook(url)) {
    console.error(
      "[teams] refusing to post: webhook host is not a Microsoft endpoint. " +
        "Re-copy the URL from Teams → Workflows.",
    );
    return null;
  }
  return url;
}

function adaptiveCard(card: TeamsCard) {
  const colour =
    card.tone === "good"
      ? "Good"
      : card.tone === "warning"
        ? "Warning"
        : card.tone === "attention"
          ? "Attention"
          : "Accent";

  const body: unknown[] = [
    {
      type: "TextBlock",
      text: card.title,
      weight: "Bolder",
      size: "Medium",
      wrap: true,
      color: colour,
    },
  ];

  if (card.text) {
    body.push({ type: "TextBlock", text: card.text, wrap: true, spacing: "Small" });
  }

  if (card.facts?.length) {
    body.push({
      type: "FactSet",
      spacing: "Medium",
      facts: card.facts.map((f) => ({ title: f.name, value: f.value })),
    });
  }

  const actions = card.linkUrl
    ? [
        {
          type: "Action.OpenUrl",
          title: card.linkLabel ?? "Open in PIMSY Implementations",
          url: `${env.APP_URL}${card.linkUrl}`,
        },
      ]
    : [];

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          msteams: { width: "Full" },
          body,
          actions,
        },
      },
    ],
  };
}

/**
 * Posts to an explicit URL and reports what happened. Used by the "send a test
 * card" button, where silence is exactly the wrong answer — an admin needs to
 * know whether the URL they pasted actually reaches their channel.
 */
export async function testTeamsWebhook(
  url: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAllowedTeamsWebhook(url)) {
    return { ok: false, error: "That URL isn't a Microsoft Teams webhook endpoint." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        adaptiveCard({
          title: "PIMSY Implementations is connected",
          text:
            "This channel will now receive customer activity: messages, completed action items, and documents added to a task.",
          tone: "good",
        }),
      ),
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `Teams rejected the post (HTTP ${res.status}). The workflow may be turned off, or the URL may have expired.`,
      };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: msg.includes("aborted")
        ? "Timed out reaching Teams after 8 seconds."
        : `Could not reach Teams: ${msg}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fire-and-forget. A Teams outage must never fail the user's action, so every
 * failure is logged and swallowed — the in-app notification and the email have
 * already been written by the time this runs.
 */
export async function postToTeams(card: TeamsCard, projectId?: string): Promise<void> {
  try {
    const url = await resolveWebhook(projectId);
    if (!url) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adaptiveCard(card)),
        signal: controller.signal,
      });
      if (!res.ok) {
        console.error(`[teams] webhook returned ${res.status}: ${await res.text()}`);
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.error("[teams] post failed:", err instanceof Error ? err.message : err);
  }
}
