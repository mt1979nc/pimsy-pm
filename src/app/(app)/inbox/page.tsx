import { requireStaff } from "@/lib/guard";
import { listInboxThreads } from "@/lib/threads";
import { partitionThreads } from "@/lib/thread-state";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { ThreadList } from "@/components/thread-list";
import { CollapsibleCompleted } from "@/components/collapsible-completed";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox" };

export default async function InboxPage() {
  const actor = await requireStaff();
  const threads = await listInboxThreads(actor, 200);
  const { unreadOpen, readOpen, resolved } = partitionThreads(threads, actor.id);

  const hrefFor = (t: { id: string; projectId: string | null }) =>
    t.projectId ? `/projects/${t.projectId}/messages/${t.id}` : `/inbox/${t.id}`;

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle="Open topics first. One conversation per question keeps waiting-on aging honest."
      />

      {threads.length === 0 ? (
        <Card>
          <EmptyState
            title="No conversations yet"
            description="Messages started on any project you can see will land here."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {unreadOpen.length > 0 ? (
            <Card>
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-[13.5px] font-semibold text-ink">
                  Unread
                  <span className="ml-2 rounded-full bg-brand px-1.5 py-0.5 text-[11px] font-semibold text-brand-ink">
                    {unreadOpen.length}
                  </span>
                </h2>
              </div>
              <ThreadList
                threads={unreadOpen}
                currentUserId={actor.id}
                hrefFor={hrefFor}
                showProject
              />
            </Card>
          ) : null}

          <Card>
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-[13.5px] font-semibold text-ink">
                {unreadOpen.length > 0 ? "Open" : "Open conversations"}
              </h2>
            </div>
            {readOpen.length === 0 ? (
              <EmptyState
                title={unreadOpen.length > 0 ? "Nothing else open" : "No open conversations"}
                description="Start a new conversation for a new topic rather than reopening a resolved one."
              />
            ) : (
              <ThreadList
                threads={readOpen}
                currentUserId={actor.id}
                hrefFor={hrefFor}
                showProject
              />
            )}
          </Card>

          {resolved.length > 0 ? (
            <Card>
              <CollapsibleCompleted
                count={resolved.length}
                noun={resolved.length === 1 ? "resolved topic" : "resolved topics"}
                hideHint="— hide closed topics"
                showHint="— show"
                flush
              >
                <ThreadList
                  threads={resolved}
                  currentUserId={actor.id}
                  hrefFor={hrefFor}
                  showProject
                />
              </CollapsibleCompleted>
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}
