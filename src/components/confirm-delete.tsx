"use client";

import { useActionState } from "react";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";
import type { ActionState } from "@/actions/messages";

export function ConfirmDeleteForm({
  action,
  hiddenFields,
  confirmLabel,
  confirmHint,
  submitLabel,
  warning,
  cascade,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  hiddenFields: Record<string, string>;
  confirmLabel: string;
  confirmHint: string;
  submitLabel: string;
  warning: string;
  cascade?: { name: string; label: string };
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-3">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <p className="text-[12.5px] leading-relaxed text-red">{warning}</p>
      <Field label={confirmLabel} htmlFor="confirmation" hint={confirmHint}>
        <input
          id="confirmation"
          name="confirmation"
          autoComplete="off"
          className={inputClass}
          required
        />
      </Field>
      {cascade ? (
        <label className="flex items-start gap-2.5 text-[13px] text-ink-2">
          <input type="checkbox" name={cascade.name} className="mt-0.5" />
          <span>{cascade.label}</span>
        </label>
      ) : null}
      <FormError error={state.error} />
      <SubmitButton variant="danger" size="sm" pendingLabel="Deleting…">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
