"use client";

import { useActionState } from "react";
import { bookTrainingSession } from "@/actions/tasks";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";
import { scheduledSessionLabel } from "@/lib/training-session";
import { toLocalDateInput, toLocalTimeInput } from "@/lib/dates";

export function TrainingSessionBook({
  taskId,
  sessionAt,
  compact = false,
}: {
  taskId: string;
  sessionAt: Date | string | null;
  compact?: boolean;
}) {
  const [state, action] = useActionState(bookTrainingSession, {});
  const booked = scheduledSessionLabel(sessionAt);

  return (
    <form action={action} className={compact ? "space-y-2" : "space-y-3"}>
      <input type="hidden" name="taskId" value={taskId} />
      {booked ? (
        <p className="text-[13px] font-medium text-ink">{booked}</p>
      ) : (
        <p className="text-[12.5px] text-ink-3">
          Record the Outlook/calendar slot. PATH copies it onto this training task.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Session date" htmlFor={`sessionDate-${taskId}`}>
          <input
            id={`sessionDate-${taskId}`}
            name="sessionDate"
            type="date"
            required
            defaultValue={toLocalDateInput(sessionAt)}
            className={inputClass}
          />
        </Field>
        <Field label="Time (optional)" htmlFor={`sessionTime-${taskId}`}>
          <input
            id={`sessionTime-${taskId}`}
            name="sessionTime"
            type="time"
            defaultValue={toLocalTimeInput(sessionAt)}
            className={inputClass}
          />
        </Field>
        <SubmitButton size="sm" pendingLabel="Saving…">
          {booked ? "Update session time" : "Save session time"}
        </SubmitButton>
      </div>
      <FormError error={state.error} />
      {state.ok ? (
        <p className="text-[12.5px] text-green">Session time saved on the training task.</p>
      ) : null}
    </form>
  );
}
