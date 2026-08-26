import { requirePortfolioAccess } from "@/lib/guard";
import {
  forecastAccuracy,
  onTimeByOwner,
  onTimeByComplexityTier,
  slipAttribution,
} from "@/lib/queries";
import { Card, CardHeader, PageHeader, Stat, EmptyState, Badge, LinkButton } from "@/components/ui";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analysis" };

const TIER_LABEL: Record<string, string> = {
  STANDARD: "Standard",
  MODERATE: "Moderate",
  HIGH: "High",
  ENTERPRISE: "Enterprise",
};

export default async function AnalysisPage() {
  await requirePortfolioAccess();

  const [accuracy, owners, tiers, slips] = await Promise.all([
    forecastAccuracy(),
    onTimeByOwner(),
    onTimeByComplexityTier(),
    slipAttribution(),
  ]);

  return (
    <>
      <PageHeader
        title="Analysis"
        subtitle="Forecast accuracy and delivery patterns across completed implementations"
        actions={<LinkButton href="/reports/capacity">Team capacity</LinkButton>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Completed" value={accuracy.completed} hint="with a recorded forecast" />
        <Stat
          label="On-time rate"
          value={accuracy.onTimeRate !== null ? `${accuracy.onTimeRate}%` : "—"}
          tone={
            accuracy.onTimeRate === null
              ? undefined
              : accuracy.onTimeRate >= 80
                ? "green"
                : accuracy.onTimeRate >= 50
                  ? "amber"
                  : "red"
          }
        />
        <Stat label="Late" value={accuracy.lateCount} tone={accuracy.lateCount > 0 ? "amber" : undefined} />
        <Stat
          label="Avg. forecast variance"
          value={accuracy.avgVariance !== null ? `${accuracy.avgVariance > 0 ? "+" : ""}${accuracy.avgVariance}d` : "—"}
          hint="actual vs. initial go-live"
        />
        <Stat label="Avg. duration" value={accuracy.avgDuration !== null ? `${accuracy.avgDuration}d` : "—"} />
      </div>

      {accuracy.completed === 0 ? (
        <Card>
          <EmptyState
            title="Nothing to analyze yet"
            description="This fills in once implementations with a recorded initial go-live are marked complete."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="On-time rate by owner"
              subtitle="Consistency (on-time %) vs. severity (avg. days late when missed)"
            />
            {owners.length === 0 ? (
              <EmptyState title="No owner data yet" />
            ) : (
              <div className="divide-y divide-border">
                <div className="flex items-center gap-4 border-b border-border bg-surface-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  <div className="flex-1">Owner</div>
                  <div className="w-[90px] text-right">Completed</div>
                  <div className="w-[100px] text-right">On-time</div>
                  <div className="w-[110px] text-right">Avg. variance</div>
                  <div className="w-[140px] text-right">Avg. days late (misses)</div>
                </div>
                {owners.map((o) => (
                  <div key={o.leadId} className="flex items-center gap-4 px-4 py-3">
                    <div className="flex-1 truncate text-[13.5px] font-medium text-ink">{o.name}</div>
                    <div className="w-[90px] text-right text-[13px] text-ink-2">{o.completed}</div>
                    <div className="w-[100px] text-right">
                      <Badge tone={o.onTimeRate >= 80 ? "green" : o.onTimeRate >= 50 ? "amber" : "red"}>
                        {o.onTimeRate}%
                      </Badge>
                    </div>
                    <div className="w-[110px] text-right text-[13px] text-ink-2">
                      {o.avgVariance !== null ? `${o.avgVariance > 0 ? "+" : ""}${o.avgVariance}d` : "—"}
                    </div>
                    <div className="w-[140px] text-right text-[13px] text-ink-2">
                      {o.misses > 0 ? `+${o.avgDaysLateOnMisses}d (${o.misses})` : "no misses"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="On-time rate by complexity tier" subtitle="Standard → Enterprise" />
              {tiers.length === 0 ? (
                <EmptyState title="No tier data yet" />
              ) : (
                <div className="divide-y divide-border">
                  {tiers.map((t) => (
                    <div key={t.tier} className="flex items-center gap-4 px-4 py-3">
                      <div className="flex-1 text-[13.5px] font-medium text-ink">
                        {TIER_LABEL[t.tier]} <span className="text-ink-3">({t.n})</span>
                      </div>
                      <div className="text-right text-[12.5px] text-ink-2">
                        avg duration {t.avgDuration ?? "—"}d · avg variance{" "}
                        {t.avgVariance !== null ? `${t.avgVariance > 0 ? "+" : ""}${t.avgVariance}d` : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <CardHeader
                title="Slip attribution"
                subtitle={`${slips.events} slip event${slips.events === 1 ? "" : "s"} · ${slips.totalDays}d total`}
              />
              {slips.events === 0 ? (
                <EmptyState title="No slips logged" description="Every go-live has held its date so far." />
              ) : (
                <div className="p-4">
                  <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
                    {(
                      [
                        ["customer", "bg-brand", slips.customerDays],
                        ["PIMSY", "bg-red", slips.pimsyDays],
                        ["untagged", "bg-border-strong", slips.untaggedDays],
                      ] as const
                    ).map(([label, cls, n]) =>
                      n === 0 ? null : (
                        <div
                          key={label}
                          className={cn("h-full first:rounded-l-full last:rounded-r-full", cls)}
                          style={{ width: `${(n / Math.max(1, slips.totalDays)) * 100}%` }}
                        />
                      ),
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-[12.5px] text-ink-2">
                    <span>Customer-caused: {slips.customerDays}d</span>
                    <span>PIMSY-caused: {slips.pimsyDays}d</span>
                    {slips.untaggedDays > 0 ? (
                      <span className="text-amber">
                        Untagged: {slips.untaggedDays}d ({slips.untaggedCount})
                      </span>
                    ) : null}
                  </div>
                  {slips.byOwner.length > 0 ? (
                    <div className="mt-4 space-y-1.5 border-t border-border pt-3">
                      {slips.byOwner.map((o) => (
                        <div key={o.name} className="flex items-center justify-between text-[12.5px]">
                          <span className="text-ink">{o.name}</span>
                          <span className="text-ink-3">
                            {o.events} event{o.events === 1 ? "" : "s"} · customer {o.customerDays}d ·
                            PIMSY {o.pimsyDays}d
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
