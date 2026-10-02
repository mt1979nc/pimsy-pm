"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { recordProjectSlip } from "@/actions/projects";
import { FormError, FormSuccess, SubmitButton } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/dates";
import { previewSlipGoLiveFromInputs } from "@/lib/go-live-weekday";

export function RecordSlipForm({
  projectId,
  currentGoLive,
  source = "settings",
  variant = "settings",
}: {
  projectId: string;
  currentGoLive: string;
  source?: "settings" | "weekly" | "management" | "capacity";
  variant?: "settings" | "compact";
}) {
  const [state, action] = useActionState(recordProjectSlip, {});
  const [goLive, setGoLive] = useState(currentGoLive);
  const [localError, setLocalError] = useState<string | undefined>();
  const [previewNote, setPreviewNote] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const approveRef = useRef<HTMLInputElement>(null);
  const choiceRef = useRef<"" | "yes" | "no">("");

  useEffect(() => {
    setGoLive(currentGoLive);
  }, [currentGoLive]);

  useEffect(() => {
    if (state.targetGoLiveDate) setGoLive(state.targetGoLiveDate);
  }, [state.targetGoLiveDate]);

  const compact = variant === "compact";

  function review(form: HTMLFormElement) {
    const data = new FormData(form);
    const result = previewSlipGoLiveFromInputs({
      currentGoLive: goLive,
      slipDaysRaw: data.get("slipDays")?.toString(),
      requestedGoLive: compact ? undefined : data.get("targetGoLiveDate")?.toString(),
    });
    if (!result.ok) {
      setLocalError(result.error);
      setPreviewNote(null);
      return;
    }
    setLocalError(undefined);
    const sign = result.days > 0 ? "+" : "";
    const snap = result.snapNote ? ` ${result.snapNote}` : "";
    setPreviewNote(
      `Update go-live to ${fmtDate(result.next)} (${sign}${result.days}d)?${snap}`,
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      className={cn(compact ? "space-y-2" : "space-y-3")}
      onSubmit={(event) => {
        if (choiceRef.current === "yes" || choiceRef.current === "no") return;
        event.preventDefault();
        review(event.currentTarget);
      }}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="slipSource" value={source} />
      <input ref={approveRef} type="hidden" name="approveGoLive" defaultValue="" />
      {compact ? <input type="hidden" name="targetGoLiveDate" value={goLive} /> : null}

      <FormError error={localError ?? state.error} />
      <FormSuccess message={state.ok ? (state.message ?? "Slip recorded.") : undefined} />

      {compact ? null : (
        <p className="text-[12.5px] leading-relaxed text-ink-2">
          A slip needs a new date or +N days. You confirm the go-live change before it is saved.
          Weekends move to Monday. +N days lands on Monday.
        </p>
      )}

      <div className={cn("grid gap-2", compact ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
        {compact ? null : (
          <Field
            label="New target go-live"
            htmlFor={`slip-go-live-${projectId}`}
            hint="Weekdays only. Monday is preferred for +N days."
          >
            <input
              id={`slip-go-live-${projectId}`}
              name="targetGoLiveDate"
              type="date"
              value={goLive}
              onChange={(e) => {
                setGoLive(e.target.value);
                choiceRef.current = "";
                if (approveRef.current) approveRef.current.value = "";
                setPreviewNote(null);
              }}
              className={inputClass}
            />
          </Field>
        )}
        <Field
          label="Slip days (+N)"
          htmlFor={`slip-days-${projectId}`}
          hint={compact ? "Suggests the next Monday." : "Optional if the date already moved."}
        >
          <input
            id={`slip-days-${projectId}`}
            name="slipDays"
            type="number"
            step={1}
            placeholder="e.g. 7"
            className={inputClass}
            onChange={() => {
              choiceRef.current = "";
              if (approveRef.current) approveRef.current.value = "";
              setPreviewNote(null);
            }}
          />
        </Field>
        <Field label="Cause" htmlFor={`slip-cause-${projectId}`}>
          <select
            id={`slip-cause-${projectId}`}
            name="slipCause"
            defaultValue=""
            className={inputClass}
          >
            <option value="">Untagged</option>
            <option value="CUSTOMER">Customer</option>
            <option value="PIMSY">PIMSY</option>
          </select>
        </Field>
        <Field label={compact ? "Note" : "Note (optional)"} htmlFor={`slip-note-${projectId}`}>
          <input id={`slip-note-${projectId}`} name="slipNote" className={inputClass} />
        </Field>
      </div>

      {previewNote ? (
        <div className="space-y-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
          <p className="text-[12.5px] text-ink">{previewNote}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="h-8 rounded-lg bg-[#113c64] px-2.5 text-[13px] font-medium text-white"
              onClick={() => {
                choiceRef.current = "yes";
                if (approveRef.current) approveRef.current.value = "yes";
                formRef.current?.requestSubmit();
              }}
            >
              Update go-live
            </button>
            <button
              type="button"
              className="h-8 rounded-lg border border-border-strong bg-surface px-2.5 text-[13px] font-medium text-ink"
              onClick={() => {
                choiceRef.current = "no";
                if (approveRef.current) approveRef.current.value = "no";
                formRef.current?.requestSubmit();
              }}
            >
              Keep current date
            </button>
          </div>
        </div>
      ) : (
        <div className={cn("flex", compact ? "items-end" : "justify-end")}>
          <SubmitButton size={compact ? "sm" : "md"} pendingLabel="Recording…">
            Record slip
          </SubmitButton>
        </div>
      )}
    </form>
  );
}
