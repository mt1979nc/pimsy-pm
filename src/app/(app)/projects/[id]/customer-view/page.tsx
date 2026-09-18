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
import { pctComplete } from "@/lib/pct-complete";
import { cn } from "@/lib/cn";
import { orderTasksForNesting } from "@/lib/task-tree";
import { CommentCountBadge } from "@/components/comment-count-badge";
import { sortPhaseSections } from "@/lib/task-list-filter";
import { MentionBody } from "@/components/mention-body";

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

  const [{ phases, looseTasks }, milestones, updates, files] = await Promise.all([
    previewPortalPlan(id),
    previewPortalMilestones(id),
    previewPortalStatusUpdates(id),
    previewPortalFiles(id),
  ]);

  const areaGroups = sortPhaseSections(
    phases.map((phase) => ({ phase, tasks: phase.tasks })).filter((g) => g.tasks.length > 0),
  );

  const openCount =
    areaGroups.reduce((n, g) => n + g.tasks.filter((t) => t.status !== "DONE").length, 0) +
    looseTasks.filter((t) => t.status !== "DONE").length;
  const doneCount =
    areaGroups.reduce((n, g) => n + g.tasks.filter((t) => t.status === "DONE").length, 0) +
    looseTasks.filter((t) => t.status === "DONE").length;
  const milestoneDone = milestones.filter((m) => m.completedAt).length;
  const pct = pctComplete(project.taskCountDone, project.taskCountTotal);
  const days = daysUntil(project.targetGoLiveDate);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-amber-soft px-4 py-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink">Customer view</div>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            Read-only preview of the portal for {project.customerAccount?.name ?? "the customer"}.
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
            Portal is <strong>off</strong>. This preview still shows SHARED content.
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
        <p className="mt-3 border-t border-border pt-3 text-[12.5px] text-ink-2">
          Use Areas on the left to open the same tabs the customer can see.
        </p>
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
          title="Timeline"
          subtitle={
            milestones.length > 0 ? `${milestoneDone}/${milestones.length}` : undefined
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
          title="Shared progress"
          subtitle={`${openCount} open · ${doneCount} done`}
        />
        {openCount + doneCount === 0 ? (
          <EmptyState title="Nothing shared yet" />
        ) : (
          <div className="divide-y divide-border">
            {areaGroups.map(({ phase, tasks: phaseTasks }) => (
              <div key={phase.id} className="px-4 py-3">
                <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3">
                  <Link href={`/projects/${id}/customer-view/phases/${phase.id}`} className="hover:text-brand">
                    {phase.name}
                  </Link>
                </div>
                <ul className="space-y-2">
                  {orderTasksForNesting(phaseTasks).map((t) => (
                    <li
                      key={t.id}
                      className="flex items-start gap-2 text-[13px]"
                      style={t.depth ? { paddingLeft: t.depth * 16 } : undefined}
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
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/projects/${id}/customer-view/tasks/${t.id}`}
                            className={cn(
                              "hover:text-brand hover:underline",
                              t.status === "DONE" && "text-ink-3 line-through",
                            )}
                          >
                            {t.title}
                          </Link>
                          <span className="text-[11.5px] text-ink-3">
                            {t.status === "DONE"
                              ? "Complete"
                              : t.status === "IN_PROGRESS"
                                ? "In progress"
                                : "Not started"}
                          </span>
                          {t.ownerSide === "CUSTOMER" ? (
                            <Badge tone="violet">Customer</Badge>
                          ) : null}
                          <CommentCountBadge
                            count={t.comments?.length ?? 0}
                            href={`/projects/${id}/customer-view/tasks/${t.id}`}
                          />
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
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
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {looseTasks.length > 0 ? (
              <div className="px-4 py-3">
                <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3">
                  General
                </div>
                <ul className="space-y-2">
                  {orderTasksForNesting(looseTasks).map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-[13px]">
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          t.status === "DONE" ? "bg-green" : "bg-brand",
                        )}
                      />
                      <Link
                        href={`/projects/${id}/customer-view/tasks/${t.id}`}
                        className={cn(
                          "hover:text-brand hover:underline",
                          t.status === "DONE" && "text-ink-3 line-through",
                        )}
                      >
                        {t.title}
                      </Link>
                      <CommentCountBadge
                        count={t.comments?.length ?? 0}
                        href={`/projects/${id}/customer-view/tasks/${t.id}`}
                      />
                      {t.assignee?.name ? (
                        <span className="ml-auto text-[12px] text-ink-3">{t.assignee.name}</span>
                      ) : null}
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
          <CardHeader title="Updates" />
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
                    {u.editedAt ? <span className="text-[11.5px] text-ink-3">edited</span> : null}
                  </div>
                  <MentionBody
                    text={u.summary}
                    className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2"
                  />
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
              {files.map((f) => {
              const href = attachmentHref(f);
              if (!href) {
                return (
                  <div key={f.id} className="px-4 py-2.5 text-[13px] text-ink-2">
                    <span className="text-ink">{f.name}</span>
                    <span className="mt-0.5 block text-[12px] text-ink-3">File not available yet</span>
                  </div>
                );
              }
              return (
                <Link
                  key={f.id}
                  href={href}
                  className="block px-4 py-2.5 text-[13px] text-ink hover:bg-surface-2"
                >
                  {f.name}
                </Link>
              );
            })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
