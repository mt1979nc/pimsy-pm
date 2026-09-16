/**
 * Customer email digest — composition only.
 *
 * In-app notifications stay per-event (one Inbox / notification row per task
 * or message). Customer *email* for coalescible types is held and sent as one
 * PATH summary with a portal deep link per item.
 *
 * Client-safe: no Postgres, Resend, or env imports. Do not import this from a
 * `"use client"` file that also pulls `@/db`.
 */

/**
 * Types that must not email a customer immediately — they wait for the digest.
 * Kept as a string list so this module never imports `@/db` or Resend.
 */
export const CUSTOMER_DIGEST_TYPES = [
  "TASK_DUE_SOON",
  "TASK_OVERDUE",
  "MESSAGE_POSTED",
] as const;

export type CustomerDigestType = (typeof CUSTOMER_DIGEST_TYPES)[number];

export function isCustomerDigestType(type: string): type is CustomerDigestType {
  return (CUSTOMER_DIGEST_TYPES as readonly string[]).includes(type);
}

/** Staff still get immediate email; only CUSTOMER + digest types are held. */
export function holdCustomerEmail(role: string, type: string): boolean {
  return role === "CUSTOMER" && isCustomerDigestType(type);
}

/** Business calendar for “due today / tomorrow” (PIMSY is Eastern). */
export const CUSTOMER_DIGEST_TIME_ZONE = "America/New_York";

/** Today and tomorrow on the Eastern calendar — “due within 24 hours”. */
export const DUE_SOON_CALENDAR_DAYS = 1;

/** Do not re-flag the same user+task due-soon/overdue inside this window. */
export const DIGEST_REMINDER_COOLDOWN_MS = 20 * 60 * 60 * 1000;

export function portalTaskPath(projectId: string, taskId: string): string {
  return `/portal/projects/${projectId}/tasks/${taskId}`;
}

export function portalMessagePath(projectId: string, threadId: string): string {
  return `/portal/projects/${projectId}/messages/${threadId}`;
}

export function portalHomePath(): string {
  return "/portal";
}

export function isPortalPath(path: string | null | undefined): boolean {
  if (!path) return false;
  const p = path.startsWith("http") ? new URL(path).pathname : path;
  return p === "/portal" || p.startsWith("/portal/");
}

/**
 * Customers 404 on staff `/projects/...` routes. Digest links must be portal.
 * Already-portal paths are left alone.
 */
export function staffRouteToPortal(path: string | null | undefined): string | null {
  if (!path) return null;
  const raw = path.trim();
  if (!raw) return null;
  let pathname = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      pathname = new URL(raw).pathname;
    } catch {
      return null;
    }
  }
  if (pathname.startsWith("/portal/")) return pathname;
  if (pathname === "/portal") return pathname;

  const task = /^\/projects\/([^/]+)\/tasks\/([^/]+)\/?$/.exec(pathname);
  if (task) return portalTaskPath(task[1]!, task[2]!);

  const msg = /^\/projects\/([^/]+)\/messages\/([^/]+)\/?$/.exec(pathname);
  if (msg) return portalMessagePath(msg[1]!, msg[2]!);

  return null;
}

export function absoluteUrl(appUrl: string, path: string): string {
  const base = appUrl.replace(/\/+$/, "");
  if (/^https?:\/\//i.test(path)) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/** YYYY-MM-DD in the given IANA zone (en-CA). */
export function calendarDayKey(d: Date, timeZone = CUSTOMER_DIGEST_TIME_ZONE): string {
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
  timeZone = CUSTOMER_DIGEST_TIME_ZONE,
): number {
  const a = calendarDayKey(now, timeZone);
  const b = calendarDayKey(new Date(due), timeZone);
  const aMs = Date.parse(`${a}T12:00:00.000Z`);
  const bMs = Date.parse(`${b}T12:00:00.000Z`);
  return Math.round((bMs - aMs) / 86_400_000);
}

export function classifyCustomerDue(
  due: Date | string | null | undefined,
  now: Date,
  timeZone = CUSTOMER_DIGEST_TIME_ZONE,
): "overdue" | "due_soon" | null {
  if (!due) return null;
  const days = calendarDaysUntilDue(due, now, timeZone);
  if (days < 0) return "overdue";
  if (days <= DUE_SOON_CALENDAR_DAYS) return "due_soon";
  return null;
}

export function dueSoonDetail(due: Date | string, now: Date): string {
  const days = calendarDaysUntilDue(due, now);
  if (days < 0) {
    const n = Math.abs(days);
    return n === 1 ? "1 day overdue" : `${n} days overdue`;
  }
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

/** Structured input for `layout()` / `plainText()` — kept local so this file stays off Resend. */
export type DigestEmailLayout = {
  heading: string;
  paragraphs: string[];
  sections: { heading: string; items: { title: string; url: string; detail?: string }[] }[];
  cta: { label: string; url: string };
  footer: string;
};

export type DigestItemKind = "due_soon" | "overdue" | "message";

export type DigestItem = {
  kind: DigestItemKind;
  title: string;
  /** Portal path (`/portal/...`), never staff `/projects/...`. */
  path: string;
  detail?: string;
};

const KIND_ORDER: Record<DigestItemKind, number> = {
  overdue: 0,
  due_soon: 1,
  message: 2,
};

const SECTION_HEADING: Record<DigestItemKind, string> = {
  overdue: "Overdue",
  due_soon: "Due in the next 24 hours",
  message: "Messages from the PIMSY team",
};

export function sortDigestItems(items: DigestItem[]): DigestItem[] {
  return [...items].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

export function digestSubject(items: DigestItem[]): string {
  const dueSoon = items.filter((i) => i.kind === "due_soon").length;
  const overdue = items.filter((i) => i.kind === "overdue").length;
  const messages = items.filter((i) => i.kind === "message").length;
  const tasks = dueSoon + overdue;

  if (tasks > 0 && messages > 0) {
    const taskBit = tasks === 1 ? "1 task" : `${tasks} tasks`;
    const msgBit = messages === 1 ? "1 message" : `${messages} messages`;
    return `Your PATH update: ${taskBit} and ${msgBit}`;
  }
  if (overdue > 0 && dueSoon === 0) {
    return overdue === 1 ? "1 overdue task" : `${overdue} overdue tasks`;
  }
  if (dueSoon > 0) {
    return dueSoon === 1
      ? "A task is due in the next 24 hours"
      : `${dueSoon} tasks due in the next 24 hours`;
  }
  if (messages > 0) {
    return messages === 1
      ? "A message from the PIMSY team"
      : `${messages} messages from the PIMSY team`;
  }
  return "Your PATH update";
}

export function composeCustomerDigest(args: {
  items: DigestItem[];
  appUrl: string;
}): { subject: string; opts: DigestEmailLayout } | null {
  const items = sortDigestItems(args.items).filter((i) => isPortalPath(i.path));
  if (items.length === 0) return null;

  const sections: DigestEmailLayout["sections"] = [];
  for (const kind of ["overdue", "due_soon", "message"] as const) {
    const group = items.filter((i) => i.kind === kind);
    if (group.length === 0) continue;
    sections.push({
      heading: SECTION_HEADING[kind],
      items: group.map((i) => ({
        title: i.title,
        url: absoluteUrl(args.appUrl, i.path),
        detail: i.detail,
      })),
    });
  }

  const taskCount = items.filter((i) => i.kind !== "message").length;
  const messageCount = items.filter((i) => i.kind === "message").length;
  const bits: string[] = [];
  if (taskCount) {
    bits.push(
      taskCount === 1
        ? "one item that's due"
        : `${taskCount} items that are due`,
    );
  }
  if (messageCount) {
    bits.push(
      messageCount === 1
        ? "a message from the PIMSY team"
        : `${messageCount} messages from the PIMSY team`,
    );
  }
  const intro =
    bits.length === 2
      ? `Here's a summary of ${bits[0]} and ${bits[1]}. Each link opens the exact task or conversation in your workspace.`
      : `Here's a summary of ${bits[0] ?? "what needs your attention"}. Each link opens the exact item in your workspace.`;

  return {
    subject: digestSubject(items),
    opts: {
      heading: "Your PATH summary",
      paragraphs: [intro],
      sections,
      cta: {
        label: "Open your workspace",
        url: absoluteUrl(args.appUrl, portalHomePath()),
      },
      footer:
        "You're getting this because of your notification settings. You can change them from your portal, or reply to this email and we'll do it for you. This message relates to your PIMSY implementation project. It contains no patient information.",
    },
  };
}

export function notificationToDigestItem(row: {
  type: string;
  title: string;
  body?: string | null;
  linkUrl?: string | null;
}): DigestItem | null {
  const path = staffRouteToPortal(row.linkUrl);
  if (!path || !isPortalPath(path)) return null;
  if (row.type === "TASK_OVERDUE") {
    return { kind: "overdue", title: stripKindPrefix(row.title), path, detail: row.body ?? undefined };
  }
  if (row.type === "TASK_DUE_SOON") {
    return { kind: "due_soon", title: stripKindPrefix(row.title), path, detail: row.body ?? undefined };
  }
  if (row.type === "MESSAGE_POSTED") {
    return { kind: "message", title: row.title, path, detail: row.body ?? undefined };
  }
  return null;
}

function stripKindPrefix(title: string): string {
  return title.replace(/^(Due soon|Overdue):\s*/i, "").trim();
}
