import Link from "next/link";
import { getManagementForecast } from "@/actions/management-forecast";
import { ForecastExclusionsForm } from "../_components/forecast-exclusions-form";
import { Badge, Card, CardHeader, EmptyState, Stat, Avatar } from "@/components/ui";
import { fmtShort } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { FORECAST_WEIGHTS, SERVICE_LINE_HOURS, SERVICE_LINE_LABELS } from "@/lib/estimator";
import { TYPICAL_HIRE_HOURS_PER_WEEK } from "@/lib/forecast";

export const dynamic = "force-dynamic";
export const metadata = { title: "Forecast — Staffing" };

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function hoursLabel(n: number) {
  return n === 0 ? "—" : n.toFixed(n % 1 === 0 ? 0 : 1);
}

export default async function ManagementForecastPage() {
  const { forecast, exclusions, knownCodes } = await getManagementForecast(12);
  const nameById = new Map(forecast.staff.map((s) => [s.id, s.name ?? s.email ?? "—"]));
  const loadRows = forecast.engagements.filter((e) => e.countsTowardLoad);
  const pipeline = forecast.engagements.filter((e) => e.prismStatus === "pipeline");
  const slipped = loadRows.filter((e) => e.slipDays != null && e.slipDays !== 0);

  return (
    <div className="space-y-5">
      <p className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
        Weekly hours from scoped estimates (or custom hrs/wk), spread across kickoff → current
        go-live. Pipeline is off the load. Capacity-exempt people still show on the grid but are
        excluded from department headroom and hire-now. Native Postgres — Prism SQL dual-read is
        v1.11.
      </p>

      {forecast.hire.hireNow ? (
        <div className="rounded-xl border border-transparent bg-red-soft px-4 py-3 text-[13px] text-red">
          <strong className="font-semibold">Hire now.</strong> Peak week of{" "}
          {forecast.hire.peakWeekOf ? fmtShort(forecast.hire.peakWeekOf) : "—"} is short{" "}
          {forecast.hire.hoursShort}h versus billable capacity ({forecast.deptCapacityHours}h/wk).
          About {forecast.hire.fteHint || 1} specialist at {TYPICAL_HIRE_HOURS_PER_WEEK}h/wk would
          cover the peak.
        </div>
      ) : forecast.hire.nearCapacity ? (
        <div className="rounded-xl border border-transparent bg-amber-soft px-4 py-3 text-[13px] text-amber">
          <strong className="font-semibold">Near capacity.</strong> Peak week utilization is{" "}
          {pct(forecast.hire.peakUtilization)} — watch slips and new kickoffs.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat
          label="Dept capacity"
          value={`${forecast.deptCapacityHours}h`}
          hint={`${forecast.billableStaffCount} billable · exempt excluded`}
        />
        <Stat
          label="This week load"
          value={`${forecast.thisWeek?.billableHours ?? 0}h`}
          hint={forecast.thisWeek ? fmtShort(forecast.thisWeek.weekOf) : undefined}
        />
        <Stat
          label="This week headroom"
          value={`${forecast.thisWeekHeadroom}h`}
          tone={forecast.thisWeekHeadroom < 0 ? "red" : forecast.thisWeekHeadroom < 10 ? "amber" : "green"}
        />
        <Stat
          label="Peak week"
          value={`${forecast.peakWeek?.billableHours ?? 0}h`}
          hint={
            forecast.peakWeek
              ? `${fmtShort(forecast.peakWeek.weekOf)} · ${pct(forecast.peakWeek.utilization)}`
              : undefined
          }
          tone={forecast.hire.hireNow ? "red" : forecast.hire.nearCapacity ? "amber" : undefined}
        />
        <Stat
          label="Hire now"
          value={forecast.hire.hireNow ? "Yes" : "No"}
          hint={
            forecast.hire.hireNow
              ? `${forecast.hire.hoursShort}h short at peak`
              : `Peak headroom ${forecast.peakHeadroom}h`
          }
          tone={forecast.hire.hireNow ? "red" : "green"}
        />
      </div>

      <Card>
        <CardHeader
          title="Load by week"
          subtitle="Billable hours (exempt excluded from totals / headroom). Peak week highlighted."
        />
        {forecast.staff.length === 0 ? (
          <EmptyState title="No staff yet" description="Add people under Staffing → Team." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2 text-left">Week of</th>
                  {forecast.staff.map((s) => (
                    <th key={s.id} className="px-3 py-2 text-right">
                      {(s.name ?? "—").split(" ")[0]}
                      <span className="ml-1 font-normal normal-case text-ink-3">
                        {s.capacityHoursPerWeek}h
                        {s.capacityExempt ? " · ex" : ""}
                      </span>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right">Billable</th>
                  <th className="px-4 py-2 text-right">Headroom</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {forecast.weeks.map((w) => {
                  const isPeak = forecast.peakWeek?.weekOf.getTime() === w.weekOf.getTime();
                  return (
                    <tr key={w.weekOf.toISOString()} className={cn(isPeak && "bg-amber-soft/40")}>
                      <td className="px-4 py-2 text-ink-2">
                        {fmtShort(w.weekOf)}
                        {isPeak ? (
                          <Badge tone="amber" className="ml-2">
                            Peak
                          </Badge>
                        ) : null}
                      </td>
                      {w.byPerson.map((p) => {
                        const member = forecast.staff.find((s) => s.id === p.id);
                        const over =
                          member && !member.capacityExempt && p.hours > member.capacityHoursPerWeek;
                        return (
                          <td
                            key={p.id}
                            className={cn(
                              "px-3 py-2 text-right tabular-nums",
                              over ? "font-semibold text-red" : "text-ink-2",
                            )}
                          >
                            {hoursLabel(p.hours)}
                          </td>
                        );
                      })}
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-medium tabular-nums",
                          w.headroom < 0 ? "text-red" : "text-ink",
                        )}
                      >
                        {hoursLabel(w.billableHours)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2 text-right tabular-nums",
                          w.headroom < 0 ? "text-red" : "text-ink-2",
                        )}
                      >
                        {w.headroom}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Team load"
          subtitle="This week vs personal cap. Exempt members are listed but left out of department math."
        />
        {forecast.staff.length === 0 ? (
          <EmptyState title="No staff yet" />
        ) : (
          <div className="divide-y divide-border">
            {forecast.staff.map((s) => {
              const thisHrs = forecast.thisWeek?.byPerson.find((p) => p.id === s.id)?.hours ?? 0;
              const peakHrs = Math.max(
                ...forecast.weeks.map((w) => w.byPerson.find((p) => p.id === s.id)?.hours ?? 0),
                0,
              );
              const util =
                s.capacityHoursPerWeek > 0 ? Math.round((thisHrs / s.capacityHoursPerWeek) * 100) : 0;
              return (
                <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <Avatar name={s.name} image={s.image} size={28} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-[13.5px] font-medium text-ink">
                          {s.name ?? s.email}
                        </span>
                        {s.isDirector ? <Badge tone="violet">Director</Badge> : null}
                        {s.capacityExempt ? <Badge tone="amber">Exempt</Badge> : null}
                      </div>
                      <div className="text-[12px] text-ink-3">{s.capacityHoursPerWeek}h/wk declared</div>
                    </div>
                  </div>
                  <div className="w-[90px] text-right text-[13px] text-ink-2">
                    <div className="text-[11px] uppercase text-ink-3">This wk</div>
                    {hoursLabel(thisHrs)}h
                  </div>
                  <div className="w-[90px] text-right text-[13px] text-ink-2">
                    <div className="text-[11px] uppercase text-ink-3">Peak</div>
                    {hoursLabel(peakHrs)}h
                  </div>
                  <div className="w-[80px] text-right">
                    {s.capacityExempt ? (
                      <span className="text-[12px] text-ink-3">n/a dept</span>
                    ) : (
                      <Badge tone={util > 100 ? "red" : util >= 85 ? "amber" : "green"}>{util}%</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Engagements on the calendar"
          subtitle="Active and pre-kickoff. A slip stretches the window and drops weekly hours unless custom hrs/wk is set."
          action={
            <Link href="/management/engagements" className="text-[12.5px] font-medium text-brand hover:underline">
              Roster →
            </Link>
          }
        />
        {loadRows.length === 0 ? (
          <EmptyState title="No active or pre-kickoff implementations" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  <th className="px-3 py-2 text-left">Acronym</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Owner</th>
                  <th className="px-3 py-2 text-right">Hrs/wk</th>
                  <th className="px-3 py-2 text-left">Window</th>
                  <th className="px-3 py-2 text-right">Slip</th>
                  <th className="px-3 py-2 text-right">Slip Δ hrs/wk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loadRows.map((e) => (
                  <tr key={e.id} className="hover:bg-surface-2/60">
                    <td className="px-3 py-2">
                      <Link
                        href={`/management/engagements/${e.id}`}
                        className="font-medium text-ink hover:text-brand"
                      >
                        {e.acronym}
                      </Link>
                      {!e.onCalendar ? (
                        <span className="ml-2 text-[11.5px] text-ink-3">no dates</span>
                      ) : null}
                      {e.customHoursPerWeek != null ? (
                        <Badge className="ml-2">custom</Badge>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 capitalize text-ink-2">{e.prismStatus}</td>
                    <td className="px-3 py-2 text-ink-2">
                      {e.leadId ? nameById.get(e.leadId) : "—"}
                      {e.coLeadId ? ` / ${nameById.get(e.coLeadId)}` : ""}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink">
                      {e.weeklyHours > 0 ? e.weeklyHours : "—"}
                    </td>
                    <td className="px-3 py-2 text-ink-2">
                      {fmtShort(e.startDate)} → {fmtShort(e.targetGoLiveDate)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-2">
                      {e.slipDays != null && e.slipDays !== 0
                        ? `${e.slipDays > 0 ? "+" : ""}${e.slipDays}d`
                        : "—"}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right tabular-nums",
                        (e.slipWeeklyDelta ?? 0) < 0 ? "text-green" : "text-ink-2",
                      )}
                    >
                      {e.slipWeeklyDelta != null && e.slipWeeklyDelta !== 0
                        ? `${e.slipWeeklyDelta > 0 ? "+" : ""}${e.slipWeeklyDelta}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {slipped.length > 0 ? (
          <p className="border-t border-border px-4 py-3 text-[12px] text-ink-3">
            {slipped.length} engagement{slipped.length === 1 ? "" : "s"} have a go-live slip. Later
            dates dilute weekly hours (same estimate over a longer window) unless custom hrs/wk is
            set on the engagement.
          </p>
        ) : null}
        {pipeline.length > 0 ? (
          <p className="border-t border-border px-4 py-3 text-[12.5px] text-ink-3">
            {pipeline.length} pipeline site{pipeline.length === 1 ? "" : "s"} excluded from active
            load: {pipeline.map((p) => p.acronym).join(", ")}.
          </p>
        ) : null}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Analysis exclusions"
            subtitle="Primary averages on /reports/analysis skip these codes."
          />
          <ForecastExclusionsForm exclusions={exclusions} knownCodes={knownCodes} />
        </Card>
        <Card>
          <CardHeader
            title="Forecast+ weights"
            subtitle="Estimator constants ported from Prism. Tune in code against Analysis — not a dual-write to Prism SQL."
          />
          <div className="px-4 pb-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
              <dt className="text-ink-3">Minutes / user</dt>
              <dd className="text-right tabular-nums text-ink">{FORECAST_WEIGHTS.minutesPerUser}</dd>
              <dt className="text-ink-3">Minutes / form page</dt>
              <dd className="text-right tabular-nums text-ink">{FORECAST_WEIGHTS.minutesPerFormPage}</dd>
              <dt className="text-ink-3">Org / billing / other</dt>
              <dd className="text-right tabular-nums text-ink">
                {FORECAST_WEIGHTS.orgSetupHours +
                  FORECAST_WEIGHTS.billingConfigHours +
                  FORECAST_WEIGHTS.otherSettingsHours}
                h
              </dd>
              <dt className="text-ink-3">State compliance</dt>
              <dd className="text-right tabular-nums text-ink">{FORECAST_WEIGHTS.stateComplianceHours}h</dd>
              <dt className="text-ink-3">Discovery (typical)</dt>
              <dd className="text-right tabular-nums text-ink">14d</dd>
              <dt className="text-ink-3">Core training sessions</dt>
              <dd className="text-right tabular-nums text-ink">{FORECAST_WEIGHTS.coreTrainingSessions}</dd>
            </dl>
            <div className="mt-3 border-t border-border pt-3">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                Service-line hours
              </div>
              <ul className="columns-2 gap-4 text-[12px] text-ink-2">
                {Object.entries(SERVICE_LINE_HOURS)
                  .filter(([, hrs]) => hrs > 0)
                  .map(([key, hrs]) => (
                    <li key={key} className="flex justify-between gap-2">
                      <span>{SERVICE_LINE_LABELS[key] ?? key}</span>
                      <span className="tabular-nums">{hrs}h</span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
