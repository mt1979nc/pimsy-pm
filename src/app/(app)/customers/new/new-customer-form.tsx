"use client";

import { useActionState } from "react";
import { createCustomer } from "@/actions/customers";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Card, CardHeader, Field, inputClass, LinkButton } from "@/components/ui";

export function NewCustomerForm() {
  const [state, action] = useActionState(createCustomer, {});

  return (
    <form action={action} className="mx-auto max-w-[680px] space-y-5">
      <Card>
        <CardHeader title="Practice details" />
        <div className="space-y-4 p-5">
          <FormError error={state.error} />

          <Field label="Practice name" htmlFor="name">
            <input
              id="name"
              name="name"
              required
              autoFocus
              placeholder="Riverbend Counseling Group"
              className={inputClass}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Practice type" htmlFor="practiceType">
              <input
                id="practiceType"
                name="practiceType"
                placeholder="Outpatient Behavioral Health"
                className={inputClass}
              />
            </Field>
            <Field label="Status" htmlFor="status">
              <select id="status" name="status" defaultValue="ONBOARDING" className={inputClass}>
                <option value="PROSPECT">Prospect</option>
                <option value="ONBOARDING">Onboarding</option>
                <option value="LIVE">Live</option>
                <option value="AT_RISK">At risk</option>
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Seats / users" htmlFor="seatCount">
              <input id="seatCount" name="seatCount" type="number" min="1" className={inputClass} />
            </Field>
            <Field label="Coming from" htmlFor="priorSystem" hint="Their current EHR, if any.">
              <input
                id="priorSystem"
                name="priorSystem"
                placeholder="TherapyNotes"
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="City" htmlFor="city">
              <input id="city" name="city" className={inputClass} />
            </Field>
            <Field label="State" htmlFor="state">
              <input id="state" name="state" maxLength={2} className={inputClass} />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <input id="phone" name="phone" className={inputClass} />
            </Field>
          </div>

          <Field
            label="Internal notes"
            htmlFor="internalNotes"
            hint="Never shown in the customer portal."
          >
            <textarea
              id="internalNotes"
              name="internalNotes"
              rows={3}
              placeholder="Anything the team should know that the customer shouldn't read."
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <LinkButton href="/customers">Cancel</LinkButton>
        <SubmitButton pendingLabel="Creating…">Create customer</SubmitButton>
      </div>
    </form>
  );
}
