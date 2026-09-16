"use client";

import { useActionState } from "react";
import { updateCustomer } from "@/actions/customers";
import { SubmitButton, FormError } from "@/components/submit-button";
import { AnalyticsExcludeToggle } from "@/components/analytics-exclude-toggle";

export function CustomerAnalyticsForm({
  customerId,
  excludeFromAnalytics,
}: {
  customerId: string;
  excludeFromAnalytics: boolean;
}) {
  const [state, action] = useActionState(updateCustomer, {});

  return (
    <form action={action} className="space-y-4 p-5">
      <input type="hidden" name="customerId" value={customerId} />
      <FormError error={state.error} />
      {state.ok ? (
        <p className="rounded-lg bg-green-soft px-3 py-2 text-[12.5px] text-green">Saved.</p>
      ) : null}
      <AnalyticsExcludeToggle defaultChecked={excludeFromAnalytics} />
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      </div>
    </form>
  );
}
