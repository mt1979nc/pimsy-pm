"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInWithPassword } from "@/actions/auth";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";

export function PasswordSignInForm() {
  const [state, action] = useActionState(signInWithPassword, {});

  return (
    <form action={action} className="space-y-3">
      <FormError error={state.error} />
      <Field label="Email" htmlFor="password-email">
        <input
          id="password-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@practice.com"
          className={inputClass}
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </Field>
      <div className="flex items-center justify-between gap-3">
        <SubmitButton className="flex-1">Sign in</SubmitButton>
      </div>
      <p className="text-center text-[12.5px] text-ink-3">
        <Link href="/forgot-password" className="text-brand hover:underline">
          Forgot your password, or don&apos;t have one yet?
        </Link>
      </p>
    </form>
  );
}
