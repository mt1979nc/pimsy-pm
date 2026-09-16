"use client";

import { useActionState, useMemo, useState } from "react";
import { updateEngagement } from "@/actions/management-engagements";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";
import { SlipHistoryList } from "@/components/slip-history";
import { GoLiveScenarioPicker, GoLiveSourceBadge } from "@/components/go-live-scenario-picker";
import { DEFAULT_SCOPE, DEFAULT_SKIP_US_FEDERAL_HOLIDAYS, SERVICE_LINE_LABELS, type ImplementationScope } from "@/lib/estimator";
import {
  kickoffOrToday,
  recommendGoLive,
  type DurationSample,
} from "@/lib/go-live-recommendation";
import { PRISM_STATUSES, PRISM_STATUS_LABELS, type PrismStatus } from "@/lib/prism-status";
import { toDateInput } from "@/lib/dates";
import type { DiscoveryScenario } from "@/db/schema";
import { AnalyticsExcludeToggle } from "@/components/analytics-exclude-toggle";

type LeadOption = {
  id: string;
  name: string | null;
  email: string;
  canLead: boolean;
  isDirector: boolean;
};

type Slip = {
  id: string;
  fromDate: Date | string;
  toDate: Date | string;
  days: number;
  cause: "CUSTOMER" | "PIMSY" | null;
  note: string | null;
  createdAt: Date | string;
};

export function EngagementEditForm({
  projectId,
  code,
  customerName,
  leadId,
  coLeadId,
  ownerSplitPercent,
  customHoursPerWeek,
  prismStatus,
  prismNote,
  startDate,
  initialGoLiveDate,
  targetGoLiveDate,
  scope,
  discoveryScenario,
  skipUsFederalHolidays: skipUsFederalHolidaysSaved,
  leadOptions,
  slips,
  durationSamples,
  exclusions,
  excludeFromAnalytics,
}: {
  projectId: string;
  code: string;
  customerName: string | null;
  leadId: string | null;
  coLeadId: string | null;
  ownerSplitPercent: number;
  customHoursPerWeek: number | null;
  prismStatus: PrismStatus;
  prismNote: string | null;
  startDate: Date | string | null;
  initialGoLiveDate: Date | string | null;
  targetGoLiveDate: Date | string | null;
  scope: {
    userCount: number;
    locationCount: number;
    formPageCount: number;
    trainingsPerWeek: number;
    serviceLines: string[];
    stateCompliance: boolean;
    minimalOrgStructure: boolean;
    complexityTier: string;
    estimatedHours: number | null;
  } | null;
  discoveryScenario: DiscoveryScenario;
  skipUsFederalHolidays?: boolean;
  leadOptions: LeadOption[];
  slips: Slip[];
  durationSamples: DurationSample[];
  exclusions: string[];
  excludeFromAnalytics: boolean;
}) {
  const [state, action] = useActionState(updateEngagement, {});
  const initialLocked = !!initialGoLiveDate;
  const [kickoff, setKickoff] = useState(toDateInput(startDate));
  const [targetGoLive, setTargetGoLive] = useState(toDateInput(targetGoLiveDate));
  const [scenario, setScenario] = useState<DiscoveryScenario>(discoveryScenario);
  const [skipUsFederalHolidays, setSkipUsFederalHolidays] = useState(
    skipUsFederalHolidaysSaved ?? DEFAULT_SKIP_US_FEDERAL_HOLIDAYS,
  );
  const [customHpw, setCustomHpw] = useState(
    customHoursPerWeek != null ? String(customHoursPerWeek) : "",
  );
  const [scopeState, setScopeState] = useState<ImplementationScope>({
    userCount: scope?.userCount ?? DEFAULT_SCOPE.userCount,
    locationCount: scope?.locationCount ?? DEFAULT_SCOPE.locationCount,
    formPageCount: scope?.formPageCount ?? DEFAULT_SCOPE.formPageCount,
    trainingsPerWeek: scope?.trainingsPerWeek ?? DEFAULT_SCOPE.trainingsPerWeek,
    serviceLines: scope?.serviceLines?.length ? scope.serviceLines : [...DEFAULT_SCOPE.serviceLines],
    stateCompliance: scope?.stateCompliance ?? DEFAULT_SCOPE.stateCompliance,
    minimalOrgStructure: scope?.minimalOrgStructure ?? DEFAULT_SCOPE.minimalOrgStructure,
  });

  const customHoursParsed = customHpw.trim() === "" ? null : Number.parseFloat(customHpw);

  const recommendation = useMemo(() => {
    const start = kickoffOrToday(kickoff ? new Date(`${kickoff}T12:00:00.000Z`) : null);
    return recommendGoLive({
      scope: scopeState,
      kickoffDate: start,
      samples: durationSamples,
      exclusions,
      customHoursPerWeek: Number.isFinite(customHoursParsed) ? customHoursParsed : null,
      skipUsFederalHolidays,
    });
  }, [scopeState, kickoff, durationSamples, exclusions, customHoursParsed, skipUsFederalHolidays]);

  const chosen =
    recommendation.scenarios.find((s) => s.scenario === scenario) ?? recommendation.scenarios[1];

  function applyScenario(next: DiscoveryScenario) {
    setScenario(next);
    const row = recommendation.scenarios.find((s) => s.scenario === next);
    if (row) setTargetGoLive(toDateInput(row.goLiveDate));
  }

  function toggleServiceLine(key: string) {
    setScopeState((s) => ({
      ...s,
      serviceLines: s.serviceLines.includes(key)
        ? s.serviceLines.filter((l) => l !== key)
        : [...s.serviceLines, key],
    }));
  }

  return (
    <form action={action} className="space-y-6 p-5">
      <input type="hidden" name="projectId" value={projectId} />
      <FormError error={state.error} />
      {state.ok ? (
        <p className="rounded-lg bg-green-soft px-3 py-2 text-[12.5px] text-green">Saved.</p>
      ) : null}

      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-[15px] font-semibold text-ink">{code}</h2>
        {customerName ? <span className="text-[13px] text-ink-3">{customerName}</span> : null}
      </div>

      <section className="space-y-4">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Owners</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Primary owner" htmlFor="leadId">
            <select
              id="leadId"
              name="leadId"
              defaultValue={leadId ?? ""}
              className={inputClass}
            >
              <option value="">— Unassigned —</option>
              {leadOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ?? u.email}
                  {u.isDirector ? " (Director)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Co-lead" htmlFor="coLeadId">
            <select
              id="coLeadId"
              name="coLeadId"
              defaultValue={coLeadId ?? ""}
              className={inputClass}
            >
              <option value="">— None —</option>
              {leadOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ?? u.email}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Owner split %"
            htmlFor="ownerSplitPercent"
            hint="Primary owner's share. Co-lead gets the rest."
          >
            <input
              id="ownerSplitPercent"
              name="ownerSplitPercent"
              type="number"
              min={1}
              max={100}
              defaultValue={ownerSplitPercent}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">
          Status &amp; hours
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Prism status" htmlFor="prismStatus">
            <select
              id="prismStatus"
              name="prismStatus"
              defaultValue={prismStatus}
              className={inputClass}
            >
              {PRISM_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PRISM_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Custom hrs/wk"
            htmlFor="customHoursPerWeek"
            hint="Leave blank to spread the Forecast+ hour total across kickoff → go-live."
          >
            <input
              id="customHoursPerWeek"
              name="customHoursPerWeek"
              type="number"
              step="0.1"
              min={0}
              max={80}
              value={customHpw}
              onChange={(e) => setCustomHpw(e.target.value)}
              placeholder="e.g. 2"
              className={inputClass}
            />
          </Field>
          <Field label="Note (stalled / special)" htmlFor="prismNote">
            <input
              id="prismNote"
              name="prismNote"
              defaultValue={prismNote ?? ""}
              placeholder="stalled, special, …"
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Dates</h3>
        <p className="text-[12px] text-ink-3">
          Kickoff and current go-live drive the schedule — incomplete phase/task dates rescale when
          this window changes. A slip must push go-live (new date or +days), not just add a note.
          Picking Optimistic / Typical / Pessimistic fills current go-live from the Forecast+
          discovery formula (same as Prism: discovery + 21d config + training), with US federal
          holidays skipped when that toggle is on. Past-site averages are shown as reference only.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Kickoff" htmlFor="kickoffDate">
            <input
              id="kickoffDate"
              name="kickoffDate"
              type="date"
              value={kickoff}
              onChange={(e) => setKickoff(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field
            label="Initial go-live"
            htmlFor="initialGoLiveDate"
            hint={initialLocked ? "Locked after first commit." : "Set once at commitment."}
          >
            <input
              id="initialGoLiveDate"
              name="initialGoLiveDate"
              type="date"
              defaultValue={toDateInput(initialGoLiveDate)}
              disabled={initialLocked}
              className={inputClass}
            />
            {initialLocked ? (
              <input type="hidden" name="initialGoLiveDate" value={toDateInput(initialGoLiveDate)} />
            ) : null}
          </Field>
          <Field
            label="Current go-live"
            htmlFor="targetGoLiveDate"
            hint="Change this date, or use slip days below, to push the schedule."
          >
            <input
              id="targetGoLiveDate"
              name="targetGoLiveDate"
              type="date"
              value={targetGoLive}
              onChange={(e) => setTargetGoLive(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="rounded-lg border border-border bg-surface-2/60 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">
              Forecast+ recommendation
            </span>
            <GoLiveSourceBadge recommendation={recommendation} />
          </div>
          <GoLiveScenarioPicker
            recommendation={recommendation}
            scenario={scenario}
            onChange={applyScenario}
            skipUsFederalHolidays={skipUsFederalHolidays}
            onSkipUsFederalHolidaysChange={setSkipUsFederalHolidays}
          />
          {initialLocked ? (
            <p className="mt-3 text-[12px] text-ink-3">
              Initial go-live is locked. Applying a scenario fills <em>current</em> go-live; save as a
              slip if that date moves.
            </p>
          ) : null}
          {chosen ? (
            <p className="mt-2 text-[12px] tabular-nums text-ink-2">
              {chosen.estimatedHours.toFixed(1)}h
              {chosen.weeklyHours > 0 ? ` · ${chosen.weeklyHours.toFixed(1)}h/wk` : ""} if this window
              is used.
            </p>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Slip days (+N)"
            htmlFor="slipDays"
            hint="Pushes current go-live by N days (e.g. 7). Required with cause/note unless the date above already moved."
          >
            <input
              id="slipDays"
              name="slipDays"
              type="number"
              step={1}
              placeholder="e.g. 7"
              className={inputClass}
            />
          </Field>
          <Field label="Slip cause" htmlFor="slipCause">
            <select id="slipCause" name="slipCause" defaultValue="" className={inputClass}>
              <option value="">— Untagged —</option>
              <option value="CUSTOMER">Customer</option>
              <option value="PIMSY">PIMSY</option>
            </select>
          </Field>
          <Field label="Slip note" htmlFor="slipNote">
            <input id="slipNote" name="slipNote" className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Scope</h3>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Users" htmlFor="userCount">
            <input
              id="userCount"
              name="userCount"
              type="number"
              min={1}
              value={scopeState.userCount}
              onChange={(e) =>
                setScopeState((s) => ({ ...s, userCount: Number(e.target.value) || 1 }))
              }
              className={inputClass}
            />
          </Field>
          <Field label="Locations" htmlFor="locationCount">
            <input
              id="locationCount"
              name="locationCount"
              type="number"
              min={1}
              value={scopeState.locationCount}
              onChange={(e) =>
                setScopeState((s) => ({ ...s, locationCount: Number(e.target.value) || 1 }))
              }
              className={inputClass}
            />
          </Field>
          <Field label="Form pages" htmlFor="formPageCount">
            <input
              id="formPageCount"
              name="formPageCount"
              type="number"
              min={0}
              value={scopeState.formPageCount}
              onChange={(e) =>
                setScopeState((s) => ({ ...s, formPageCount: Number(e.target.value) || 0 }))
              }
              className={inputClass}
            />
          </Field>
          <Field label="Trainings / wk" htmlFor="trainingsPerWeek">
            <input
              id="trainingsPerWeek"
              name="trainingsPerWeek"
              type="number"
              min={0}
              value={scopeState.trainingsPerWeek}
              onChange={(e) =>
                setScopeState((s) => ({ ...s, trainingsPerWeek: Number(e.target.value) || 0 }))
              }
              className={inputClass}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
            <input
              type="checkbox"
              name="stateCompliance"
              checked={scopeState.stateCompliance}
              onChange={(e) => setScopeState((s) => ({ ...s, stateCompliance: e.target.checked }))}
              className="size-4 rounded border-border-strong"
            />
            State compliance (+2h)
          </label>
          <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
            <input
              type="checkbox"
              name="minimalOrgStructure"
              checked={scopeState.minimalOrgStructure}
              onChange={(e) =>
                setScopeState((s) => ({ ...s, minimalOrgStructure: e.target.checked }))
              }
              className="size-4 rounded border-border-strong"
            />
            Minimal org structure (+10h)
          </label>
        </div>
        <div>
          <div className="mb-2 text-[12.5px] font-medium text-ink-2">Service lines</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(SERVICE_LINE_LABELS).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-[12.5px] text-ink-2">
                <input
                  type="checkbox"
                  name="serviceLines"
                  value={key}
                  checked={scopeState.serviceLines.includes(key)}
                  onChange={() => toggleServiceLine(key)}
                  className="size-4 rounded border-border-strong"
                />
                {label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-ink-3">
            Current complexity: {recommendation.complexityTier}
            {chosen ? ` · est. ${chosen.estimatedHours.toFixed(1)}h` : ""}
          </p>
        </div>
      </section>

      {slips.length > 0 ? (
        <section>
          <SlipHistoryList slips={slips} />
        </section>
      ) : null}

      <AnalyticsExcludeToggle defaultChecked={excludeFromAnalytics} />

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <SubmitButton pendingLabel="Saving…">Save engagement</SubmitButton>
      </div>
    </form>
  );
}
