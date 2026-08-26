"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { resetPassword } from "@/actions/auth";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [state, action] = useActionState(resetPassword, {});

  if (!token) {
    return (
      <p className="text-[13.5px] leading-relaxed text-ink">
        This link is missing its token. Ask for a new one from the{" "}
        <a href="/forgot-password" className="text-brand hover:underline">
          forgot password
        </a>{" "}
        page.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <FormError error={state.error} />
      <input type="hidden" name="token" value={token} />
      <Field label="New password" htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword">
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>
      <p className="text-[12px] leading-relaxed text-ink-3">
        At least 8 characters.
      </p>
      <SubmitButton className="w-full">Set password &amp; sign in</SubmitButton>
    </form>
  );
}
