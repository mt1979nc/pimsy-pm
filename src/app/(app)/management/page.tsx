import Link from "next/link";
import { loadDirectorSnapshot } from "@/lib/prism-snapshot";
import { Card, CardHeader, LinkButton, Stat, Badge } from "@/components/ui";
import { fmtShort } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Staffing" };

export default async function ManagementHubPage() {
  const snap = await loadDirectorSnapshot(12);

  return (
    <div className="space-y-5">
      <p className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
        <strong className="font-semibold text-ink">Prism lives here.</strong> Capacity, Forecast+,
        engagement edits, and Analysis all read PM Postgres. Director / Pipeline / morning snapshot
        routines should call{" "}
        <code className="text-[12px]">GET /api/prism/snapshot</code> — not Prism Azure SQL.
      </p>

      {snap.hireNow ? (
        <div className="rounded-xl border border-transparent bg-red-soft px-4 py-3 text-[13px] text-red">
          <strong className="font-semibold">Hire now.</strong> Peak week {snap.peakWeekOf ?? "—"} is
          over billable capacity ({snap.deptCapacityHours}h/wk).
        </div>
      ) : snap.nearCapacity ? (
        <div className="rounded-xl border border-transparent bg-amber-soft px-4 py-3 text-[13px] text-amber">
          <strong className="font-semibold">Near capacity.</strong> Watch slips and new kickoffs.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="This week load" value={`${snap.thisWeekLoad}h`} hint={`headroom ${snap.thisWeekHeadroom}h`} />
        <Stat
          label="Peak week"
          value={`${snap.peakWeekLoad}h`}
          hint={snap.peakWeekOf ?? undefined}
          tone={snap.hireNow ? "red" : snap.nearCapacity ? "amber" : undefined}
        />
        <Stat label="Hire now" value={snap.hireNow ? "Yes" : "No"} tone={snap.hireNow ? "red" : "green"} />
        <Stat label="Active / pre-KO" value={snap.activeCount} />
        <Stat label="Pipeline" value={snap.pipelineCount} href="/management/engagements?status=pipeline" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Go-lives next 14 days"
            subtitle="Morning snapshot — current target dates"
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
                <li key={g.acronym} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                  <span className="font-medium text-ink">{g.acronym}</span>
                  <span className="truncate text-ink-3">{g.name}</span>
                  <span className="tabular-nums text-ink-2">
                    {fmtShort(g.goLive)} · {g.daysUntil}d
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader
            title="Slipped engagements"
            subtitle="Later go-live dilutes weekly hours unless custom hrs/wk is set"
          />
          {snap.slipped.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-ink-3">No active slips on the book.</p>
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
            title="Pipeline (off load)"
            subtitle={`${snap.pipeline.length} site${snap.pipeline.length === 1 ? "" : "s"} excluded from department hours until status changes`}
            action={
              <Link
                href="/management/engagements?status=pipeline"
                className="text-[12.5px] font-medium text-brand hover:underline"
              >
                Roster →
              </Link>
            }
          />
          <div className="flex flex-wrap gap-1.5 px-4 py-3">
            {snap.pipeline.map((p) => (
              <Link key={p.id} href={`/management/engagements/${p.id}`}>
                <Badge>{p.acronym}</Badge>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader title="Forecast" subtitle="Weekly hours, peak, hire-now." />
          <div className="px-4 pb-4">
            <LinkButton href="/management/forecast">Open forecast</LinkButton>
          </div>
        </Card>
        <Card>
          <CardHeader title="Team" subtitle="Billable hrs, exempt, can-lead, director." />
          <div className="px-4 pb-4">
            <LinkButton href="/management/team">Open team</LinkButton>
          </div>
        </Card>
        <Card>
          <CardHeader title="Engagements" subtitle="Edit owners, dates, status, scope." />
          <div className="px-4 pb-4">
            <LinkButton href="/management/engagements">Open roster</LinkButton>
          </div>
        </Card>
      </div>
    </div>
  );
}
