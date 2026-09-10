import Link from "next/link";
import { requireCustomer } from "@/lib/guard";
import { portalProjects, portalActionItems } from "@/lib/portal";
import { listInboxThreads, isUnread } from "@/lib/threads";
import { Card, CardHeader, EmptyState, Badge, ProgressBar, Avatar } from "@/components/ui";
import { PortalTaskRow } from "./portal-task-row";
import { PortalMessageBox } from "./portal-message-box";
import { pctComplete } from "@/lib/rollup";
import { fmtDate, daysUntil, isOverdue, fmtRelative } from "@/lib/dates";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your workspace" };

export default async function PortalHome() {
  const actor = await requireCustomer();
  const [projects, actions, threads] = await Promise.all([
    portalProjects(actor),
    portalActionItems(actor),
    listInboxThreads(actor, 6),
  ]);

  const open = actions.filter((a) => a.status !== "DONE");
  const completed = actions.filter((a) => a.status === "DONE");
  const overdue = open.filter((a) => isOverdue(a.dueDate));
  const unread = threads.filter((t) => isUnread(t, actor.id));
  const firstName = (actor.name ?? actor.email).split(" ")[0];

  type Action = (typeof actions)[number];
  const groupByArea = (items: Action[]) => {
    const map = new Map<string, { label: string; order: number; items: Action[] }>();
    for (const t of items) {
      const label = t.phase?.name ?? "General";
      const order = t.phase?.order ?? 9999;
      const key = t.phase?.id ?? `general-${t.projectId}`;
      const cur = map.get(key) ?? { label, order, items: [] };
      cur.items.push(t);
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  };
  const openGroups = groupByArea(open);
  const doneGroups = groupByArea(completed);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-ink">
          Hi {firstName}
        </h1>
        <p className="mt-1 text-[14px] text-ink-2">
          {open.length === 0
            ? "You're all caught up — nothing is waiting on you right now."
            : `${open.length} item${open.length === 1 ? "" : "s"} need${open.length === 1 ? "s" : ""} your attention.`}
        </p>
      </div>

      {/* Project timeline / status cards first */}
      <div className="mb-5 space-y-4">
        {projects.length === 0 ? (
          <Card>
            <EmptyState
              title="No projects yet"
              description="Your implementation specialist will open this up when your project starts."
            />
          </Card>
        ) : (
          projects.map((p) => {
            const pct = pctComplete(p.taskCountDone, p.taskCountTotal);
            const days = daysUntil(p.targetGoLiveDate);
            return (
              <Card key={p.id}>
                <Link href={`/portal/projects/${p.id}`} className="block px-5 py-4 hover:bg-surface-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-[15px] font-semibold text-ink">{p.name}</h2>
                      <p className="mt-0.5 text-[12.5px] text-ink-3">
                        {p.status === "COMPLETED"
                          ? "Live"
                          : days !== null
                            ? days >= 0
                              ? `Go-live in ${days} days · ${fmtDate(p.targetGoLiveDate)}`
                              : `Target date was ${fmtDate(p.targetGoLiveDate)}`
                            : "Go-live date to be confirmed"}
                      </p>
                    </div>
                    {p.status === "COMPLETED" ? (
                      <Badge tone="green">Live</Badge>
                    ) : (
                      <Badge tone="brand">In progress</Badge>
                    )}
                  </div>
                  <div className="mt-3">
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <span className="text-[12.5px] font-medium text-ink-2">{pct}% complete</span>
                      <span className="text-[12px] text-ink-3">
                        {p.taskCountDone} of {p.taskCountTotal} steps
                      </span>
                    </div>
                    <ProgressBar
                      value={p.taskCountDone}
                      total={p.taskCountTotal}
                      tone={pct === 100 ? "green" : "brand"}
                    />
                  </div>
                </Link>
                {p.lead ? (
                  <div className="flex items-center gap-2.5 border-t border-border px-5 py-3">
                    <Avatar name={p.lead.name} image={p.lead.image} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-medium text-ink">{p.lead.name}</div>
                      <div className="truncate text-[12px] text-ink-3">
                        {p.lead.title ?? "Implementation Specialist"}
                      </div>
                    </div>
                    <Link
                      href={`/portal/projects/${p.id}/messages`}
                      className="text-[12.5px] font-medium text-brand hover:underline"
                    >
                      Message
                    </Link>
                  </div>
                ) : null}
              </Card>
            );
          })
        )}
      </div>

      {/* Tasks (left) | Messages (right) */}
      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          {open.length > 0 ? (
            <Card>
              <CardHeader
                title="What we need from you"
                subtitle={
                  overdue.length > 0
                    ? `${overdue.length} past due · grouped by area`
                    : "Grouped by area — Discovery, Training, Go-live, and more"
                }
              />
              <div className="space-y-1 pb-2">
                {openGroups.map((g) => (
                  <div key={g.label + g.items[0]?.id} className="border-b border-border last:border-b-0">
                    <div className="bg-surface-2/60 px-4 py-2 text-[12.5px] font-semibold text-ink">
                      {g.label}
                      {projects.length > 1 && g.items[0]?.project?.name ? (
                        <span className="ml-2 font-normal text-ink-3">· {g.items[0].project.name}</span>
                      ) : null}
                    </div>
                    <div className="divide-y divide-border">
                      {g.items.map((t) => (
                        <PortalTaskRow
                          key={t.id}
                          task={{
                            id: t.id,
                            title: t.title,
                            description: t.description,
                            status: t.status,
                            dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
                            projectName: projects.length > 1 ? t.project.name : null,
                            projectId: t.projectId,
                            commentCount: t.comments?.length ?? 0,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card>
              <EmptyState
                title="Nothing waiting on you"
                description="When new items land, they’ll show up here grouped by area."
              />
            </Card>
          )}

          {completed.length > 0 ? (
            <Card>
              <CardHeader
                title="Completed"
                subtitle="Tap the checkmark to reopen an item if it was marked done by mistake"
              />
              <div className="space-y-1 pb-2">
                {doneGroups.map((g) => (
                  <div key={"done-" + g.label + g.items[0]?.id} className="border-b border-border last:border-b-0">
                    <div className="bg-surface-2/60 px-4 py-2 text-[12.5px] font-semibold text-ink">
                      {g.label}
                    </div>
                    <div className="divide-y divide-border">
                      {g.items.map((t) => (
                        <PortalTaskRow
                          key={t.id}
                          task={{
                            id: t.id,
                            title: t.title,
                            description: t.description,
                            status: t.status,
                            dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
                            projectName: projects.length > 1 ? t.project.name : null,
                            projectId: t.projectId,
                            commentCount: t.comments?.length ?? 0,
                          }}
                        />
                      ))}
                    </div>
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
              subtitle={unread.length > 0 ? `${unread.length} unread` : "Your conversations"}
            />
            {threads.length === 0 ? (
              <EmptyState
                title="No messages yet"
                description="Send a note with the composer below."
              />
            ) : (
              <div className="divide-y divide-border">
                {threads.map((t) => (
                  <Link
                    key={t.id}
                    href={`/portal/projects/${t.projectId}/messages/${t.id}`}
                    className="block px-4 py-2.5 hover:bg-surface-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          isUnread(t, actor.id) ? "bg-brand" : "bg-transparent",
                        )}
                      />
                      <span
                        className={cn(
                          "truncate text-[13px]",
                          isUnread(t, actor.id) ? "font-semibold text-ink" : "text-ink",
                        )}
                      >
                        {t.subject}
                      </span>
                    </div>
                    <div className="pl-3.5 text-[12px] text-ink-3">{fmtRelative(t.lastMessageAt)}</div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <PortalMessageBox
            embedded
            projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          />
        </div>
      </div>
    </>
  );
}
