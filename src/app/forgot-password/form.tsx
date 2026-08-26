"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/actions/auth";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, {});

  if (state.ok) {
    return (
      <div className="text-center">
        <p className="text-[13.5px] leading-relaxed text-ink">
          If that email has an account, a link is on its way. Check your inbox — it
          works once and expires in an hour.
        </p>
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
          Running this locally with no email service configured? Look for{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11.5px]">
            PASSWORD-RESET-LINK.txt
          </code>{" "}
          in the project folder instead.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <FormError error={state.error} />
      <Field label="Email" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@practice.com"
          className={inputClass}
        />
      </Field>
      <SubmitButton className="w-full">Send reset link</SubmitButton>
    </form>
  );
}
