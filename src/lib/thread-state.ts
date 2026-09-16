/**
 * Thread list / unread / waiting-on helpers with no DB imports.
 * Inbox badges and the thread list both use these so unread cannot drift
 * between the two surfaces, and client components stay off Postgres.
 */

export type WaitingOn = "PIMSY" | "CUSTOMER" | "UNKNOWN";

export type ThreadReadCursor = {
  lastMessageAt: Date | string;
  isResolved?: boolean;
  participants: { userId: string; lastReadAt: Date | string | null }[];
};

function at(value: Date | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : null;
}

/**
 * True when this person has not acknowledged the latest message.
 *
 * Missing participant row or a null lastReadAt means they have never opened
 * the thread — that is unread. Treating a missing row as read hid new
 * conversations from staff who can see the project but were not inserted as
 * participants (managers, later assignees).
 *
 * Equal timestamps are read: mark-read and lastMessageAt share one `now`.
 */
export function isUnread(thread: ThreadReadCursor, userId: string): boolean {
  const lastMsg = at(thread.lastMessageAt);
  if (lastMsg == null) return false;
  const p = thread.participants.find((x) => x.userId === userId);
  if (!p || p.lastReadAt == null) return true;
  const readAt = at(p.lastReadAt);
  if (readAt == null) return true;
  return lastMsg > readAt;
}

export function partitionThreads<T extends ThreadReadCursor & { isResolved: boolean }>(
  threads: T[],
  userId: string,
) {
  const open: T[] = [];
  const resolved: T[] = [];
  for (const t of threads) {
    if (t.isResolved) resolved.push(t);
    else open.push(t);
  }
  const unreadOpen = open.filter((t) => isUnread(t, userId));
  const readOpen = open.filter((t) => !isUnread(t, userId));
  return { open, resolved, unreadOpen, readOpen };
}

/**
 * Ball-in-court after a reply (or a reopen that is a reply).
 * INTERNAL threads do not participate in waiting-on SLA.
 * Reopening a resolved SHARED topic always resets aging so a new question
 * does not inherit the previous wait.
 */
export function nextWaitingOnForReply(opts: {
  visibility: "INTERNAL" | "SHARED";
  actorIsCustomer: boolean;
  wasResolved: boolean;
  currentWaitingOn: WaitingOn;
}): { waitingOn: WaitingOn } | null {
  if (opts.visibility !== "SHARED") return null;
  const waitingOn: WaitingOn = opts.actorIsCustomer ? "PIMSY" : "CUSTOMER";
  if (opts.wasResolved) return { waitingOn };
  if (opts.currentWaitingOn !== waitingOn) return { waitingOn };
  return null;
}

/** Staff or portal reopen via Mark resolved / Reopen (no new message yet). */
export function nextWaitingOnForReopen(opts: {
  visibility: "INTERNAL" | "SHARED";
  actorIsCustomer: boolean;
}): { waitingOn: WaitingOn } | null {
  return nextWaitingOnForReply({
    visibility: opts.visibility,
    actorIsCustomer: opts.actorIsCustomer,
    wasResolved: true,
    currentWaitingOn: "UNKNOWN",
  });
}
