"use client";

import { useActionState } from "react";
import { saveCustomerLogo } from "@/actions/customers";
import { CustomerLogoFields } from "@/components/customer-logo-fields";
import { SubmitButton, FormError, FormSuccess } from "@/components/submit-button";
import { cn } from "@/lib/cn";

export function CustomerLogoForm({
  customerId,
  currentSrc,
  currentUrl,
  className,
}: {
  customerId: string;
  currentSrc: string | null;
  currentUrl: string | null;
  className?: string;
}) {
  const [state, action] = useActionState(saveCustomerLogo, {});

  return (
    <form action={action} className={cn("space-y-4 p-5", className)}>
      <input type="hidden" name="customerId" value={customerId} />
      <FormError error={state.error} />
      <FormSuccess message={state.ok ? (state.message ?? "Logo saved.") : undefined} />
      <CustomerLogoFields currentSrc={currentSrc} currentUrl={currentUrl} allowClear />
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">Save logo</SubmitButton>
      </div>
    </form>
  );
}
