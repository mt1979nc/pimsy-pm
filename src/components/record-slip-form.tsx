"use client";

import { useActionState, useEffect, useState } from "react";
import { recordProjectSlip } from "@/actions/projects";
import { FormError, FormSuccess, SubmitButton } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";
import { cn } from "@/lib/cn";

export function RecordSlipForm({
  projectId,
  currentGoLive,
  source = "settings",
  variant = "settings",
}: {
  projectId: string;
  currentGoLive: string;
  source?: "settings" | "weekly" | "management";
  variant?: "settings" | "compact";
}) {
  const [state, action] = useActionState(recordProjectSlip, {});
  const [goLive, setGoLive] = useState(currentGoLive);

  useEffect(() => {
    setGoLive(currentGoLive);
  }, [currentGoLive]);

  useEffect(() => {
    if (state.targetGoLiveDate) setGoLive(state.targetGoLiveDate);
  }, [state.targetGoLiveDate]);

  const compact = variant === "compact";

  return (
    <form action={action} className={cn(compact ? "space-y-2" : "space-y-3")}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="slipSource" value={source} />
      {compact ? <input type="hidden" name="targetGoLiveDate" value={goLive} /> : null}

      <FormError error={state.error} />
      <FormSuccess message={state.ok ? (state.message ?? "Slip recorded.") : undefined} />

      {compact ? null : (
        <p className="text-[12.5px] leading-relaxed text-ink-2">
          Recording a slip pushes go-live and rescales open phase/task dates. Move the date,
          or enter slip days (+N). Cause/note alone is not enough.
        </p>
      )}

      <div className={cn("grid gap-2", compact ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
        {compact ? null : (
          <Field
            label="New target go-live"
            htmlFor={`slip-go-live-${projectId}`}
            hint="Optional if you enter slip days."
          >
            <input
              id={`slip-go-live-${projectId}`}
              name="targetGoLiveDate"
              type="date"
              value={goLive}
              onChange={(e) => setGoLive(e.target.value)}
              className={inputClass}
            />
          </Field>
        )}
        <Field
          label="Slip days (+N)"
          htmlFor={`slip-days-${projectId}`}
          hint={compact ? undefined : "Optional if the date already moved."}
        >
          <input
            id={`slip-days-${projectId}`}
            name="slipDays"
            type="number"
            step={1}
            placeholder="e.g. 7"
            className={inputClass}
          />
        </Field>
        <Field label="Cause" htmlFor={`slip-cause-${projectId}`}>
          <select
            id={`slip-cause-${projectId}`}
            name="slipCause"
            defaultValue=""
            className={inputClass}
          >
            <option value="">— Untagged —</option>
            <option value="CUSTOMER">Customer</option>
            <option value="PIMSY">PIMSY</option>
          </select>
        </Field>
        <Field label={compact ? "Note" : "Note (optional)"} htmlFor={`slip-note-${projectId}`}>
          <input id={`slip-note-${projectId}`} name="slipNote" className={inputClass} />
        </Field>
        {compact ? (
          <div className="flex items-end">
            <SubmitButton size="sm" pendingLabel="Recording…">
              Record slip
            </SubmitButton>
          </div>
        ) : null}
      </div>

      {compact ? null : (
        <div className="flex justify-end">
          <SubmitButton pendingLabel="Recording…">Record slip</SubmitButton>
        </div>
      )}
    </form>
  );
}
