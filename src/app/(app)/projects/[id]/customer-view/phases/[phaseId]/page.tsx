import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/guard";
import { assertProjectAccess, ForbiddenError, NotFoundError } from "@/lib/authz";
import { previewPortalPhase } from "@/lib/portal-preview";
import { Card, CardHeader, EmptyState, Badge, Avatar } from "@/components/ui";
import { orderTasksForNesting } from "@/lib/task-tree";
import { fmtShort } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { CommentCountBadge } from "@/components/comment-count-badge";

export const dynamic = "force-dynamic";

export default async function CustomerViewPhasePage({
  params,
}: {
  params: Promise<{ id: string; phaseId: string }>;
}) {
  const { id, phaseId } = await params;
  const actor = await requireStaff();
  try {
    await assertProjectAccess(actor, id);
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ForbiddenError) notFound();
    throw err;
  }

  const phase = await previewPortalPhase(id, phaseId);
  if (!phase) notFound();

  const nested = orderTasksForNesting(phase.tasks);

  return (
    <Card>
      <CardHeader title={phase.name} />
      {phase.description ? (
        <p className="line-clamp-2 px-4 pb-2 text-[12.5px] text-ink-3">{phase.description}</p>
      ) : null}
      {nested.length === 0 ? (
        <EmptyState title="Nothing shared in this area" />
      ) : (
        <div className="divide-y divide-border">
          {nested.map((t) => (
            <Link
              key={t.id}
              href={`/projects/${id}/customer-view/tasks/${t.id}`}
              className="flex items-start gap-3 px-5 py-3 hover:bg-surface-2"
              style={t.depth ? { paddingLeft: 20 + t.depth * 16 } : undefined}
            >
              <span
                className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  t.status === "DONE" ? "bg-green" : t.status === "IN_PROGRESS" ? "bg-brand" : "bg-border-strong",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("text-[14px]", t.status === "DONE" && "text-ink-3 line-through")}>
                    {t.title}
                  </span>
                  <span className="text-[11.5px] text-ink-3">
                    {t.status === "DONE" ? "Complete" : t.status === "IN_PROGRESS" ? "In progress" : "Not started"}
                  </span>
                  {t.ownerSide === "CUSTOMER" ? <Badge tone="violet">Customer</Badge> : null}
                  <CommentCountBadge
                    count={t.comments?.length ?? 0}
                    href={`/projects/${id}/customer-view/tasks/${t.id}`}
                  />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                  {t.assignee?.name ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Avatar name={t.assignee.name} image={t.assignee.image} size={16} />
                      {t.assignee.name}
                    </span>
                  ) : (
                    <span>Unassigned</span>
                  )}
                  {t.dueDate ? <span>{fmtShort(t.dueDate)}</span> : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
