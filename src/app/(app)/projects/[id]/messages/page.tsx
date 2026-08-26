import { requireStaff } from "@/lib/guard";
import { assertProjectAccess } from "@/lib/authz";
import { listProjectThreads } from "@/lib/threads";
import { Card, EmptyState, VisibilityBadge } from "@/components/ui";
import { ThreadList } from "@/components/thread-list";
import { NewThreadForm } from "@/components/message-composer";

export const dynamic = "force-dynamic";

export default async function ProjectMessagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireStaff();
  await assertProjectAccess(actor, id);

  const threads = await listProjectThreads(actor, id);
  const shared = threads.filter((t) => t.visibility === "SHARED");
  const internal = threads.filter((t) => t.visibility === "INTERNAL");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-2">
          Two channels on one project: what the customer sees, and what stays with your team.
        </p>
        <NewThreadForm projectId={id} />
      </div>

      <Card>
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <h2 className="text-[13.5px] font-semibold text-ink">With the customer</h2>
          <VisibilityBadge visibility="SHARED" />
        </div>
        {shared.length === 0 ? (
          <EmptyState
            title="No customer conversations yet"
            description="Start one and everyone on their side gets an email."
          />
        ) : (
          <ThreadList
            threads={shared}
            currentUserId={actor.id}
            hrefFor={(t) => `/projects/${id}/messages/${t.id}`}
          />
        )}
      </Card>

      <Card>
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <h2 className="text-[13.5px] font-semibold text-ink">Internal back channel</h2>
          <VisibilityBadge visibility="INTERNAL" />
        </div>
        {internal.length === 0 ? (
          <EmptyState
            title="No internal threads"
            description="Use these for anything the customer shouldn't read — pricing, risk, escalations."
          />
        ) : (
          <ThreadList
            threads={internal}
            currentUserId={actor.id}
            hrefFor={(t) => `/projects/${id}/messages/${t.id}`}
          />
        )}
      </Card>
    </div>
  );
}
