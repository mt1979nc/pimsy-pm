import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/guard";
import { portalPhase } from "@/lib/portal";
import { Card, CardHeader, EmptyState, ProgressBar, Badge } from "@/components/ui";
import { pctComplete } from "@/lib/rollup";
import { fmtShort, isOverdue } from "@/lib/dates";
import { cn } from "@/lib/cn";

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
  const pct = pctComplete(done, phase.tasks.length);

  return (
    <Card>
      <CardHeader
        title={phase.name}
        subtitle={phase.description ?? undefined}
        action={
          phase.tasks.length > 0 ? (
            <span className="text-[12.5px] text-ink-3">
              {done}/{phase.tasks.length} complete
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
          {phase.tasks.map((t) => (
            <div key={t.id} className="flex items-start gap-3 px-5 py-2.5">
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
                <Link
                  href={`/portal/projects/${id}/tasks/${t.id}`}
                  className={cn(
                    "block text-[13.5px] hover:text-brand hover:underline",
                    t.status === "DONE" ? "text-ink-3 line-through" : "text-ink",
                  )}
                >
                  {t.title}
                </Link>
                {t.dueDate && t.status !== "DONE" ? (
                  <div className={cn("text-[12px]", isOverdue(t.dueDate) ? "text-red" : "text-ink-3")}>
                    {fmtShort(t.dueDate)}
                  </div>
                ) : null}
              </div>
              {t.ownerSide === "CUSTOMER" ? <Badge tone="violet">Yours</Badge> : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
