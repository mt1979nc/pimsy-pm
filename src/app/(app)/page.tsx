import Link from "next/link";
import { requireStaff } from "@/lib/guard";
import { canSeePortfolio, canCreateProjects } from "@/lib/authz";
import {
  portfolioSummary,
  attentionProjects,
  myTasks,
  waitingOnCustomer,
  waitingOnThreadRollup,
  upcomingMilestones,
} from "@/lib/queries";
import { listInboxThreads, isUnread } from "@/lib/threads";
import {
  Card,
  CardHeader,
  PageHeader,
  Stat,
  EmptyState,
  LinkButton,
  Badge,
  HealthBadge,
  WaitingOnBadge,
} from "@/components/ui";
import { ProjectRow } from "@/components/project-row";
import { TaskRow } from "@/components/task-row";
import { fmtShort, dueLabel, fmtRelative, differenceInCalendarDays, startOfDay } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const actor = await requireStaff();

  const [summary, attention, tasks, chase, milestones, threads, waitingThreads] = await Promise.all([
    portfolioSummary(actor),
    attentionProjects(actor, 6),
    myTasks(actor),
    waitingOnCustomer(actor, 8),
    upcomingMilestones(actor, 30, 8),
    listInboxThreads(actor, 8),
    waitingOnThreadRollup(actor),
  ]);
  const waitingThreadFlat = waitingThreads
    .flatMap((r) =>
      r.threads
        .filter((t) => t.waitingOn === "PIMSY" || t.waitingOn === "CUSTOMER")
        .map((t) => ({ ...t, project: r.project })),
    )
    .slice(0, 8);

  const unread = threads.filter((t) => isUnread(t, actor.id));
  const dueSoon = tasks.filter((t) => {
    if (!t.dueDate) return false;
    const days = (new Date(t.dueDate).getTime() - Date.now()) / 86_400_000;
    return days < 7;
  });

  const firstName = (actor.name ?? actor.email).split(" ")[0];

  return (
    <>
      <PageHeader
        title={`Good ${greeting()}, ${firstName}`}
        subtitle="Everything that needs you today, in one place."
        actions={
          <>
            {canCreateProjects(actor) ? (
              <LinkButton href="/projects/new" variant="primary">
                New project
              </LinkButton>
            ) : null}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active projects" value={summary.active} href="/projects" />
        <Stat
          label="At risk"
          value={summary.atRisk}
          tone={summary.atRisk > 0 ? "red" : undefined}
          hint={summary.needsAttention > 0 ? `${summary.needsAttention} need attention` : "All healthy"}
          href="/projects?health=RED"
        />
        <Stat
          label="Go-lives in 30 days"
          value={summary.goLivesNext30}
          href="/reports"
        />
        <Stat
          label="Overdue tasks"
          value={summary.overdueTasks}
          tone={summary.overdueTasks > 0 ? "amber" : undefined}
          href="/my-work"
        />
      </div>

      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Needs your attention"
              subtitle="Ranked by health, blockers and schedule slip"
              action={
                <Link href="/projects" className="text-[12.5px] font-medium text-brand hover:underline">
                  All projects
                </Link>
              }
            />
            {attention.length === 0 ? (
              <EmptyState
                title="Nothing is off track"
                description="Every active project is green and on schedule."
              />
            ) : (
              <div className="divide-y divide-border">
                {attention.map((p) => (
                  <ProjectRow key={p.id} project={p} />
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="My tasks"
              subtitle={
                dueSoon.length > 0
                  ? `${dueSoon.length} due within a week`
                  : `${tasks.length} open`
              }
              action={
                <Link href="/my-work" className="text-[12.5px] font-medium text-brand hover:underline">
                  My work
                </Link>
              }
            />
            {tasks.length === 0 ? (
              <EmptyState title="Nothing assigned to you" description="Enjoy the quiet." />
            ) : (
              <div className="divide-y divide-border">
                {tasks.slice(0, 7).map((t) => (
                  <TaskRow key={t.id} task={t} showProject />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Unread messages"
              subtitle={unread.length > 0 ? `${unread.length} waiting` : "You're caught up"}
              action={
                <Link href="/inbox" className="text-[12.5px] font-medium text-brand hover:underline">
                  Inbox
                </Link>
              }
            />
            {unread.length === 0 ? (
              <EmptyState title="No unread messages" />
            ) : (
              <div className="divide-y divide-border">
                {unread.slice(0, 5).map((t) => (
                  <Link
                    key={t.id}
                    href={
                      t.projectId
                        ? `/projects/${t.projectId}/messages/${t.id}`
                        : `/inbox/${t.id}`
                    }
                    className="block px-4 py-2.5 hover:bg-surface-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="size-1.5 shrink-0 rounded-full bg-brand" />
                      <span className="truncate text-[13px] font-medium text-ink">{t.subject}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 pl-3.5 text-[12px] text-ink-3">
                      <span className="truncate">
                        {t.project?.customerAccount?.name ?? t.project?.name ?? "Internal"}
                      </span>
                      <span>·</span>
                      <span className="shrink-0">{fmtRelative(t.lastMessageAt)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Waiting-on threads"
              subtitle="Open shared conversations — ball in court"
              action={
                <Link
                  href="/reports/waiting-on"
                  className="text-[12.5px] font-medium text-brand hover:underline"
                >
                  WIP rollup
                </Link>
              }
            />
            {waitingThreadFlat.length === 0 ? (
              <EmptyState title="No tagged open threads" description="Shared conversations with a waiting-on side show up here." />
            ) : (
              <div className="divide-y divide-border">
                {waitingThreadFlat.map((t) => {
                  const days = differenceInCalendarDays(
                    startOfDay(new Date()),
                    startOfDay(t.waitingOnSince),
                  );
                  return (
                    <Link
                      key={t.id}
                      href={`/projects/${t.project.id}/messages/${t.id}`}
                      className="block px-4 py-2.5 hover:bg-surface-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-ink">{t.subject}</span>
                        <WaitingOnBadge waitingOn={t.waitingOn} agingDays={days} />
                      </div>
                      <div className="mt-0.5 truncate text-[12px] text-ink-3">
                        {t.project.customerAccount?.name ?? t.project.name}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Waiting on customers"
              subtitle="Open action items on their side"
            />
            {chase.length === 0 ? (
              <EmptyState title="Nothing outstanding" description="No customer action items are open." />
            ) : (
              <div className="divide-y divide-border">
                {chase.map((t) => (
                  <div key={t.id} className="px-4 py-2.5">
                    <div className="truncate text-[13px] text-ink">{t.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
                      <Link
                        href={`/projects/${t.project.id}/tasks`}
                        className="font-medium text-ink-2 hover:text-brand"
                      >
                        {t.project.customerAccount?.name ?? t.project.name}
                      </Link>
                      {t.dueDate ? (
                        <>
                          <span>·</span>
                          <span>{dueLabel(t.dueDate)}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Upcoming milestones" subtitle="Next 30 days" />
            {milestones.length === 0 ? (
              <EmptyState title="No milestones due" />
            ) : (
              <div className="divide-y divide-border">
                {milestones.map((m) => (
                  <Link
                    key={m.id}
                    href={`/projects/${m.project.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] text-ink">{m.name}</span>
                        {m.isGoLive ? <Badge tone="violet">Go-live</Badge> : null}
                      </div>
                      <div className="truncate text-[12px] text-ink-3">
                        {m.project.customerAccount?.name ?? m.project.name}
                      </div>
                    </div>
                    <span className="shrink-0 text-[12px] font-medium text-ink-2">
                      {fmtShort(m.dueDate)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {canSeePortfolio(actor) ? (
            <Card>
              <CardHeader title="Portfolio" subtitle="Leadership view" />
              <div className="grid grid-cols-2 gap-px bg-border">
                <div className="bg-surface px-4 py-3">
                  <div className="text-[11.5px] uppercase tracking-wide text-ink-3">
                    Customer actions open
                  </div>
                  <div className="mt-1 text-[20px] font-semibold">
                    {summary.openCustomerActions}
                  </div>
                </div>
                <div className="bg-surface px-4 py-3">
                  <div className="text-[11.5px] uppercase tracking-wide text-ink-3">
                    Live this quarter
                  </div>
                  <div className="mt-1 text-[20px] font-semibold">
                    {summary.completedThisQuarter}
                  </div>
                </div>
              </div>
              <div className="space-y-1 border-t border-border px-4 py-3">
                <Link href="/reports" className="block text-[12.5px] font-medium text-brand hover:underline">
                  Open the full portfolio report →
                </Link>
                <Link href="/reports/waiting-on" className="block text-[12.5px] font-medium text-brand hover:underline">
                  Waiting-on WIP rollup →
                </Link>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}
