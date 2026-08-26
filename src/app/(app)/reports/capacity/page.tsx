import { requirePortfolioAccess } from "@/lib/guard";
import { teamCapacity, weeklyCapacityForecast } from "@/lib/queries";
import { PageHeader, Card, CardHeader, EmptyState, Badge, Avatar, LinkButton } from "@/components/ui";
import { fmtShort } from "@/lib/dates";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team capacity" };

function utilizationTone(pct: number) {
  if (pct > 110) return { cls: "bg-red", label: "Over capacity", tone: "red" as const };
  if (pct > 85) return { cls: "bg-amber", label: "Near capacity", tone: "amber" as const };
  if (pct < 40) return { cls: "bg-brand", label: "Has room", tone: "neutral" as const };
  return { cls: "bg-green", label: "Balanced", tone: "green" as const };
}

export default async function CapacityPage() {
  await requirePortfolioAccess();
  const [team, forecast] = await Promise.all([teamCapacity(), weeklyCapacityForecast(10)]);

  const over = team.filter((t) => t.utilization > 110);
  const idle = team.filter((t) => t.utilization < 40);

  return (
    <>
      <PageHeader
        title="Team capacity"
        subtitle="Committed hours against declared weekly capacity, per specialist."
        actions={
          <>
            <LinkButton href="/reports/analysis">Analysis</LinkButton>
            <LinkButton href="/reports">Portfolio</LinkButton>
          </>
        }
      />

      <Card className="mb-5">
        <CardHeader
          title="Weekly capacity forecast"
          subtitle="Each project's estimated hours spread across its start → target go-live window"
        />
        {forecast.staff.length === 0 ? (
          <EmptyState title="No staff yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2 text-left">Week of</th>
                  {forecast.staff.map((s) => (
                    <th key={s.id} className="px-3 py-2 text-right">
                      {(s.name ?? "—").split(" ")[0]}
                      <span className="ml-1 font-normal normal-case text-ink-3">
                        {s.capacityHoursPerWeek}h
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {forecast.weeks.map((w) => (
                  <tr key={w.weekOf.toISOString()}>
                    <td className="px-4 py-2 text-ink-2">{fmtShort(w.weekOf)}</td>
                    {w.byPerson.map((p) => (
                      <td key={p.id} className="px-3 py-2 text-right tabular-nums text-ink-2">
                        {p.hours > 0 ? p.hours : "—"}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right font-medium tabular-nums text-ink">
                      {w.totalHours}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-border px-4 py-3 text-[12px] text-ink-3">
          Only projects with an estimated-hours figure (from Forecast+ scoping, or imported PRISM
          history) contribute — an unscoped project undercounts here rather than guessing.
        </p>
      </Card>

      {over.length > 0 ? (
        <div className="mb-5 rounded-xl border border-transparent bg-red-soft px-4 py-3 text-[13px] text-red">
          <strong className="font-semibold">
            {over.length} {over.length === 1 ? "person is" : "people are"} over capacity:
          </strong>{" "}
          {over.map((t) => t.name).join(", ")}. Consider reassigning work or moving a target date.
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Workload"
          subtitle={
            idle.length > 0
              ? `${idle.length} with room to take on more`
              : "Everyone is carrying work"
          }
        />
        {team.length === 0 ? (
          <EmptyState title="No staff yet" description="Invite your team under People." />
        ) : (
          <>
            <div className="flex items-center gap-4 border-b border-border bg-surface-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              <div className="flex-1">Person</div>
              <div className="hidden w-[80px] text-right sm:block">Projects</div>
              <div className="w-[80px] text-right">Open</div>
              <div className="hidden w-[80px] text-right md:block">Overdue</div>
              <div className="w-[190px]">Utilization</div>
            </div>
            <div className="divide-y divide-border">
              {team.map((t) => {
                const u = utilizationTone(t.utilization);
                return (
                  <div key={t.id} className="flex items-center gap-4 px-4 py-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <Avatar name={t.name} image={t.image} size={28} />
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-medium text-ink">
                          {t.name ?? t.email}
                        </div>
                        <div className="truncate text-[12px] capitalize text-ink-3">
                          {t.role.toLowerCase()} · {t.capacityHoursPerWeek}h/wk
                        </div>
                      </div>
                    </div>

                    <div className="hidden w-[80px] text-right text-[13px] text-ink-2 sm:block">
                      {t.projectsLed}
                    </div>
                    <div className="w-[80px] text-right text-[13px] text-ink-2">{t.openTasks}</div>
                    <div className="hidden w-[80px] text-right md:block">
                      {t.overdueTasks > 0 ? (
                        <Badge tone="red">{t.overdueTasks}</Badge>
                      ) : (
                        <span className="text-[13px] text-ink-3">0</span>
                      )}
                    </div>

                    <div className="w-[190px]">
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="text-[12px] font-medium text-ink">
                          {t.committedHours}h
                        </span>
                        <span className="text-[11.5px] text-ink-3">{u.label}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                        <div
                          className={cn("h-full rounded-full", u.cls)}
                          style={{ width: `${Math.min(t.utilization, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      <p className="mt-4 max-w-2xl text-[12.5px] leading-relaxed text-ink-3">
        Committed hours are the sum of estimates on that person&apos;s open tasks. Estimates are
        optional, so this reads as a relative signal rather than a precise forecast — the number
        gets more useful the more consistently your team estimates.
      </p>
    </>
  );
}
