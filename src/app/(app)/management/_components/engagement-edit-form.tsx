"use client";

import { useActionState } from "react";
import { updateEngagement } from "@/actions/management-engagements";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Badge, Field, inputClass } from "@/components/ui";
import { SERVICE_LINE_LABELS } from "@/lib/estimator";
import { PRISM_STATUSES, PRISM_STATUS_LABELS, type PrismStatus } from "@/lib/prism-status";
import { fmtDate } from "@/lib/dates";

function toDateInput(d: Date | string | null | undefined) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

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
  leadOptions,
  slips,
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
  leadOptions: LeadOption[];
  slips: Slip[];
}) {
  const [state, action] = useActionState(updateEngagement, {});
  const selectedLines = new Set(scope?.serviceLines ?? []);
  const initialLocked = !!initialGoLiveDate;

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
            hint="Leave blank to use estimator total."
          >
            <input
              id="customHoursPerWeek"
              name="customHoursPerWeek"
              type="number"
              step="0.1"
              min={0}
              max={80}
              defaultValue={customHoursPerWeek ?? ""}
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
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Kickoff" htmlFor="kickoffDate">
            <input
              id="kickoffDate"
              name="kickoffDate"
              type="date"
              defaultValue={toDateInput(startDate)}
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
          <Field label="Current go-live" htmlFor="targetGoLiveDate">
            <input
              id="targetGoLiveDate"
              name="targetGoLiveDate"
              type="date"
              defaultValue={toDateInput(targetGoLiveDate)}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Slip cause (if go-live moves)" htmlFor="slipCause">
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
              defaultValue={scope?.userCount ?? 1}
              className={inputClass}
            />
          </Field>
          <Field label="Locations" htmlFor="locationCount">
            <input
              id="locationCount"
              name="locationCount"
              type="number"
              min={1}
              defaultValue={scope?.locationCount ?? 1}
              className={inputClass}
            />
          </Field>
          <Field label="Form pages" htmlFor="formPageCount">
            <input
              id="formPageCount"
              name="formPageCount"
              type="number"
              min={0}
              defaultValue={scope?.formPageCount ?? 25}
              className={inputClass}
            />
          </Field>
          <Field label="Trainings / wk" htmlFor="trainingsPerWeek">
            <input
              id="trainingsPerWeek"
              name="trainingsPerWeek"
              type="number"
              min={0}
              defaultValue={scope?.trainingsPerWeek ?? 2}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
            <input
              type="checkbox"
              name="stateCompliance"
              defaultChecked={scope?.stateCompliance ?? false}
              className="size-4 rounded border-border-strong"
            />
            State compliance (+2h)
          </label>
          <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
            <input
              type="checkbox"
              name="minimalOrgStructure"
              defaultChecked={scope?.minimalOrgStructure ?? false}
              className="size-4 rounded border-border-strong"
            />
            Minimal org structure
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
                  defaultChecked={selectedLines.has(key)}
                  className="size-4 rounded border-border-strong"
                />
                {label}
              </label>
            ))}
          </div>
          {scope?.complexityTier ? (
            <p className="mt-2 text-[12px] text-ink-3">
              Current complexity: {scope.complexityTier}
              {scope.estimatedHours != null ? ` · est. ${scope.estimatedHours}h` : ""}
            </p>
          ) : null}
        </div>
      </section>

      {slips.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">
            Slip history
          </h3>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {slips.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[12.5px]">
                <span className="tabular-nums text-ink">
                  {fmtDate(s.fromDate)} → {fmtDate(s.toDate)}
                </span>
                <Badge tone={s.days > 0 ? "amber" : "green"}>
                  {s.days > 0 ? "+" : ""}
                  {s.days}d
                </Badge>
                {s.cause ? <Badge>{s.cause}</Badge> : <Badge tone="neutral">untagged</Badge>}
                {s.note ? <span className="text-ink-3">{s.note}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <SubmitButton pendingLabel="Saving…">Save engagement</SubmitButton>
      </div>
    </form>
  );
}
