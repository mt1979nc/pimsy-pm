import { requireStaff } from "@/lib/guard";
import { listInboxThreads, isUnread } from "@/lib/threads";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { ThreadList } from "@/components/thread-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox" };

export default async function InboxPage() {
  const actor = await requireStaff();
  const threads = await listInboxThreads(actor, 100);

  const unread = threads.filter((t) => isUnread(t, actor.id));
  const rest = threads.filter((t) => !isUnread(t, actor.id));

  const hrefFor = (t: { id: string; projectId: string | null }) =>
    t.projectId ? `/projects/${t.projectId}/messages/${t.id}` : `/inbox/${t.id}`;

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle="Every conversation across every project — customer-facing and internal."
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
          {unread.length > 0 ? (
            <Card>
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-[13.5px] font-semibold text-ink">
                  Unread
                  <span className="ml-2 rounded-full bg-brand px-1.5 py-0.5 text-[11px] font-semibold text-brand-ink">
                    {unread.length}
                  </span>
                </h2>
              </div>
              <ThreadList
                threads={unread}
                currentUserId={actor.id}
                hrefFor={hrefFor}
                showProject
              />
            </Card>
          ) : null}

          <Card>
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-[13.5px] font-semibold text-ink">
                {unread.length > 0 ? "Everything else" : "All conversations"}
              </h2>
            </div>
            {rest.length === 0 ? (
              <EmptyState title="Nothing else here" />
            ) : (
              <ThreadList
                threads={rest}
                currentUserId={actor.id}
                hrefFor={hrefFor}
                showProject
              />
            )}
          </Card>
        </div>
      )}
    </>
  );
}
