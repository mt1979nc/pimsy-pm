import Link from "next/link";
import { Badge, VisibilityBadge, Avatar } from "@/components/ui";
import { fmtRelative } from "@/lib/dates";
import { isUnread } from "@/lib/threads";
import { cn } from "@/lib/cn";

type Thread = {
  id: string;
  subject: string;
  visibility: "INTERNAL" | "SHARED";
  isResolved: boolean;
  isPinned: boolean;
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
