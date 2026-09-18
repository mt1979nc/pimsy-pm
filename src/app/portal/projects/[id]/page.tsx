import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCustomer } from "@/lib/guard";
import {
  portalProject,
  portalPlan,
  portalMilestones,
  portalStatusUpdates,
  portalFiles,
} from "@/lib/portal";
import { listInboxThreads } from "@/lib/threads";
import { partitionThreads } from "@/lib/thread-state";
import { Card, CardHeader, EmptyState, Badge, Avatar, ProgressBar } from "@/components/ui";
import { PortalTaskRow } from "../../portal-task-row";
import { PortalMessageBox } from "../../portal-message-box";
import { ThreadPreviewList } from "@/components/thread-list";
import { MentionBody } from "@/components/mention-body";
import { attachmentHref } from "@/lib/attachments";
import { fmtShort, fmtRelative } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { resolveTaskDescription } from "@/lib/task-description";
import { resolveProjectBookingUrls } from "@/lib/booking-urls";
import { isSectionComplete, sortSectionsByCompletion } from "@/lib/task-list-filter";

export const dynamic = "force-dynamic";

export default async function PortalProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireCustomer();

  const project = await portalProject(actor, id);
  if (!project) notFound();

  const [{ phases, looseTasks }, milestones, updates, files, threads] = await Promise.all([
    portalPlan(actor, id),
    portalMilestones(actor, id),
    portalStatusUpdates(actor, id),
    portalFiles(actor, id),
    listInboxThreads(actor, 8),
  ]);

  const projectThreads = threads.filter((t) => t.projectId === id);
  const { unreadOpen } = partitionThreads(projectThreads, actor.id);
  const unread = unreadOpen;

  const customerTasks = (tasks: typeof looseTasks) =>
    tasks.filter((t) => t.ownerSide === "CUSTOMER");

  const openByPhase = sortSectionsByCompletion(
    phases
      .map((phase) => {
        const mine = customerTasks(phase.tasks);
        const open = mine.filter((t) => t.status !== "DONE");
        const done = mine.filter((t) => t.status === "DONE");
        return { phase, open, done, all: mine };
      })
      .filter((g) => g.all.length > 0),
    (g) => isSectionComplete(g.all),
  );

  const looseMine = customerTasks(looseTasks);
  const looseOpen = looseMine.filter((t) => t.status !== "DONE");
  const looseDone = looseMine.filter((t) => t.status === "DONE");

  const openCount =
    openByPhase.reduce((n, g) => n + g.open.length, 0) + looseOpen.length;
  const doneCount =
    openByPhase.reduce((n, g) => n + g.done.length, 0) + looseDone.length;

  const milestoneDone = milestones.filter((m) => m.completedAt).length;
  const bookingUrls = resolveProjectBookingUrls(project);

  return (
    <>
      {project.portalWelcomeMessage ? (
        <Card className="mb-5 border-brand/30 bg-brand-soft">
          <p className="whitespace-pre-wrap px-5 py-4 text-[13.5px] leading-relaxed text-ink">
            {project.portalWelcomeMessage}
          </p>
        </Card>
      ) : null}

      {/* Timeline first */}
      <Card className="mb-5">
        <CardHeader
          title="Timeline"
          subtitle={
            milestones.length > 0
              ? `${milestoneDone}/${milestones.length}`
              : undefined
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
                  {m.completedAt ? (
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                      <path d="m5 13 4.5 4.5L19 7" />
                    </svg>
                  ) : null}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn("text-[13px]", m.completedAt ? "text-ink-3" : "text-ink")}>
                      {m.name}
                    </span>
                    {m.isGoLive ? <Badge tone="violet">Go-live</Badge> : null}
                  </div>
                  <div className="text-[12px] text-ink-3">
                    {m.completedAt ? `Completed ${fmtShort(m.completedAt)}` : fmtShort(m.dueDate)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Tasks (grouped by area) | Messages */}
      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1.45fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Your tasks"
              subtitle={
                openCount > 0
                  ? `${openCount} open`
                  : "Caught up"
              }
            />
            {openCount === 0 && doneCount === 0 ? (
              <EmptyState title="You're caught up" />
            ) : (
              <div className="space-y-1 pb-2">
                {openByPhase.map(({ phase, open, done }) => (
                  <div key={phase.id} className="border-b border-border last:border-b-0">
                    <div className="flex items-center justify-between gap-2 bg-surface-2/60 px-4 py-2">
                      <Link
                        href={`/portal/projects/${id}/phases/${phase.id}`}
                        className="text-[12.5px] font-semibold text-ink hover:text-brand"
                      >
                        {phase.name}
                      </Link>
                      <span className="text-[11.5px] tabular-nums text-ink-3">
                        {done.length}/{open.length + done.length}
                      </span>
                    </div>
                    {open.length > 0 ? (
                      <div className="divide-y divide-border">
                        {open.map((t) => (
                          <PortalTaskRow
                            key={t.id}
                            task={{
                              id: t.id,
                              title: t.title,
                              description: resolveTaskDescription(t.title, t.description),
                              status: t.status,
                              dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
                              sessionAt: t.sessionAt ? new Date(t.sessionAt).toISOString() : null,
                              projectId: id,
                              commentCount: t.comments?.length ?? 0,
                            }}
                            bookingUrls={bookingUrls}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="px-4 py-2.5 text-[12.5px] text-ink-3">All set in this area</p>
                    )}
                  </div>
                ))}
                {looseOpen.length > 0 ? (
                  <div className="border-b border-border last:border-b-0">
                    <div className="bg-surface-2/60 px-4 py-2 text-[12.5px] font-semibold text-ink">
                      General
                    </div>
                    <div className="divide-y divide-border">
                      {looseOpen.map((t) => (
                        <PortalTaskRow
                          key={t.id}
                          task={{
                            id: t.id,
                            title: t.title,
                            description: resolveTaskDescription(t.title, t.description),
                            status: t.status,
                            dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
                            sessionAt: t.sessionAt ? new Date(t.sessionAt).toISOString() : null,
                            projectId: id,
                            commentCount: t.comments?.length ?? 0,
                          }}
                          bookingUrls={bookingUrls}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </Card>

          {doneCount > 0 ? (
            <Card>
              <CardHeader title="Completed" />
              <div className="space-y-1 pb-2">
                {openByPhase.map(({ phase, done }) =>
                  done.length === 0 ? null : (
                    <div key={`done-${phase.id}`} className="border-b border-border last:border-b-0">
                      <div className="bg-surface-2/60 px-4 py-2 text-[12.5px] font-semibold text-ink">
                        {phase.name}
                      </div>
                      <div className="divide-y divide-border">
                        {done.map((t) => (
                          <PortalTaskRow
                            key={t.id}
                            task={{
                              id: t.id,
                              title: t.title,
                              description: resolveTaskDescription(t.title, t.description),
                              status: t.status,
                              dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
                              sessionAt: t.sessionAt ? new Date(t.sessionAt).toISOString() : null,
                              projectId: id,
                              commentCount: t.comments?.length ?? 0,
                            }}
                            bookingUrls={bookingUrls}
                          />
                        ))}
                      </div>
                    </div>
                  ),
                )}
                {looseDone.length > 0 ? (
                  <div>
                    <div className="bg-surface-2/60 px-4 py-2 text-[12.5px] font-semibold text-ink">
                      General
                    </div>
                    <div className="divide-y divide-border">
                      {looseDone.map((t) => (
                        <PortalTaskRow
                          key={t.id}
                          task={{
                            id: t.id,
                            title: t.title,
                            description: resolveTaskDescription(t.title, t.description),
                            status: t.status,
                            dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
                            sessionAt: t.sessionAt ? new Date(t.sessionAt).toISOString() : null,
                            projectId: id,
                            commentCount: t.comments?.length ?? 0,
                          }}
                          bookingUrls={bookingUrls}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          {updates.length > 0 ? (
            <Card>
              <CardHeader title="Updates" />
              <div className="divide-y divide-border">
                {updates.map((u) => (
                  <div key={u.id} className="px-5 py-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Avatar name={u.author.name} image={u.author.image} size={24} />
                      <span className="text-[13px] font-medium text-ink">{u.author.name}</span>
                      <span className="text-[12px] text-ink-3">{fmtRelative(u.publishedAt)}</span>
                    {u.editedAt ? <span className="text-[11.5px] text-ink-3">edited</span> : null}
                    </div>
                    <MentionBody
                      text={u.summary}
                      className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink"
                    />
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Messages"
              subtitle={unread.length > 0 ? `${unread.length} unread` : undefined}
            />
            {projectThreads.length === 0 ? (
              <EmptyState title="No messages yet" />
            ) : (
              <ThreadPreviewList
                threads={projectThreads}
                currentUserId={actor.id}
                hrefFor={(t) => `/portal/projects/${id}/messages/${t.id}`}
              />
            )}
          </Card>

          <PortalMessageBox embedded projects={[{ id, name: project.name }]} />

          {project.lead ? (
            <Card>
              <CardHeader title="Your team" />
              <div className="flex items-center gap-3 px-4 py-3">
                <Avatar name={project.lead.name} image={project.lead.image} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium text-ink">{project.lead.name}</div>
                  <div className="truncate text-[12px] text-ink-3">
                    {project.lead.title ?? "Implementation Specialist"}
                  </div>
                </div>
              </div>
            </Card>
          ) : null}

          {files.length > 0 ? (
            <Card>
              <CardHeader title="Shared documents" />
              <div className="divide-y divide-border">
                {files.map((f) => {
                  const href = attachmentHref(f);
                  if (!href) {
                    return (
                      <div key={f.id} className="px-4 py-2.5">
                        <div className="truncate text-[13px] text-ink">{f.name}</div>
                        <div className="text-[12px] text-ink-3">File not available yet</div>
                      </div>
                    );
                  }
                  return (
                  <a
                    key={f.id}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-4 py-2.5 hover:bg-surface-2"
                  >
                    <div className="truncate text-[13px] text-ink">{f.name}</div>
                    <div className="text-[12px] text-ink-3">{fmtShort(f.createdAt)}</div>
                  </a>
                  );
                })}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
