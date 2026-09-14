"use client";

import { useActionState, useMemo, useState } from "react";
import { createEngagement } from "@/actions/management-engagements";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Field, inputClass, Badge } from "@/components/ui";
import { GoLiveScenarioPicker, GoLiveSourceBadge } from "@/components/go-live-scenario-picker";
import {
  DEFAULT_SCOPE,
  SERVICE_LINE_LABELS,
  type ImplementationScope,
} from "@/lib/estimator";
import {
  kickoffOrToday,
  recommendGoLive,
  type DurationSample,
} from "@/lib/go-live-recommendation";
import { PRISM_STATUSES, PRISM_STATUS_LABELS, type PrismStatus } from "@/lib/prism-status";
import { toDateInput } from "@/lib/dates";
import type { DiscoveryScenario } from "@/db/schema";

type LeadOption = {
  id: string;
  name: string | null;
  email: string;
  canLead: boolean;
  isDirector: boolean;
};

const SERVICE_LINE_KEYS = Object.keys(SERVICE_LINE_LABELS);

const tierTone: Record<string, "green" | "amber" | "red" | "violet"> = {
  STANDARD: "green",
  MODERATE: "amber",
  HIGH: "red",
  ENTERPRISE: "violet",
};

export function EngagementCreateForm({
  leadOptions,
  defaultLeadId,
  durationSamples,
  exclusions,
}: {
  leadOptions: LeadOption[];
  defaultLeadId: string;
  durationSamples: DurationSample[];
  exclusions: string[];
}) {
  const [state, action] = useActionState(createEngagement, {});
  const [scope, setScope] = useState<ImplementationScope>(DEFAULT_SCOPE);
  const [kickoff, setKickoff] = useState("");
  const [status, setStatus] = useState<PrismStatus>("pipeline");
  const [scenario, setScenario] = useState<DiscoveryScenario>("TYPICAL");
  const [customHpw, setCustomHpw] = useState("");
  const [goLiveOverride, setGoLiveOverride] = useState<string | null>(null);

  const customHoursPerWeek = customHpw.trim() === "" ? null : Number.parseFloat(customHpw);

  const recommendation = useMemo(() => {
    const start = kickoffOrToday(kickoff ? new Date(`${kickoff}T12:00:00.000Z`) : null);
    return recommendGoLive({
      scope,
      kickoffDate: start,
      samples: durationSamples,
      exclusions,
      customHoursPerWeek: Number.isFinite(customHoursPerWeek) ? customHoursPerWeek : null,
    });
  }, [scope, kickoff, durationSamples, exclusions, customHoursPerWeek]);

  const chosen =
    recommendation.scenarios.find((s) => s.scenario === scenario) ?? recommendation.scenarios[1];
  const recommendedGoLive = chosen ? toDateInput(chosen.goLiveDate) : "";
  const goLiveValue = goLiveOverride ?? recommendedGoLive;

  function selectScenario(next: DiscoveryScenario) {
    setScenario(next);
    setGoLiveOverride(null);
  }

  function toggleServiceLine(key: string) {
    setScope((s) => ({
      ...s,
      serviceLines: s.serviceLines.includes(key)
        ? s.serviceLines.filter((l) => l !== key)
        : [...s.serviceLines, key],
    }));
  }

  return (
    <form action={action} className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6 p-5">
        <FormError error={state.error} />
        <section className="space-y-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Roster</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Acronym" htmlFor="acronym" hint="Unique. Becomes the project code.">
              <input
                id="acronym"
                name="acronym"
                required
                autoFocus
                placeholder="CEDAR"
                className={`${inputClass} uppercase`}
              />
            </Field>
            <Field label="Customer" htmlFor="accountName">
              <input id="accountName" name="accountName" required placeholder="CEDAR Health" className={inputClass} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Primary owner" htmlFor="leadId">
              <select id="leadId" name="leadId" defaultValue={defaultLeadId} className={inputClass}>
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
              <select id="coLeadId" name="coLeadId" defaultValue="" className={inputClass}>
                <option value="">— None —</option>
                {leadOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? u.email}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Owner split %" htmlFor="ownerSplitPercent">
              <input
                id="ownerSplitPercent"
                name="ownerSplitPercent"
                type="number"
                min={1}
                max={100}
                defaultValue={100}
                className={inputClass}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Status" htmlFor="prismStatus">
              <select
                id="prismStatus"
                name="prismStatus"
                value={status}
                onChange={(e) => setStatus(e.target.value as PrismStatus)}
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
              label="Kickoff"
              htmlFor="kickoffDate"
              hint="Go-live projection anchors here. Blank uses today."
            >
              <input
                id="kickoffDate"
                name="kickoffDate"
                type="date"
                value={kickoff}
                onChange={(e) => {
                  setKickoff(e.target.value);
                  setGoLiveOverride(null);
                }}
                className={inputClass}
              />
            </Field>
            <Field
              label="Current go-live"
              htmlFor="targetGoLiveDate"
              hint="Filled from the selected scenario. Override if you already committed a date."
            >
              <input
                id="targetGoLiveDate"
                name="targetGoLiveDate"
                type="date"
                value={goLiveValue}
                onChange={(e) => setGoLiveOverride(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Custom hrs/wk" htmlFor="customHoursPerWeek" hint="Blank = spread estimate across the window.">
              <input
                id="customHoursPerWeek"
                name="customHoursPerWeek"
                type="number"
                min={0}
                max={80}
                step="0.5"
                value={customHpw}
                onChange={(e) => setCustomHpw(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Note" htmlFor="prismNote">
              <input id="prismNote" name="prismNote" placeholder="stalled / special" className={inputClass} />
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Forecast+ scope</h3>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Users" htmlFor="userCount">
              <input
                id="userCount"
                name="userCount"
                type="number"
                min={1}
                value={scope.userCount}
                onChange={(e) => setScope((s) => ({ ...s, userCount: Number(e.target.value) || 1 }))}
                className={inputClass}
              />
            </Field>
            <Field label="Locations" htmlFor="locationCount">
              <input
                id="locationCount"
                name="locationCount"
                type="number"
                min={1}
                value={scope.locationCount}
                onChange={(e) => setScope((s) => ({ ...s, locationCount: Number(e.target.value) || 1 }))}
                className={inputClass}
              />
            </Field>
            <Field label="Form pages" htmlFor="formPageCount">
              <input
                id="formPageCount"
                name="formPageCount"
                type="number"
                min={0}
                value={scope.formPageCount}
                onChange={(e) => setScope((s) => ({ ...s, formPageCount: Number(e.target.value) || 0 }))}
                className={inputClass}
              />
            </Field>
            <Field label="Trainings / wk" htmlFor="trainingsPerWeek">
              <input
                id="trainingsPerWeek"
                name="trainingsPerWeek"
                type="number"
                min={0}
                value={scope.trainingsPerWeek}
                onChange={(e) => setScope((s) => ({ ...s, trainingsPerWeek: Number(e.target.value) || 0 }))}
                className={inputClass}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {SERVICE_LINE_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
                <input
                  type="checkbox"
                  name="serviceLines"
                  value={key}
                  checked={scope.serviceLines.includes(key)}
                  onChange={() => toggleServiceLine(key)}
                />
                {SERVICE_LINE_LABELS[key]}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 text-[12.5px] text-ink-2">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                name="stateCompliance"
                checked={scope.stateCompliance}
                onChange={(e) => setScope((s) => ({ ...s, stateCompliance: e.target.checked }))}
              />
              State compliance
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                name="minimalOrgStructure"
                checked={scope.minimalOrgStructure}
                onChange={(e) => setScope((s) => ({ ...s, minimalOrgStructure: e.target.checked }))}
              />
              Minimal org structure
            </label>
          </div>
        </section>

        <SubmitButton>Add to roster</SubmitButton>
      </div>

      <aside className="border-t border-border p-5 lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Forecast+ snapshot</div>
          <GoLiveSourceBadge recommendation={recommendation} />
        </div>
        <p className="mt-1 text-[12.5px] text-ink-3">
          Same three scenarios as Prism Forecast+. Go-live uses past completed sites when Analysis has
          enough history; hours still use Prism weights. Pipeline stays off department capacity.
        </p>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-ink-3">Complexity</span>
            <Badge tone={tierTone[recommendation.complexityTier] ?? "neutral"}>
              {recommendation.complexityTier}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-ink-3">Est. hours</span>
            <span className="tabular-nums text-ink">{(chosen?.estimatedHours ?? recommendation.hours.totalHours).toFixed(1)}h</span>
          </div>
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-ink-3">Counts toward load</span>
            <span className="text-ink">{status === "pipeline" ? "No" : "Yes"}</span>
          </div>
        </div>
        <div className="mt-5 border-t border-border pt-4">
          <GoLiveScenarioPicker
            recommendation={recommendation}
            scenario={scenario}
            onChange={selectScenario}
          />
        </div>
      </aside>
    </form>
  );
}
