import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/guard";
import { portalPhase } from "@/lib/portal";
import { Card, CardHeader, EmptyState, ProgressBar, Badge, Avatar } from "@/components/ui";
import { pctComplete } from "@/lib/rollup";
import { fmtShort, isOverdue } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { TaskActionButtons } from "@/components/task-action-buttons";
import { orderTasksForNesting } from "@/lib/task-tree";

export const dynamic = "force-dynamic";

export default async function PortalPhasePage({
  params,
}: {
  params: Promise<{ id: string; phaseId: string }>;
}) {
  const { id, phaseId } = await params;
  const actor = await requireCustomer();

  const phase = await portalPhase(actor, id, phaseId);
  if (!phase) notFound();

  const done = phase.tasks.filter((t) => t.status === "DONE").length;
  const inProgress = phase.tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const pct = pctComplete(done, phase.tasks.length);

  return (
    <Card>
      <CardHeader
        title={phase.name}
        subtitle={
          phase.description ??
          "Status for this area — parent items only. Specialist checklists stay with your implementation team."
        }
        action={
          phase.tasks.length > 0 ? (
            <span className="text-[12.5px] text-ink-3">
              {done}/{phase.tasks.length} complete
              {inProgress > 0 ? ` · ${inProgress} in progress` : ""}
            </span>
          ) : undefined
        }
      />
      {phase.tasks.length > 0 ? (
        <div className="px-5 pt-4">
          <ProgressBar value={done} total={phase.tasks.length} tone={pct === 100 ? "green" : "brand"} />
        </div>
      ) : null}

      {phase.tasks.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          description="Check back once this phase gets underway."
        />
      ) : (
        <div className="mt-3 divide-y divide-border">
          {orderTasksForNesting(phase.tasks).map((t) => {
            const statusLabel =
              t.status === "DONE"
                ? "Complete"
                : t.status === "IN_PROGRESS"
                  ? "In progress"
                  : t.status === "BLOCKED"
                    ? "Blocked"
                    : "Not started";
            return (
              <div
                key={t.id}
                className="flex items-start gap-3 px-5 py-3"
                style={t.depth ? { paddingLeft: 20 + t.depth * 16 } : undefined}
              >
                <span
                  className={cn(
                    "mt-1.5 size-1.5 shrink-0 rounded-full",
                    t.status === "DONE"
                      ? "bg-green"
                      : t.status === "IN_PROGRESS"
                        ? "bg-brand"
                        : "bg-border-strong",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <Link
                      href={`/portal/projects/${id}/tasks/${t.id}`}
                      className={cn(
                        "block min-w-0 flex-1 text-[13.5px] hover:text-brand hover:underline",
                        t.status === "DONE" ? "text-ink-3 line-through" : "text-ink",
                      )}
                    >
                      {t.title}
                    </Link>
                    <TaskActionButtons
                      title={t.title}
                      taskHref={`/portal/projects/${id}/tasks/${t.id}`}
                      compact
                    />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
                    <span className={t.status === "DONE" ? "text-green" : undefined}>{statusLabel}</span>
                    {t.assignee?.name ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Avatar name={t.assignee.name} image={t.assignee.image} size={16} />
                        {t.assignee.name}
                      </span>
                    ) : null}
                    {t.dueDate && t.status !== "DONE" ? (
                      <span className={cn(isOverdue(t.dueDate) ? "text-red" : undefined)}>
                        {fmtShort(t.dueDate)}
                      </span>
                    ) : null}
                  </div>
                </div>
                {t.ownerSide === "CUSTOMER" ? <Badge tone="violet">Yours</Badge> : null}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
