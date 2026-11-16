"use client";

import { useActionState } from "react";

import { updateCapacityHandoff } from "@/actions/capacity-handoff";
import { FormError, FormSuccess, SubmitButton } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";

export function HandoffDateForm({
  projectId,
  capacityHandoffOn,
}: {
  projectId: string;
  /** YYYY-MM-DD, or empty when the site still counts on capacity. */
  capacityHandoffOn: string;
}) {
  const [state, action] = useActionState(updateCapacityHandoff, {});

  return (
    <form action={action} className="flex flex-wrap items-end gap-3 px-4 py-3">
      <input type="hidden" name="projectId" value={projectId} />
      <Field label="Handoff date" htmlFor={`handoff-${projectId}`} hint="Removes from capacity">
        <input
          key={capacityHandoffOn || "none"}
          id={`handoff-${projectId}`}
          name="capacityHandoffOn"
          type="date"
          defaultValue={capacityHandoffOn}
          className={inputClass}
        />
      </Field>
      <SubmitButton pendingLabel="Saving…">Save handoff</SubmitButton>
      <FormError error={state.error} />
      <FormSuccess message={state.ok ? (state.message ?? "Saved.") : undefined} />
    </form>
  );
}
