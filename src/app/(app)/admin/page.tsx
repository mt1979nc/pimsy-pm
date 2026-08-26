import Link from "next/link";
import { and, eq, ne, count, gte, desc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requirePortfolioAccess } from "@/lib/guard";
import {
  portfolioSummary,
  attentionProjects,
  listCustomers,
  cycleTimeStats,
  teamCapacity,
  openRisks,
} from "@/lib/queries";
import {
  Card,
  CardHeader,
  Stat,
  EmptyState,
  Badge,
  HealthBadge,
  CustomerStatusBadge,
  SeverityBadge,
  ProgressBar,
  Avatar,
  LinkButton,
} from "@/components/ui";
import { pctComplete } from "@/lib/rollup";
import { fmtRelative, daysUntil, addDays } from "@/lib/dates";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Management" };

export default async function AdminOverviewPage() {
  const actor = await requirePortfolioAccess();

  const [summary, attention, customers, cycle, team, risks, staffCount, contactCount, recentlyActive] =
    await Promise.all([
      portfolioSummary(actor),
      attentionProjects(actor, 8),
      listCustomers(),
      cycleTimeStats(),
      teamCapacity(),
      openRisks(actor, 8),
      db.select({ n: count() }).from(users).where(and(ne(users.role, "CUSTOMER"), eq(users.isActive, true))),
      db.select({ n: count() }).from(users).where(and(eq(users.role, "CUSTOMER"), eq(users.isActive, true))),
      db.query.users.findMany({
        where: and(eq(users.isActive, true), gte(users.lastSeenAt, addDays(new Date(), -7))),
        columns: { id: true, name: true, email: true, role: true, image: true, lastSeenAt: true },
        orderBy: [desc(users.lastSeenAt)],
        limit: 8,
      }),
    ]);

  const liveCustomers = customers.filter((c) => c.status === "LIVE").length;
  const onboarding = customers.filter((c) => c.status === "ONBOARDING").length;
  const atRiskCustomers = customers.filter((c) => c.status === "AT_RISK").length;
  const overloaded = team.filter((t) => t.utilization > 110);
  const idle = team.filter((t) => t.utilization < 40 && t.openTasks === 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Customers" value={customers.length} hint={`${onboarding} onboarding · ${liveCustomers} live`} href="/admin/customers" />
        <Stat label="Active projects" value={summary.active} href="/admin/projects" />
        <Stat
          label="At risk"
          value={summary.atRisk + atRiskCustomers}
          tone={summary.atRisk + atRiskCustomers > 0 ? "red" : undefined}
          hint={`${summary.atRisk} projects · ${atRiskCustomers} accounts`}
          href="/admin/projects?health=RED"
        />
        <Stat
          label="People"
          value={(staffCount[0]?.n ?? 0) + (contactCount[0]?.n ?? 0)}
          hint={`${staffCount[0]?.n ?? 0} staff · ${contactCount[0]?.n ?? 0} contacts`}
          href="/admin/users"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Go-lives in 30 days" value={summary.goLivesNext30} />
        <Stat
          label="Median go-live"
          value={cycle.medianDays !== null ? `${cycle.medianDays}d` : "—"}
          hint={`${cycle.completed} completed`}
        />
        <Stat
          label="On-time rate"
          value={cycle.onTimeRate !== null ? `${cycle.onTimeRate}%` : "—"}
          tone={
            cycle.onTimeRate === null ? undefined : cycle.onTimeRate >= 80 ? "green" : cycle.onTimeRate >= 60 ? "amber" : "red"
          }
        />
        <Stat
          label="Waiting on customers"
          value={summary.openCustomerActions}
          hint="open action items"
        />
      </div>

      {overloaded.length > 0 ? (
        <div className="rounded-xl border border-transparent bg-red-soft px-4 py-3 text-[13px] text-red">
          <strong className="font-semibold">Over capacity:</strong>{" "}
          {overloaded.map((t) => `${t.name} (${t.utilization}%)`).join(", ")}.{" "}
          <Link href="/reports/capacity" className="underline underline-offset-2">
            Rebalance
          </Link>
        </div>
      ) : null}

      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Needs attention"
              subtitle="Ranked by health, blockers and schedule slip"
              action={
                <Link href="/admin/projects" className="text-[12.5px] font-medium text-brand hover:underline">
                  All projects
                </Link>
              }
            />
            {attention.length === 0 ? (
              <EmptyState title="Everything is on track" />
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
                      <div className="hidden w-[100px] sm:block">
                        <div className="mb-1 text-[11.5px] text-ink-2">
                          {pctComplete(p.taskCountDone, p.taskCountTotal)}%
                        </div>
                        <ProgressBar value={p.taskCountDone} total={p.taskCountTotal} />
                      </div>
                      {p.lead ? <Avatar name={p.lead.name} image={p.lead.image} size={24} /> : null}
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Customers at a glance"
              action={
                <Link href="/admin/customers" className="text-[12.5px] font-medium text-brand hover:underline">
                  All customers
                </Link>
              }
            />
            {customers.length === 0 ? (
              <EmptyState title="No customers yet" />
            ) : (
              <div className="divide-y divide-border">
                {customers.slice(0, 8).map((c) => {
                  const active = c.projects.filter(
                    (p) => !["COMPLETED", "CANCELLED"].includes(p.status),
                  );
                  const worst = active.some((p) => p.health === "RED")
                    ? "RED"
                    : active.some((p) => p.health === "YELLOW")
                      ? "YELLOW"
                      : "GREEN";
                  return (
                    <Link
                      key={c.id}
                      href={`/customers/${c.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-ink">{c.name}</div>
                        <div className="truncate text-[12px] text-ink-3">
                          {active.length} active · {c.contacts.filter((x) => x.isActive).length} contacts
                        </div>
                      </div>
                      <CustomerStatusBadge status={c.status} />
                      {active.length > 0 ? <HealthBadge health={worst as never} /> : null}
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Team load" action={<LinkButton href="/reports/capacity" size="sm">Detail</LinkButton>} />
            <div className="divide-y divide-border">
              {team.slice(0, 8).map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar name={t.name} image={t.image} size={24} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-ink">{t.name ?? t.email}</div>
                    <div className="text-[12px] text-ink-3">
                      {t.projectsLed} led · {t.openTasks} open
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-[12.5px] font-medium tabular-nums",
                      t.utilization > 110 ? "text-red" : t.utilization > 85 ? "text-amber" : "text-ink-2",
                    )}
                  >
                    {t.utilization}%
                  </span>
                </div>
              ))}
            </div>
            {idle.length > 0 ? (
              <p className="border-t border-border px-4 py-2.5 text-[12.5px] text-ink-3">
                {idle.map((t) => t.name).join(", ")} {idle.length === 1 ? "has" : "have"} capacity.
              </p>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Open risks" />
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
                    <div className="truncate text-[12px] text-ink-3">{r.project.name}</div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Recently active" subtitle="Signed in this week" />
            {recentlyActive.length === 0 ? (
              <EmptyState title="Nobody yet" />
            ) : (
              <div className="divide-y divide-border">
                {recentlyActive.map((u) => (
                  <div key={u.id} className="flex items-center gap-2.5 px-4 py-2">
                    <Avatar name={u.name} image={u.image} size={22} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] text-ink">{u.name ?? u.email}</div>
                    </div>
                    {u.role === "CUSTOMER" ? <Badge tone="violet">Customer</Badge> : null}
                    <span className="shrink-0 text-[11.5px] text-ink-3">
                      {fmtRelative(u.lastSeenAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
