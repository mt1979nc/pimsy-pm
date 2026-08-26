import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { requireStaff } from "@/lib/guard";
import { NotFoundError, ForbiddenError, canSeeInternal } from "@/lib/authz";
import { assertThreadAccess } from "@/lib/threads";
import { markThreadRead } from "@/actions/messages";
import { Card, Badge, VisibilityBadge } from "@/components/ui";
import { MessageList } from "@/components/thread-list";
import { MessageComposer, ThreadActions } from "@/components/message-composer";

export const dynamic = "force-dynamic";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string; threadId: string }>;
}) {
  const { id, threadId } = await params;
  const actor = await requireStaff();

  let thread;
  try {
    thread = await assertThreadAccess(actor, threadId);
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ForbiddenError) notFound();
    throw err;
  }

  const rows = await db.query.messages.findMany({
    where: eq(messages.threadId, threadId),
    orderBy: [asc(messages.createdAt)],
    with: { author: { columns: { id: true, name: true, image: true, role: true } } },
  });

  await markThreadRead(threadId);

  return (
    <div className="mx-auto max-w-[760px]">
      <Link
        href={`/projects/${id}/messages`}
        className="mb-3 inline-block text-[12.5px] text-ink-3 hover:text-brand"
      >
        ← All conversations
      </Link>

      <Card>
        <div className="border-b border-border px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[16px] font-semibold tracking-tight text-ink">{thread.subject}</h1>
            <VisibilityBadge visibility={thread.visibility} />
            {thread.isResolved ? <Badge tone="green">Resolved</Badge> : null}
          </div>
          <p className="mt-1.5 text-[12.5px] text-ink-3">
            {thread.visibility === "SHARED"
              ? "Customer contacts on this project can read and reply to this thread."
              : "Only your internal team can see this thread."}
          </p>
          <div className="mt-3">
            <ThreadActions
              threadId={threadId}
              isResolved={thread.isResolved}
              visibility={thread.visibility}
              canShare={canSeeInternal(actor)}
            />
          </div>
        </div>

        <MessageList messages={rows} currentUserId={actor.id} />
        <MessageComposer threadId={threadId} visibility={thread.visibility} />
      </Card>
    </div>
  );
}
