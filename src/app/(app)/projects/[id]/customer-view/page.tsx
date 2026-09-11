import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/guard";
import { assertProjectAccess, NotFoundError, ForbiddenError } from "@/lib/authz";
import {
  previewPortalProject,
  previewPortalPlan,
  previewPortalMilestones,
  previewPortalStatusUpdates,
  previewPortalFiles,
  previewPortalPhaseTabs,
} from "@/lib/portal-preview";
import {
  Card,
  CardHeader,
  EmptyState,
  Badge,
  Avatar,
  ProgressBar,
  LinkButton,
} from "@/components/ui";
import { attachmentHref } from "@/lib/attachments";
import { fmtShort, fmtRelative, fmtDate, daysUntil } from "@/lib/dates";
import { pctComplete } from "@/lib/rollup";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer view" };

export default async function CustomerViewPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireStaff();
  try {
    await assertProjectAccess(actor, id);
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ForbiddenError) notFound();
    throw err;
  }

  const project = await previewPortalProject(id);
  if (!project) notFound();

  const [{ phases, looseTasks }, milestones, updates, files, phaseTabs] = await Promise.all([
    previewPortalPlan(id),
    previewPortalMilestones(id),
    previewPortalStatusUpdates(id),
    previewPortalFiles(id),
    previewPortalPhaseTabs(id),
  ]);

  const customerTasks = <T extends { ownerSide: string }>(tasks: T[]) =>
    tasks.filter((t) => t.ownerSide === "CUSTOMER");

  const openByPhase = phases
    .map((phase) => {
      const mine = customerTasks(phase.tasks);
      const open = mine.filter((t) => t.status !== "DONE");
      const done = mine.filter((t) => t.status === "DONE");
      return { phase, open, done, all: mine };
    })
    .filter((g) => g.all.length > 0);

  const looseMine = customerTasks(looseTasks);
  const looseOpen = looseMine.filter((t) => t.status !== "DONE");
  const looseDone = looseMine.filter((t) => t.status === "DONE");

  const openCount = openByPhase.reduce((n, g) => n + g.open.length, 0) + looseOpen.length;
  const doneCount = openByPhase.reduce((n, g) => n + g.done.length, 0) + looseDone.length;
  const milestoneDone = milestones.filter((m) => m.completedAt).length;
  const pct = pctComplete(project.taskCountDone, project.taskCountTotal);
  const days = daysUntil(project.targetGoLiveDate);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-amber-soft px-4 py-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink">Customer view (read-only preview)</div>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            Mirrors what {project.customerAccount?.name ?? "the customer"} sees in the portal —
            SHARED items only. You cannot complete tasks or send messages from here.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <LinkButton href={`/projects/${id}`} size="sm" variant="secondary">
            Back to staff project
          </LinkButton>
          {project.customerAccountId ? (
            <LinkButton href={`/customers/${project.customerAccountId}`} size="sm">
              Customer record
            </LinkButton>
          ) : null}
        </div>
      </div>

      {!project.portalEnabled ? (
        <Card className="border-red/30 bg-red-soft/30">
          <p className="px-5 py-4 text-[13px] text-ink">
            Portal is currently <strong>off</strong> for this project. Customers cannot open it;
            this preview still shows what SHARED content would look like.
          </p>
        </Card>
      ) : null}

      <div className="rounded-xl border border-border bg-surface px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[12px] text-ink-3">
              {project.customerAccount?.name ?? "Customer"} · portal
            </div>
            <h2 className="mt-0.5 text-[20px] font-semibold tracking-tight text-ink">{project.name}</h2>
            <p className="mt-1 text-[13px] text-ink-2">
              {project.status === "COMPLETED"
                ? "Live"
                : days !== null
                  ? days >= 0
                    ? `Go-live ${fmtDate(project.targetGoLiveDate)} — ${days} days away`
                    : `Target date was ${fmtDate(project.targetGoLiveDate)}`
                  : "Go-live date to be confirmed"}
            </p>
          </div>
          <div className="min-w-[140px]">
            <div className="text-[11.5px] uppercase tracking-wide text-ink-3">Progress</div>
            <div className="mt-0.5 text-[13.5px] font-medium">
              {pct}%{" "}
              <span className="text-[12px] font-normal text-ink-3">
                {project.taskCountDone}/{project.taskCountTotal}
              </span>
            </div>
            <ProgressBar value={project.taskCountDone} total={project.taskCountTotal} className="mt-1.5" />
          </div>
        </div>
        {phaseTabs.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
            <Badge tone="brand">Overview</Badge>
            {phaseTabs.map((p) => (
              <Badge key={p.id}>{p.name}</Badge>
            ))}
          </div>
        ) : null}
      </div>

      {project.portalWelcomeMessage ? (
        <Card className="border-brand/30 bg-brand-soft">
          <p className="whitespace-pre-wrap px-5 py-4 text-[13.5px] leading-relaxed text-ink">
            {project.portalWelcomeMessage}
          </p>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Project timeline"
          subtitle={
            milestones.length > 0
              ? `${milestoneDone} of ${milestones.length} milestones complete`
              : "Key dates for go-live"
          }
        />
        {milestones.length === 0 ? (
          <EmptyState title="No milestones yet" />
        ) : (
          <div className="divide-y divide-border">
            {milestones.map((m) => (
              <div key={m.id} className="flex items-start gap-3 px-4 py-2.5">
                <span
                  className={cn(
                    "mt-1 flex size-[15px] shrink-0 items-center justify-center rounded-full border",
                    m.completedAt ? "border-green bg-green text-white" : "border-border-strong",
                  )}
                >
                  {m.completedAt ? "✓" : ""}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] text-ink">{m.name}</span>
                    {m.isGoLive ? <Badge tone="violet">Go-live</Badge> : null}
                  </div>
                </div>
                <span className="shrink-0 text-[12.5px] text-ink-2">{fmtShort(m.dueDate)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Your action items"
          subtitle={`${openCount} open · ${doneCount} done (customer-owned, shared)`}
        />
        {openCount + doneCount === 0 ? (
          <EmptyState
            title="Nothing assigned to the customer yet"
            description="Shared tasks with owner side Customer appear here in the portal."
          />
        ) : (
          <div className="divide-y divide-border">
            {openByPhase.map(({ phase, open, done }) => (
              <div key={phase.id} className="px-4 py-3">
                <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3">
                  {phase.name}
                </div>
                <ul className="space-y-1.5">
                  {[...open, ...done].map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-[13px]">
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          t.status === "DONE" ? "bg-green" : "bg-brand",
                        )}
                      />
                      <span className={cn(t.status === "DONE" && "text-ink-3 line-through")}>
                        {t.title}
                      </span>
                      {t.dueDate ? (
                        <span className="ml-auto shrink-0 text-[11.5px] text-ink-3">
                          {fmtShort(t.dueDate)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {looseMine.length > 0 ? (
              <div className="px-4 py-3">
                <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3">
                  General
                </div>
                <ul className="space-y-1.5">
                  {[...looseOpen, ...looseDone].map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-[13px]">
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          t.status === "DONE" ? "bg-green" : "bg-brand",
                        )}
                      />
                      <span className={cn(t.status === "DONE" && "text-ink-3 line-through")}>
                        {t.title}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Status updates" subtitle="Shared with the customer" />
          {updates.length === 0 ? (
            <EmptyState title="No updates yet" />
          ) : (
            <div className="divide-y divide-border">
              {updates.map((u) => (
                <div key={u.id} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={u.author?.name} image={u.author?.image} size={22} />
                    <span className="text-[12.5px] font-medium text-ink">
                      {u.author?.name ?? "Team"}
                    </span>
                    <span className="text-[11.5px] text-ink-3">{fmtRelative(u.publishedAt)}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">
                    {u.summary}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Shared files" />
          {files.length === 0 ? (
            <EmptyState title="No files shared" />
          ) : (
            <div className="divide-y divide-border">
              {files.map((f) => (
                <Link
                  key={f.id}
                  href={attachmentHref(f)}
                  className="block px-4 py-2.5 text-[13px] text-ink hover:bg-surface-2"
                >
                  {f.name}
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
