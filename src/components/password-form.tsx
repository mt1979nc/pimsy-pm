"use client";

import { useActionState } from "react";
import { changeOwnPassword } from "@/actions/auth";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action] = useActionState(changeOwnPassword, {});

  return (
    <form action={action} className="space-y-4 p-5">
      <FormError error={state.error} />
      {state.ok ? (
        <p className="rounded-lg bg-green-soft px-3 py-2 text-[12.5px] text-green">
          {hasPassword ? "Password changed." : "Password set."}
        </p>
      ) : null}

      {!hasPassword ? (
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          You don&apos;t have a password yet — you sign in with an emailed link. Set one
          here if you&apos;d rather log in that way instead.
        </p>
      ) : null}

      {hasPassword ? (
        <Field label="Current password" htmlFor="currentPassword">
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className={inputClass}
          />
        </Field>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={hasPassword ? "New password" : "Password"} htmlFor="newPassword">
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>
        <Field label="Confirm" htmlFor="confirmPassword">
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>
      </div>

      <p className="text-[12px] leading-relaxed text-ink-3">At least 8 characters.</p>

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">
          {hasPassword ? "Change password" : "Set password"}
        </SubmitButton>
      </div>
    </form>
  );
}
