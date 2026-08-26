import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  notifications,
  users,
  threadParticipants,
  type NotificationType,
} from "@/db/schema";
import { sendEmail, layout, plainText, type Fact, type LayoutOpts } from "./email";
import { env } from "./env";
import { getOrgSettings, shouldEmail } from "./notification-prefs";
import { postToTeams } from "./teams";

type NotifyArgs = {
  userIds: string[];
  type: NotificationType;
  title: string;
  body?: string;
  linkUrl?: string;
  /**
   * Where a CUSTOMER recipient should be sent instead. Staff and customers
   * reach the same object by different routes, and one audience list can hold
   * both — a customer following a `/projects/...` link only finds a 404.
   * Falls back to `linkUrl` when omitted.
   */
  portalLinkUrl?: string;
  /**
   * Whether this event is email-worthy at all. Even when true, each recipient's
   * own alert preferences decide whether they actually get one — the in-app
   * notification is always created either way.
   */
  email?: boolean;
  /** Do not notify this user (usually the actor). */
  exceptUserId?: string;

  // --- presentation, shared by the email and the Teams card ----------------
  /** Label/value context rows: project, who did it, what's due when. */
  facts?: Fact[];
  /** An excerpt — the message or comment that triggered this. */
  quote?: { author: string; text: string };
  /** What the button should say. */
  ctaLabel?: string;

  // --- Teams ---------------------------------------------------------------
  /**
   * Also post this to the staff Teams channel. Posted ONCE for the event, not
   * per recipient, and independent of anyone's email preferences — a channel
   * feed belongs to the team, not to an individual. No-ops unless an admin has
   * turned Teams on and saved a webhook URL.
   *
   * Only pass true for events a staff channel should see. The channel lives
   * inside your tenant and no customer can read it, but it is still a
   * broadcast: don't route someone's private view into it.
   */
  teams?: boolean;
  teamsTone?: "good" | "warning" | "attention" | "accent";
  /** Scopes the Teams post to a project's own channel when one is configured. */
  projectId?: string;
};

export async function notify({
  userIds,
  type,
  title,
  body,
  linkUrl,
  portalLinkUrl,
  email = false,
  exceptUserId,
  facts,
  quote,
  ctaLabel,
  teams = false,
  teamsTone,
  projectId,
}: NotifyArgs) {
  if (teams) {
    // Deliberately not awaited into the critical path below — but also not
    // left dangling, so a serverless invocation doesn't get frozen mid-POST.
    await postToTeams(
      {
        title,
        text:
          [body, quote ? `_${quote.author}:_ “${quote.text}”` : null]
            .filter(Boolean)
            .join("\n\n") || undefined,
        facts,
        linkUrl,
        linkLabel: ctaLabel,
        tone: teamsTone,
      },
      projectId,
    );
  }

  const targets = Array.from(new Set(userIds)).filter((id) => id && id !== exceptUserId);
  if (targets.length === 0) return;

  const recipients = await db.query.users.findMany({
    where: and(inArray(users.id, targets), eq(users.isActive, true)),
    columns: {
      id: true,
      email: true,
      name: true,
      role: true,
      notificationPrefs: true,
    },
  });
  if (recipients.length === 0) return;

  // Decide who gets an email before writing rows, so emailedAt is truthful.
  const org = email ? await getOrgSettings() : null;
  const emailable = email ? recipients.filter((r) => shouldEmail(r, type, org)) : [];
  const emailableIds = new Set(emailable.map((r) => r.id));

  /** Staff and customers reach the same object by different routes. */
  const routeFor = (role: string) =>
    role === "CUSTOMER" ? (portalLinkUrl ?? linkUrl) : linkUrl;

  await db.insert(notifications).values(
    recipients.map((r) => ({
      userId: r.id,
      type,
      title,
      body: body ?? null,
      linkUrl: routeFor(r.role) ?? null,
      emailedAt: emailableIds.has(r.id) ? new Date() : null,
    })),
  );

  if (emailable.length === 0) return;

  // Customers get the portal wording; staff get the app wording. Everything
  // else about the message is identical, because the caller has already
  // decided what is safe to say to this audience.
  const build = (isCustomer: boolean): LayoutOpts => ({
    heading: title,
    paragraphs: body ? [body] : [],
    quote,
    facts,
    cta: {
      label: ctaLabel ?? (isCustomer ? "Open your project" : "Open in PIMSY Implementations"),
      url: `${env.APP_URL}${routeFor(isCustomer ? "CUSTOMER" : "STAFF") ?? ""}`,
    },
    footer: isCustomer
      ? "You're getting this because of your notification settings. You can change them from your portal, or reply to this email and we'll do it for you."
      : "You're getting this because of your alert settings. Change them any time from Settings.",
  });

  await Promise.allSettled(
    emailable.map((r) => {
      const opts = build(r.role === "CUSTOMER");
      return sendEmail({
        to: r.email,
        subject: title,
        html: layout(opts),
        text: plainText(opts),
      });
    }),
  );
}

/** Everyone following a thread, minus the author. */
export async function threadRecipients(threadId: string, exceptUserId?: string) {
  const rows = await db
    .select({ userId: threadParticipants.userId })
    .from(threadParticipants)
    .where(
      exceptUserId
        ? and(
            eq(threadParticipants.threadId, threadId),
            eq(threadParticipants.isMuted, false),
            ne(threadParticipants.userId, exceptUserId),
          )
        : and(eq(threadParticipants.threadId, threadId), eq(threadParticipants.isMuted, false)),
    );
  return rows.map((r) => r.userId);
}
