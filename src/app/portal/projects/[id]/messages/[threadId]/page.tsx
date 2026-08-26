import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { requireCustomer } from "@/lib/guard";
import { NotFoundError, ForbiddenError } from "@/lib/authz";
import { assertThreadAccess } from "@/lib/threads";
import { markThreadRead } from "@/actions/messages";
import { Card, Badge } from "@/components/ui";
import { MessageList } from "@/components/thread-list";
import { MessageComposer } from "@/components/message-composer";

export const dynamic = "force-dynamic";

export default async function PortalThreadPage({
  params,
}: {
  params: Promise<{ id: string; threadId: string }>;
}) {
  const { id, threadId } = await params;
  const actor = await requireCustomer();

  let thread;
  try {
    thread = await assertThreadAccess(actor, threadId);
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ForbiddenError) notFound();
    throw err;
  }

  // Defence in depth: assertThreadAccess already refuses internal threads for
  // customers, but never render one even if that changed.
  if (thread.visibility !== "SHARED") notFound();

  const rows = await db.query.messages.findMany({
    where: eq(messages.threadId, threadId),
    orderBy: [asc(messages.createdAt)],
    with: { author: { columns: { id: true, name: true, image: true, role: true } } },
  });

  await markThreadRead(threadId);

  return (
    <>
      <Link
        href={`/portal/projects/${id}/messages`}
        className="mb-3 inline-block text-[12.5px] text-ink-3 hover:text-brand"
      >
        ← All conversations
      </Link>

      <Card>
        <div className="border-b border-border px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[16px] font-semibold tracking-tight text-ink">{thread.subject}</h1>
            {thread.isResolved ? <Badge tone="green">Resolved</Badge> : null}
          </div>
        </div>

        <MessageList messages={rows} currentUserId={actor.id} />
        <MessageComposer
          threadId={threadId}
          visibility="SHARED"
          placeholder="Write a reply to your implementation team…"
        />
      </Card>
    </>
  );
}
