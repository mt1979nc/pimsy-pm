import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/guard";
import {
  portalProject,
  portalPlan,
  portalMilestones,
  portalStatusUpdates,
  portalFiles,
} from "@/lib/portal";
import { Card, CardHeader, EmptyState, Badge, Avatar } from "@/components/ui";
import { PortalTaskRow } from "../../portal-task-row";
import { attachmentHref } from "@/lib/attachments";
import { fmtShort, fmtRelative } from "@/lib/dates";
import { cn } from "@/lib/cn";

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

  const [{ looseTasks }, milestones, updates, files] = await Promise.all([
    portalPlan(actor, id),
    portalMilestones(actor, id),
    portalStatusUpdates(actor, id),
    portalFiles(actor, id),
  ]);

  const myItems = looseTasks.filter((t) => t.ownerSide === "CUSTOMER" && t.status !== "DONE");

  return (
    <>
      {project.portalWelcomeMessage ? (
        <Card className="mb-5 border-brand/30 bg-brand-soft">
          <p className="whitespace-pre-wrap px-5 py-4 text-[13.5px] leading-relaxed text-ink">
            {project.portalWelcomeMessage}
          </p>
        </Card>
      ) : null}

      {myItems.length > 0 ? (
        <Card className="mb-5">
          <CardHeader
            title="What we need from you"
            subtitle={`${myItems.length} open item${myItems.length === 1 ? "" : "s"}`}
          />
          <div className="divide-y divide-border">
            {myItems.map((t) => (
              <PortalTaskRow
                key={t.id}
                task={{
                  id: t.id,
                  title: t.title,
                  description: t.description,
                  status: t.status,
                  dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
                  projectId: id,
                }}
              />
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1.45fr_1fr]">
        <div className="space-y-5">
          {updates.length > 0 ? (
            <Card>
              <CardHeader title="Project updates" subtitle="From your implementation team" />
              <div className="divide-y divide-border">
                {updates.map((u) => (
                  <div key={u.id} className="px-5 py-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Avatar name={u.author.name} image={u.author.image} size={24} />
                      <span className="text-[13px] font-medium text-ink">{u.author.name}</span>
                      <span className="text-[12px] text-ink-3">{fmtRelative(u.publishedAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">
                      {u.summary}
                    </p>
                    {u.needsFromYou ? (
                      <div className="mt-3 rounded-lg bg-amber-soft px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-amber">
                          What we need from you
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-snug text-amber">
                          {u.needsFromYou}
                        </p>
                      </div>
                    ) : null}
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {[
                        ["Recently completed", u.accomplished],
                        ["Coming up", u.upcoming],
                      ]
                        .filter(([, v]) => v)
                        .map(([label, v]) => (
                          <div key={label as string} className="rounded-lg bg-surface-2 p-2.5">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                              {label}
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-snug text-ink-2">
                              {v}
                            </p>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {looseTasks.length > 0 ? (
            <Card>
              <CardHeader
                title="Other items"
                subtitle="Not tied to a specific phase"
              />
              <div className="divide-y divide-border">
                {looseTasks.map((t) => (
                  <PortalTaskRow
                    key={t.id}
                    task={{
                      id: t.id,
                      title: t.title,
                      description: t.description,
                      status: t.status,
                      dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
                      projectId: id,
                    }}
                  />
                ))}
              </div>
            </Card>
          ) : null}

          {updates.length === 0 && looseTasks.length === 0 && myItems.length === 0 ? (
            <Card>
              <EmptyState
                title="You're all caught up"
                description="Use the tabs above to see each phase of your implementation."
              />
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Milestones" />
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

          {project.lead ? (
            <Card>
              <CardHeader title="Your team" />
              <div className="flex items-center gap-3 px-4 py-3">
                <Avatar name={project.lead.name} image={project.lead.image} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium text-ink">
                    {project.lead.name}
                  </div>
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
                {files.map((f) => (
                  <a
                    key={f.id}
                    href={attachmentHref(f)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-4 py-2.5 hover:bg-surface-2"
                  >
                    <div className="truncate text-[13px] text-ink">{f.name}</div>
                    <div className="text-[12px] text-ink-3">{fmtShort(f.createdAt)}</div>
                  </a>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
