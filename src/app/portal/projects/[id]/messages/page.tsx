import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/guard";
import { portalProject } from "@/lib/portal";
import { listProjectThreads } from "@/lib/threads";
import { Card, EmptyState, CardHeader } from "@/components/ui";
import { OrganizedThreadList } from "@/components/thread-list";
import { NewThreadForm } from "@/components/message-composer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Messages" };

export default async function PortalMessagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireCustomer();

  const project = await portalProject(actor, id);
  if (!project) notFound();

  // listProjectThreads filters to SHARED for non-staff actors.
  const threads = await listProjectThreads(actor, id);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-2">
          Talk to your implementation team. Start a new conversation for each topic so we can track
          who is waiting.
        </p>
        <NewThreadForm projectId={id} canChooseVisibility={false} portal />
      </div>

      <Card>
        <CardHeader
          title="Conversations"
          subtitle={
            threads.length > 0
              ? `${threads.filter((t) => !t.isResolved).length} open`
              : undefined
          }
        />
        {threads.length === 0 ? (
          <EmptyState
            title="No conversations yet"
            description="Start one with any question about your implementation."
          />
        ) : (
          <OrganizedThreadList
            threads={threads}
            currentUserId={actor.id}
            hrefFor={(t) => `/portal/projects/${id}/messages/${t.id}`}
          />
        )}
      </Card>
    </>
  );
}
