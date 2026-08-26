"use client";

import { useActionState } from "react";
import { updateOrgAlertDefaults } from "@/actions/notifications";
import { SubmitButton, FormError } from "@/components/submit-button";

export function EmailKillSwitch({ enabled }: { enabled: boolean }) {
  const [state, action] = useActionState(updateOrgAlertDefaults, {});

  return (
    <form action={action} className="p-5">
      <input type="hidden" name="scope" value="email" />
      <FormError error={state.error} />

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="emailEnabled"
          defaultChecked={enabled}
          className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]"
        />
        <span>
          <span className="block text-[13.5px] font-medium text-ink">
            Send email notifications
          </span>
          <span className="block text-[12.5px] leading-snug text-ink-3">
            Turn this off and the system sends no email at all — to staff or customers.
            Everything still appears in the app. Useful while you&apos;re trialling the system
            with real projects and don&apos;t want customers emailed yet.
          </span>
        </span>
      </label>

      <div className="mt-4 flex items-center justify-between gap-3">
        {state.ok ? (
          <span className="text-[12.5px] text-green">Saved.</span>
        ) : (
          <span className="text-[12.5px] text-ink-3">
            {enabled ? "Email is on." : "Email is off — nothing is being sent."}
          </span>
        )}
        <SubmitButton size="sm" pendingLabel="Saving…">
          Save
        </SubmitButton>
      </div>
    </form>
  );
}
