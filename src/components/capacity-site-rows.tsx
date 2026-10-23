"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";

import { recordCapacityPhase } from "@/actions/capacity-board";
import { recordProjectSlip } from "@/actions/projects";
import { FormError, FormSuccess, SubmitButton } from "@/components/submit-button";
import { SlipHistoryList } from "@/components/slip-history";
import { Badge, inputClass } from "@/components/ui";
import {
  CAPACITY_PHASE_LABELS,
  CAPACITY_PHASES,
  capacityGoLiveLabel,
  capacityNoteBadge,
  type CapacityPhase,
  type CapacitySiteRow,
} from "@/lib/capacity-phase";
import { cn } from "@/lib/cn";
import { fmtDate, toDateInput } from "@/lib/dates";
import { previewSlipGoLiveFromInputs } from "@/lib/go-live-weekday";

function hoursLabel(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

export function CapacityMemberBody({
  memberId,
  hoursPerWeek,
  sites,
  showSites,
}: {
  memberId: string;
  hoursPerWeek: number;
  sites: CapacitySiteRow[];
  /** Site list stays hidden for an exempt non-lead with nothing assigned. Hours still show. */
  showSites: boolean;
}) {
  return (
    <div className="border-t border-border">
      <MemberControls memberId={memberId} hoursPerWeek={hoursPerWeek} />
      {showSites ? (
        sites.length === 0 ? (
          <p className="px-3 py-2.5 text-[12px] text-ink-3">No sites assigned</p>
        ) : (
          <ul>
            {sites.map((site) => (
              <CapacitySiteRow key={site.id} site={site} />
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

export function CapacityUnassignedSites({ sites }: { sites: CapacitySiteRow[] }) {
  if (sites.length === 0) return null;
  return (
    <section className="mt-3 rounded-xl border border-border bg-surface">
      <h3 className="px-3 pt-3 text-[13px] font-semibold text-ink">Unassigned</h3>
      <p className="px-3 pb-1 text-[12px] text-ink-3">No specialist on the site.</p>
      <ul className="border-t border-border">
        {sites.map((site) => (
          <CapacitySiteRow key={site.id} site={site} />
        ))}
      </ul>
    </section>
  );
}

function MemberControls({
  memberId,
  hoursPerWeek,
}: {
  memberId: string;
  hoursPerWeek: number;
}) {
  return (
    <div className="px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`cap-${memberId}`} className="text-[12px] text-ink-2">
          Impl hrs/wk
        </label>
        <input
          id={`cap-${memberId}`}
          type="text"
          inputMode="numeric"
          readOnly
          aria-readonly="true"
          value={hoursPerWeek}
          title="Edit hours on Settings"
          className={cn(
            inputClass,
            "h-7 w-16 cursor-default bg-surface-2 px-2 text-center text-[12.5px] focus:ring-0",
          )}
        />
      </div>
    </div>
  );
}

function CapacitySiteRow({ site }: { site: CapacitySiteRow }) {
  const [open, setOpen] = useState(false);
  const badge = capacityNoteBadge({ prismStatus: site.prismStatus, prismNote: site.prismNote });
  const [phase, setPhase] = useState<CapacityPhase | null>(site.currentPhase);
  const [phaseError, setPhaseError] = useState<string | undefined>();
  const [phasePending, startPhase] = useTransition();

  useEffect(() => {
    setPhase(site.currentPhase);
  }, [site.currentPhase]);

  const recorded = phase != null;
  const shown = phase ?? site.modelPhase ?? "";

  return (
    <li className="border-t border-border px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Link
          href={`/projects/${site.id}`}
          title={site.name}
          className={cn(
            "min-w-0 truncate text-[13px] text-ink hover:text-brand",
            site.isSecondary ? "font-medium text-ink-2" : "font-semibold",
          )}
        >
          {site.acronym}
        </Link>
        <span className="shrink-0 text-[11px] text-ink-3">{capacityGoLiveLabel(site.targetGoLive)}</span>
        {badge ? (
          <Badge tone={badge.tone} className="px-1.5 py-0 text-[10.5px]">
            {badge.label}
          </Badge>
        ) : null}
        {site.slipDays > 0 ? (
          <span
            className="shrink-0 text-[11px] font-medium text-red"
            title={`${site.slipDays} days past initial go-live`}
          >
            +{site.slipDays}d slip
          </span>
        ) : null}
        {site.splitPercent < 100 ? (
          <span className="shrink-0 text-[10px] text-ink-3">{site.splitPercent}%</span>
        ) : null}
        <button
          type="button"
          className="ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : "Edit"}
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <select
          aria-label={`Phase for ${site.acronym}`}
          title={
            recorded
              ? `Recorded${site.phaseRecordedAt ? ` ${fmtDate(site.phaseRecordedAt)}` : ""}`
              : site.modelPhase
                ? "Model estimate — not yet recorded"
                : "Record the current phase"
          }
          disabled={phasePending}
          value={shown}
          onChange={(e) => {
            const value = e.target.value;
            if (!isPhase(value)) return;
            setPhase(value);
            setPhaseError(undefined);
            startPhase(async () => {
              const res = await recordCapacityPhase(site.id, value);
              if (res.error) {
                setPhase(site.currentPhase);
                setPhaseError(res.error);
              }
            });
          }}
          className={cn(
            inputClass,
            "h-7 w-[7.75rem] px-1.5 py-0 text-[12px]",
            !recorded && "italic text-ink-3",
          )}
        >
          {shown === "" ? <option value="">Phase</option> : null}
          {CAPACITY_PHASES.map((p) => (
            <option key={p} value={p}>
              {CAPACITY_PHASE_LABELS[p]}
            </option>
          ))}
        </select>
        <span className="ml-auto shrink-0 tabular-nums text-[11.5px] text-ink-2">
          {hoursLabel(site.weeklyHours)}h/wk
        </span>
      </div>
      <FormError error={phaseError} />
      {open ? <SiteSlipPanel site={site} /> : null}
    </li>
  );
}

function isPhase(value: string): value is CapacityPhase {
  return (CAPACITY_PHASES as readonly string[]).includes(value);
}

function SiteSlipPanel({ site }: { site: CapacitySiteRow }) {
  const [state, action] = useActionState(recordProjectSlip, {});
  const [days, setDays] = useState("");
  const [step, setStep] = useState<"edit" | "approve" | "cause">("edit");
  const [approve, setApprove] = useState<"" | "yes" | "no">("");
  const [localError, setLocalError] = useState<string | undefined>();
  const current = toDateInput(site.targetGoLive);
  const preview = days.trim()
    ? previewSlipGoLiveFromInputs({ currentGoLive: current, slipDaysRaw: days })
    : null;

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-surface-2 px-2.5 py-2">
      <form
        action={action}
        className="space-y-2"
        onSubmit={(event) => {
          if (approve !== "yes" && approve !== "no") event.preventDefault();
        }}
      >
        <input type="hidden" name="projectId" value={site.id} />
        <input type="hidden" name="slipSource" value="capacity" />
        <input type="hidden" name="targetGoLiveDate" value={current} />
        <input type="hidden" name="slipDays" value={days} />
        <input type="hidden" name="approveGoLive" value={approve} />

        <FormError error={localError ?? state.error} />
        <FormSuccess message={state.ok ? state.message : undefined} />

        {!current ? (
          <p className="text-[12px] text-ink-3">Set a go-live before recording a slip.</p>
        ) : (
          <label className="flex items-center gap-2 text-[12px] text-ink-2">
            Slip days
            <input
              type="number"
              step={1}
              value={days}
              placeholder="+7"
              onChange={(e) => {
                setDays(e.target.value);
                setStep("edit");
                setApprove("");
                setLocalError(undefined);
              }}
              className={cn(inputClass, "h-7 w-20 px-2 text-[12.5px]")}
            />
          </label>
        )}

        {current && step === "edit" ? (
          <button
            type="button"
            className="h-7 rounded-lg bg-[#113c64] px-2.5 text-[12.5px] font-medium text-white hover:bg-[#0d2f4f]"
            onClick={() => {
              const result = previewSlipGoLiveFromInputs({
                currentGoLive: current,
                slipDaysRaw: days,
              });
              if (!result.ok) {
                setLocalError(result.error);
                return;
              }
              setLocalError(undefined);
              setStep("approve");
            }}
          >
            Review slip
          </button>
        ) : null}

        {step === "approve" ? (
          <ApprovalStep
            current={current}
            days={days}
            onChoose={(choice) => {
              setApprove(choice);
              setStep("cause");
            }}
          />
        ) : null}

        {step === "cause" && (approve === "yes" || approve === "no") ? (
          <div className="space-y-2">
            <p className="text-[12px] text-ink-2">
              {approve === "yes"
                ? "Go-live will move. Tag the cause."
                : "Go-live stays. The slip is still recorded."}{" "}
              {preview && preview.ok && preview.snapNote ? preview.snapNote : ""}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-[12px] text-ink-2">
                Cause
                <select name="slipCause" defaultValue="" className={cn(inputClass, "mt-1 h-8 text-[12.5px]")}>
                  <option value="">Untagged</option>
                  <option value="CUSTOMER">Customer</option>
                  <option value="PIMSY">PIMSY</option>
                </select>
              </label>
              <label className="text-[12px] text-ink-2">
                Note
                <input name="slipNote" className={cn(inputClass, "mt-1 h-8 text-[12.5px]")} />
              </label>
            </div>
            <SubmitButton size="sm" pendingLabel="Recording…">
              Record slip
            </SubmitButton>
          </div>
        ) : null}
      </form>

      <div className="max-h-52 overflow-auto">
        <SlipHistoryList slips={site.slips} allowDelete={false} />
        {site.slips.length === 0 ? (
          <p className="text-[12px] text-ink-3">No slips yet.</p>
        ) : (
          <p className="mt-1 text-[11.5px] text-ink-3">
            {site.slips.length} slip{site.slips.length === 1 ? "" : "s"} on this site.
          </p>
        )}
      </div>
    </div>
  );
}

function ApprovalStep({
  current,
  days,
  onChoose,
}: {
  current: string;
  days: string;
  onChoose: (choice: "yes" | "no") => void;
}) {
  const preview = previewSlipGoLiveFromInputs({ currentGoLive: current, slipDaysRaw: days });
  if (!preview.ok) return null;
  const sign = preview.days > 0 ? "+" : "";
  return (
    <div className="space-y-2 rounded-md border border-border bg-surface px-2.5 py-2">
      <p className="text-[12.5px] text-ink">
        Update go-live to {fmtDate(preview.next)} ({sign}
        {preview.days}d)?
      </p>
      {preview.snapNote ? <p className="text-[12px] text-amber">{preview.snapNote}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="h-7 rounded-lg bg-[#113c64] px-2.5 text-[12.5px] font-medium text-white"
          onClick={() => onChoose("yes")}
        >
          Update go-live
        </button>
        <button
          type="button"
          className="h-7 rounded-lg border border-border-strong bg-surface px-2.5 text-[12.5px] font-medium text-ink"
          onClick={() => onChoose("no")}
        >
          Keep current date
        </button>
      </div>
    </div>
  );
}
