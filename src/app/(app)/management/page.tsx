import Link from "next/link";
import { loadDirectorSnapshot } from "@/lib/prism-snapshot";
import { listDailyFacts } from "@/lib/daily-brief-store";
import { Card, CardHeader, Stat, Badge } from "@/components/ui";
import { HeadroomChart, MemberLoadCards } from "@/components/charts";
import { TrendChart } from "@/components/trend-chart";
import { fmtShort } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard — Prism" };

function missingFactsTable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /daily_facts|42P01|does not exist/i.test(message);
}

export default async function ManagementHubPage() {
  const snap = await loadDirectorSnapshot(12);
  let facts: Awaited<ReturnType<typeof listDailyFacts>> = [];
  let factsReady = true;
  try {
    facts = await listDailyFacts();
  } catch (err) {
    if (!missingFactsTable(err)) throw err;
    factsReady = false;
  }
  const plotted = facts.filter((fact) => !fact.gap);
  const latest = plotted[plotted.length - 1];
  const gaps = facts.filter((fact) => fact.gap);

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-ink">Trends</h2>
          {latest ? <span className="text-[12px] text-ink-3">Through {latest.factDate}</span> : null}
        </div>
        {!factsReady ? (
          <p className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-[13px] text-ink-2">
            Daily facts are not in this database yet. Apply migration 0034_daily_facts.
          </p>
        ) : plotted.length === 0 ? (
          <Card>
            <CardHeader title="No snapshots yet" subtitle="Weekday Dock, Prism, and Zendesk files fill this in." />
            <details className="px-4 pb-4 text-[12.5px] text-ink-2">
              <summary className="cursor-pointer font-medium text-ink">How to load</summary>
              <p className="mt-2">
                Put one folder per day under snapshots/, then run{" "}
                <code className="text-[12px]">npm run db:backfill:daily-brief -- --dir ./snapshots</code>.
                That prints a dry-run. Add --apply to write. Sample files are loaded separately.
              </p>
            </details>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <TrendChart label="WIP sites" points={plotted.map((fact) => ({ date: fact.factDate, value: fact.wipSites }))} />
              <TrendChart label="Overdue tasks" points={plotted.map((fact) => ({ date: fact.factDate, value: fact.overdueTasks }))} />
              <TrendChart
                label="Waiting on PIMSY"
                points={plotted.map((fact) => ({ date: fact.factDate, value: fact.waitingOnPimsy }))}
              />
              <TrendChart
                label="Waiting on customer"
                points={plotted.map((fact) => ({ date: fact.factDate, value: fact.waitingOnCustomer }))}
              />
              <TrendChart
                label="Prism load"
                points={plotted.map((fact) => ({ date: fact.factDate, value: fact.prismLoadHours }))}
              />
              <TrendChart
                label="Capacity"
                points={plotted.map((fact) => ({ date: fact.factDate, value: fact.prismCapacityHours }))}
              />
              <TrendChart label="Slip days" points={plotted.map((fact) => ({ date: fact.factDate, value: fact.slipDays }))} />
              <TrendChart
                label="Zendesk open"
                points={plotted.map((fact) => ({ date: fact.factDate, value: fact.zendeskOpen }))}
              />
            </div>
            {latest ? (
              <p className="text-[12.5px] text-ink-3">
                Task progress {latest.taskDone ?? "—"}/{latest.taskTotal ?? "—"} · target passed {latest.targetPassed ?? "—"}
                {latest.note ? ` · ${latest.note}` : ""}
              </p>
            ) : null}
            {gaps.length > 0 || (latest?.owners.length ?? 0) > 0 ? (
              <details className="rounded-xl border border-border bg-surface px-4 py-3">
                <summary className="cursor-pointer text-[13px] font-medium text-ink">Gaps and owner mix</summary>
                {gaps.length > 0 ? (
                  <p className="mt-2 text-[12.5px] text-ink-2">
                    Gap days: {gaps.map((fact) => fact.factDate).join(", ")}
                  </p>
                ) : null}
                {latest && latest.owners.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-[12.5px] text-ink-2">
                    {latest.owners.map((owner) => (
                      <li key={`${owner.owner}-${owner.team}`}>
                        {owner.owner}
                        {owner.team ? ` · ${owner.team}` : ""} — {owner.wipSites} sites
                      </li>
                    ))}
                  </ul>
                ) : null}
              </details>
            ) : null}
          </>
        )}
      </section>
      {snap.hireNow ? (
        <div className="rounded-xl border border-transparent bg-red-soft px-4 py-3 text-[13px] text-red">
          <strong className="font-semibold">Hire now.</strong> Peak week {snap.peakWeekOf ?? "—"} is
          over billable capacity ({snap.deptCapacityHours}h/wk). Hire lead is {snap.hireLeadWeeks} weeks.
        </div>
      ) : snap.nearCapacity ? (
        <div className="rounded-xl border border-transparent bg-amber-soft px-4 py-3 text-[13px] text-amber">
          <strong className="font-semibold">Near capacity.</strong> Watch slips and new kickoffs.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="This week" value={`${snap.thisWeekLoad}h`} hint={`Headroom ${snap.thisWeekHeadroom}h`} />
        <Stat
          label="Peak week"
          value={`${snap.peakWeekLoad}h`}
          hint={snap.peakWeekOf ?? undefined}
          tone={snap.hireNow ? "red" : snap.nearCapacity ? "amber" : undefined}
        />
        <Stat label="Hire now" value={snap.hireNow ? "Yes" : "No"} tone={snap.hireNow ? "red" : "green"} />
        <Stat label="Active" value={snap.activeCount} hint="Includes pre-kickoff" />
        <Stat
          label="Kickoffs 14d"
          value={snap.kickoffsNext14.length}
          hint={snap.kickoffsNext14[0] ? `next ${snap.kickoffsNext14[0].acronym}` : "none"}
        />
        <Stat label="Pipeline" value={snap.pipelineCount} href="/management/engagements?status=pipeline" />
      </div>

      <Card>
        <CardHeader
          title="Load vs capacity"
          subtitle="Weekly billable load as a line against department cap. Peak week is marked."
          action={
            <Link href="/management/forecast" className="text-[12.5px] font-medium text-brand hover:underline">
              Forecast →
            </Link>
          }
        />
        <HeadroomChart
          weeks={snap.forecastWeeks}
          capacityHours={snap.deptCapacityHours}
          peakWeekOf={snap.peakWeekOf}
        />
      </Card>

      {snap.team.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-[13.5px] font-semibold text-ink">Team headroom</h2>
          <p className="text-[12.5px] text-ink-3">
            This week vs each person&apos;s cap. Exempt people are left out of the department total.
          </p>
          <MemberLoadCards
            members={snap.team.map((m) => ({
              id: m.id,
              name: m.name,
              email: m.email,
              capacityHoursPerWeek: m.capacityHoursPerWeek,
              capacityExempt: m.capacityExempt,
              isDirector: m.isDirector,
              thisWeekHours: m.thisWeekHours,
              peakHours: m.peakHours,
            }))}
          />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Go-lives next 14 days"
            subtitle="Current target dates"
            action={
              <Link href="/management/forecast" className="text-[12.5px] font-medium text-brand hover:underline">
                Forecast →
              </Link>
            }
          />
          {snap.goLivesNext14.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-ink-3">None on the calendar in the next two weeks.</p>
          ) : (
            <ul className="divide-y divide-border">
              {snap.goLivesNext14.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                  <Link href={`/management/engagements/${g.id}`} className="min-w-0 font-medium text-ink hover:text-brand">
                    <span className="block truncate">{g.acronym}</span>
                    <span className="block truncate text-[12px] font-normal text-ink-3">{g.name}</span>
                  </Link>
                  <span className="shrink-0 tabular-nums text-ink-2">
                    {fmtShort(g.goLive)} · {g.daysUntil}d
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader
            title="Kickoffs next 14 days"
            subtitle="Scheduled start dates"
          />
          {snap.kickoffsNext14.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-ink-3">No kickoffs scheduled in the next two weeks.</p>
          ) : (
            <ul className="divide-y divide-border">
              {snap.kickoffsNext14.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                  <Link href={`/management/engagements/${k.id}`} className="min-w-0 font-medium text-ink hover:text-brand">
                    <span className="block truncate">{k.acronym}</span>
                    <span className="block truncate text-[12px] font-normal text-ink-3">{k.name}</span>
                  </Link>
                  <span className="shrink-0 tabular-nums text-ink-2">
                    {fmtShort(k.kickoff)} · {k.daysUntil}d
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader
            title="Slipped sites"
            subtitle="Go-live moved later"
          />
          {snap.slipped.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-ink-3">No slips right now.</p>
          ) : (
            <ul className="divide-y divide-border">
              {snap.slipped.slice(0, 8).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                  <Link href={`/management/engagements/${e.id}`} className="font-medium text-ink hover:text-brand">
                    {e.acronym}
                  </Link>
                  <span className="tabular-nums text-ink-2">
                    {e.slipDays != null && e.slipDays !== 0 ? `${e.slipDays > 0 ? "+" : ""}${e.slipDays}d` : "—"}
                    {e.slipWeeklyDelta != null && e.slipWeeklyDelta !== 0
                      ? ` · Δ ${e.slipWeeklyDelta > 0 ? "+" : ""}${e.slipWeeklyDelta}h/wk`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {snap.pipeline.length > 0 ? (
        <Card>
          <CardHeader
            title="Pipeline"
            subtitle={`${snap.pipeline.length} site${snap.pipeline.length === 1 ? "" : "s"} not counted in weekly hours`}
            action={
              <Link
                href="/management/engagements?status=pipeline"
                className="text-[12.5px] font-medium text-brand hover:underline"
              >
                Roster →
              </Link>
            }
          />
          <ul className="divide-y divide-border">
            {snap.pipeline.slice(0, 8).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                <Link href={`/management/engagements/${p.id}`} className="min-w-0 font-medium text-ink hover:text-brand">
                  <span className="block truncate">{p.acronym}</span>
                  <span className="block truncate text-[12px] font-normal text-ink-3">{p.name}</span>
                </Link>
                <span className="shrink-0 text-ink-3">Off the load</span>
              </li>
            ))}
          </ul>
          {snap.pipeline.length > 8 ? (
            <details className="border-t border-border px-4 py-3">
              <summary className="cursor-pointer text-[12.5px] font-medium text-ink">
                {snap.pipeline.length - 8} more
              </summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {snap.pipeline.slice(8).map((p) => (
                  <Link key={p.id} href={`/management/engagements/${p.id}`}>
                    <Badge>{p.acronym}</Badge>
                  </Link>
                ))}
              </div>
            </details>
          ) : null}
        </Card>
      ) : null}

    </div>
  );
}
