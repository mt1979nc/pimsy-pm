import Link from "next/link";
import { Badge, VisibilityBadge, WaitingOnBadge, Avatar, EmptyState } from "@/components/ui";
import { fmtRelative, differenceInCalendarDays, startOfDay } from "@/lib/dates";
import { isUnread, partitionThreads } from "@/lib/thread-state";
import { CollapsibleCompleted } from "@/components/collapsible-completed";
import { cn } from "@/lib/cn";

type Thread = {
  id: string;
  subject: string;
  visibility: "INTERNAL" | "SHARED";
  isResolved: boolean;
  isPinned: boolean;
  waitingOn?: "PIMSY" | "CUSTOMER" | "UNKNOWN";
  waitingOnSince?: Date | string | null;
  lastMessageAt: Date | string;
  messageCount: number;
  projectId: string | null;
  participants: { userId: string; lastReadAt: Date | string | null }[];
  project?: {
    id: string;
    name: string;
    code: string;
    customerAccount?: { id: string; name: string } | null;
  } | null;
  customerAccount?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string | null; image?: string | null } | null;
};

export function ThreadList({
  threads,
  currentUserId,
  hrefFor,
  showProject = false,
}: {
  threads: Thread[];
  currentUserId: string;
  hrefFor: (t: Thread) => string;
  showProject?: boolean;
}) {
  return (
    <div className="divide-y divide-border">
      {threads.map((t) => {
        const unread = isUnread(t, currentUserId);
        return (
          <Link
            key={t.id}
            href={hrefFor(t)}
            className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
          >
            <span
              className={cn(
                "mt-1.5 size-1.5 shrink-0 rounded-full",
                unread ? "bg-brand" : "bg-transparent",
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "truncate text-[13.5px]",
                    unread ? "font-semibold text-ink" : "font-medium text-ink",
                  )}
                >
                  {t.subject}
                </span>
                <VisibilityBadge visibility={t.visibility} />
                {!t.isResolved && t.waitingOn && t.waitingOn !== "UNKNOWN" ? (
                  <WaitingOnBadge
                    waitingOn={t.waitingOn}
                    agingDays={
                      t.waitingOnSince
                        ? differenceInCalendarDays(
                            startOfDay(new Date()),
                            startOfDay(new Date(t.waitingOnSince)),
                          )
                        : null
                    }
                  />
                ) : null}
                {t.isResolved ? <Badge tone="green">Resolved</Badge> : null}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
                {showProject && (t.project || t.customerAccount) ? (
                  <>
                    <span className="truncate">
                      {t.project?.customerAccount?.name ??
                        t.customerAccount?.name ??
                        t.project?.name ??
                        "Internal"}
                    </span>
                    <span>·</span>
                  </>
                ) : null}
                <span>
                  {t.messageCount} message{t.messageCount === 1 ? "" : "s"}
                </span>
                <span>·</span>
                <span>{fmtRelative(t.lastMessageAt)}</span>
              </div>
            </div>
            {t.createdBy ? (
              <Avatar name={t.createdBy.name} image={t.createdBy.image} size={24} />
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

/** Open threads first; resolved topics collapse so SLA work stays on top. */
export function OrganizedThreadList({
  threads,
  currentUserId,
  hrefFor,
  showProject = false,
  emptyOpenTitle = "No open conversations",
  emptyOpenDescription = "Start a new conversation for each topic so waiting-on aging stays honest.",
}: {
  threads: Thread[];
  currentUserId: string;
  hrefFor: (t: Thread) => string;
  showProject?: boolean;
  emptyOpenTitle?: string;
  emptyOpenDescription?: string;
}) {
  const { unreadOpen, readOpen, resolved } = partitionThreads(threads, currentUserId);
  const open = [...unreadOpen, ...readOpen];

  return (
    <>
      {open.length === 0 ? (
        <EmptyState title={emptyOpenTitle} description={emptyOpenDescription} />
      ) : (
        <ThreadList
          threads={open}
          currentUserId={currentUserId}
          hrefFor={hrefFor}
          showProject={showProject}
        />
      )}
      <CollapsibleCompleted
        count={resolved.length}
        noun={resolved.length === 1 ? "resolved topic" : "resolved topics"}
        hideHint="— hide closed topics"
        showHint="— show"
      >
        <ThreadList
          threads={resolved}
          currentUserId={currentUserId}
          hrefFor={hrefFor}
          showProject={showProject}
        />
      </CollapsibleCompleted>
    </>
  );
}

/** Compact portal / dashboard preview: open (unread first), then resolved. */
export function ThreadPreviewList({
  threads,
  currentUserId,
  hrefFor,
}: {
  threads: Thread[];
  currentUserId: string;
  hrefFor: (t: Thread) => string;
}) {
  const { unreadOpen, readOpen, resolved } = partitionThreads(threads, currentUserId);
  const ordered = [...unreadOpen, ...readOpen, ...resolved];
  return (
    <div className="divide-y divide-border">
      {ordered.map((t) => {
        const unread = isUnread(t, currentUserId);
        return (
          <Link
            key={t.id}
            href={hrefFor(t)}
            className="block px-4 py-2.5 hover:bg-surface-2"
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  unread ? "bg-brand" : "bg-transparent",
                )}
                aria-hidden
              />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[13px]",
                  unread ? "font-semibold text-ink" : "text-ink",
                )}
              >
                {t.subject}
              </span>
              {t.isResolved ? <Badge tone="green">Resolved</Badge> : null}
            </div>
            <div className="pl-3.5 text-[12px] text-ink-3">{fmtRelative(t.lastMessageAt)}</div>
          </Link>
        );
      })}
    </div>
  );
}

export function MessageList({
  messages,
  currentUserId,
}: {
  messages: {
    id: string;
    body: string;
    createdAt: Date | string;
    editedAt: Date | string | null;
    author: { id: string; name: string | null; image?: string | null; role: string };
  }[];
  currentUserId: string;
}) {
  return (
    <div className="divide-y divide-border">
      {messages.map((m) => {
        const isMe = m.author.id === currentUserId;
        const isExternal = m.author.role === "CUSTOMER";
        return (
          <div key={m.id} className="flex gap-3 px-5 py-4">
            <Avatar name={m.author.name} image={m.author.image} size={30} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold text-ink">
                  {m.author.name}
                  {isMe ? <span className="ml-1 font-normal text-ink-3">(you)</span> : null}
                </span>
                {isExternal ? <Badge tone="violet">Customer</Badge> : null}
                <span className="text-[12px] text-ink-3">{fmtRelative(m.createdAt)}</span>
                {m.editedAt ? <span className="text-[11.5px] text-ink-3">edited</span> : null}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">
                {m.body}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
