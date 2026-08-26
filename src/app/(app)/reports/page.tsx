import Link from "next/link";
import { requirePortfolioAccess } from "@/lib/guard";
import {
  portfolioSummary,
  attentionProjects,
  listProjects,
  openRisks,
  cycleTimeStats,
  upcomingMilestones,
} from "@/lib/queries";
import {
  PageHeader,
  Card,
  CardHeader,
  Stat,
  EmptyState,
  Badge,
  HealthBadge,
  SeverityBadge,
  ProgressBar,
  Avatar,
  LinkButton,
} from "@/components/ui";
import { fmtDate, daysUntil } from "@/lib/dates";
import { pctComplete } from "@/lib/rollup";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portfolio" };

export default async function ReportsPage() {
  const actor = await requirePortfolioAccess();

  const [summary, attention, all, risks, cycle, milestones] = await Promise.all([
    portfolioSummary(actor),
    attentionProjects(actor, 20),
    listProjects(actor, {}),
    openRisks(actor, 15),
    cycleTimeStats(),
    upcomingMilestones(actor, 60, 40),
  ]);

  const active = all.filter((p) =>
    ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "BLOCKED"].includes(p.status),
  );
  const goLives = active
    .filter((p) => p.targetGoLiveDate)
    .sort(
      (a, b) =>
        new Date(a.targetGoLiveDate!).getTime() - new Date(b.targetGoLiveDate!).getTime(),
    )
    .slice(0, 15);

  const healthCounts = {
    GREEN: active.filter((p) => p.health === "GREEN").length,
    YELLOW: active.filter((p) => p.health === "YELLOW").length,
    RED: active.filter((p) => p.health === "RED").length,
  };
  const totalActive = Math.max(active.length, 1);

  return (
    <>
      <PageHeader
        title="Portfolio"
        subtitle="Delivery health across every active implementation."
        actions={<LinkButton href="/reports/capacity">Team capacity</LinkButton>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active projects" value={summary.active} />
        <Stat
          label="At risk"
          value={summary.atRisk}
          tone={summary.atRisk > 0 ? "red" : undefined}
          hint={`${summary.needsAttention} need attention`}
        />
        <Stat label="Go-lives in 30 days" value={summary.goLivesNext30} />
        <Stat
          label="Live this quarter"
          value={summary.completedThisQuarter}
          tone="green"
        />
      </div>

      {/* Health mix — a single stacked meter, labelled, never color alone */}
      <Card className="mb-5">
        <CardHeader
          title="Health mix"
          subtitle={`${active.length} active project${active.length === 1 ? "" : "s"}`}
        />
        <div className="p-5">
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
            {(
              [
                ["GREEN", "bg-green", healthCounts.GREEN],
                ["YELLOW", "bg-amber", healthCounts.YELLOW],
                ["RED", "bg-red", healthCounts.RED],
              ] as const
            ).map(([key, cls, n]) =>
              n === 0 ? null : (
                <div
                  key={key}
                  className={cn("h-full first:rounded-l-full last:rounded-r-full", cls)}
                  style={{ width: `${(n / totalActive) * 100}%` }}
                />
              ),
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-4">
            {(
              [
                ["On track", "bg-green", healthCounts.GREEN],
                ["Needs attention", "bg-amber", healthCounts.YELLOW],
                ["At risk", "bg-red", healthCounts.RED],
              ] as const
            ).map(([label, cls, n]) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", cls)} aria-hidden />
                <span className="text-[12.5px] text-ink-2">{label}</span>
                <span className="text-[12.5px] font-semibold text-ink">{n}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Median go-live"
          value={cycle.medianDays !== null ? `${cycle.medianDays}d` : "—"}
          hint={`across ${cycle.completed} completed`}
        />
        <Stat
          label="On-time rate"
          value={cycle.onTimeRate !== null ? `${cycle.onTimeRate}%` : "—"}
          tone={
            cycle.onTimeRate === null
              ? undefined
              : cycle.onTimeRate >= 80
                ? "green"
                : cycle.onTimeRate >= 60
                  ? "amber"
                  : "red"
          }
          hint="hit the target date"
        />
        <Stat
          label="Overdue tasks"
          value={summary.overdueTasks}
          tone={summary.overdueTasks > 0 ? "amber" : undefined}
        />
        <Stat
          label="Open customer actions"
          value={summary.openCustomerActions}
          hint="waiting on practices"
        />
      </div>

      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Needs intervention"
              subtitle="Red, blocked, or past the target date"
            />
            {attention.length === 0 ? (
              <EmptyState title="Nothing needs intervention" description="Every project is green." />
            ) : (
              <div className="divide-y divide-border">
                {attention.map((p) => {
                  const late = daysUntil(p.targetGoLiveDate);
                  return (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="flex items-center gap-4 px-4 py-3 hover:bg-surface-2"
                    >
                      <div className="min-w-0 flex-[2]">
                        <div className="truncate text-[13.5px] font-medium text-ink">
                          {p.customerAccount?.name ?? p.name}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <HealthBadge health={p.health} />
                          {p.status === "BLOCKED" ? <Badge tone="red">Blocked</Badge> : null}
                          {late !== null && late < 0 ? (
                            <Badge tone="red">{Math.abs(late)}d past target</Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="hidden w-[110px] sm:block">
                        <div className="mb-1 text-[11.5px] text-ink-2">
                          {pctComplete(p.taskCountDone, p.taskCountTotal)}%
                        </div>
                        <ProgressBar value={p.taskCountDone} total={p.taskCountTotal} />
                      </div>
                      {p.lead ? (
                        <Avatar name={p.lead.name} image={p.lead.image} size={24} />
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Go-live schedule" subtitle="Next up, by target date" />
            {goLives.length === 0 ? (
              <EmptyState title="No dated go-lives" />
            ) : (
              <div className="divide-y divide-border">
                {goLives.map((p) => {
                  const d = daysUntil(p.targetGoLiveDate);
                  const late = d !== null && d < 0;
                  return (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="flex items-center gap-4 px-4 py-2.5 hover:bg-surface-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] text-ink">
                          {p.customerAccount?.name ?? p.name}
                        </div>
                        <div className="text-[12px] text-ink-3">
                          {pctComplete(p.taskCountDone, p.taskCountTotal)}% complete
                        </div>
                      </div>
                      <div className="w-[120px] text-right">
                        <div
                          className={cn(
                            "text-[12.5px] font-medium",
                            late ? "text-red" : "text-ink",
                          )}
                        >
                          {fmtDate(p.targetGoLiveDate)}
                        </div>
                        <div className="text-[11.5px] text-ink-3">
                          {late ? `${Math.abs(d!)}d late` : `in ${d}d`}
                        </div>
                      </div>
                      <HealthBadge health={p.health} />
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Risk register" subtitle="Open and mitigating, across the portfolio" />
            {risks.length === 0 ? (
              <EmptyState title="No open risks" />
            ) : (
              <div className="divide-y divide-border">
                {risks.map((r) => (
                  <Link
                    key={r.id}
                    href={`/projects/${r.project.id}`}
                    className="block px-4 py-2.5 hover:bg-surface-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[13px] text-ink">{r.title}</span>
                      <SeverityBadge severity={r.severity} />
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[12px] text-ink-3">
                      <span className="truncate">{r.project.name}</span>
                      {r.owner ? <span>· {r.owner.name}</span> : null}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Milestones ahead" subtitle="Next 60 days" />
            {milestones.length === 0 ? (
              <EmptyState title="No milestones scheduled" />
            ) : (
              <div className="divide-y divide-border">
                {milestones.slice(0, 12).map((m) => (
                  <Link
                    key={m.id}
                    href={`/projects/${m.project.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] text-ink">{m.name}</span>
                        {m.isGoLive ? <Badge tone="violet">Go-live</Badge> : null}
                      </div>
                      <div className="truncate text-[12px] text-ink-3">
                        {m.project.customerAccount?.name ?? m.project.name}
                      </div>
                    </div>
                    <span className="shrink-0 text-[12px] text-ink-2">{fmtDate(m.dueDate)}</span>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
