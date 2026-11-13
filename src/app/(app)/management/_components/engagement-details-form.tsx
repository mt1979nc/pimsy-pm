"use client";

import { useActionState, useState } from "react";

import { updateEngagementDetails } from "@/actions/engagement-details";
import { FormError, FormSuccess, SubmitButton } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";

const STATUSES = ["PROSPECT", "ONBOARDING", "LIVE", "AT_RISK", "CHURNED"] as const;

export type EngagementDetails = {
  projectId: string;
  name: string;
  practiceType: string;
  website: string;
  phone: string;
  city: string;
  state: string;
  priorSystem: string;
  seatCount: string;
  logoUrl: string;
  status: string;
  acronym: string;
  hubspotDealUrl: string;
  contractDate: string;
  expectedArr: string;
};

export function EngagementDetailsForm({ details }: { details: EngagementDetails }) {
  const [state, action] = useActionState(updateEngagementDetails, {});
  const [localError, setLocalError] = useState<string | undefined>();
  const remountKey = [
    details.name,
    details.acronym,
    details.status,
    details.practiceType,
    details.website,
    details.phone,
    details.city,
    details.state,
    details.priorSystem,
    details.seatCount,
    details.logoUrl,
    details.hubspotDealUrl,
    details.contractDate,
    details.expectedArr,
  ].join("|");

  return (
    <form
      action={action}
      className="space-y-4 p-4"
      onSubmit={(event) => {
        const data = new FormData(event.currentTarget);
        const acronym = String(data.get("acronym") ?? "");
        const name = String(data.get("name") ?? "");
        if (!name.trim()) {
          event.preventDefault();
          setLocalError("Customer name is required.");
          return;
        }
        if (!/^[A-Za-z0-9][A-Za-z0-9-]{1,19}$/.test(acronym.trim())) {
          event.preventDefault();
          setLocalError("Acronym must be 2–20 letters or numbers.");
          return;
        }
        setLocalError(undefined);
      }}
    >
      <input type="hidden" name="projectId" value={details.projectId} />
      <div key={remountKey} className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer name" htmlFor="detail-name">
          <input id="detail-name" name="name" defaultValue={details.name} className={inputClass} />
        </Field>
        <Field label="Acronym" htmlFor="detail-acronym">
          <input id="detail-acronym" name="acronym" defaultValue={details.acronym} className={inputClass} />
        </Field>
        <Field label="Customer status" htmlFor="detail-status">
          <select id="detail-status" name="status" defaultValue={details.status} className={inputClass}>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.replace(/_/g, " ").toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Practice type" htmlFor="detail-practice" hint="Not the EHR / RCM product. That comes from the playbook.">
          <input id="detail-practice" name="practiceType" defaultValue={details.practiceType} className={inputClass} />
        </Field>
        <Field label="Website" htmlFor="detail-website">
          <input id="detail-website" name="website" defaultValue={details.website} className={inputClass} />
        </Field>
        <Field label="Phone" htmlFor="detail-phone">
          <input id="detail-phone" name="phone" defaultValue={details.phone} className={inputClass} />
        </Field>
        <Field label="City" htmlFor="detail-city">
          <input id="detail-city" name="city" defaultValue={details.city} className={inputClass} />
        </Field>
        <Field label="State" htmlFor="detail-state">
          <input id="detail-state" name="state" defaultValue={details.state} className={inputClass} />
        </Field>
        <Field label="Prior system" htmlFor="detail-prior">
          <input id="detail-prior" name="priorSystem" defaultValue={details.priorSystem} className={inputClass} />
        </Field>
        <Field label="Seats" htmlFor="detail-seats">
          <input id="detail-seats" name="seatCount" defaultValue={details.seatCount} className={inputClass} />
        </Field>
        <Field label="Logo URL" htmlFor="detail-logo">
          <input id="detail-logo" name="logoUrl" defaultValue={details.logoUrl} className={inputClass} />
        </Field>
        <Field label="CRM link" htmlFor="detail-crm" hint="HubSpot deal URL. The live site bookmark stays on About.">
          <input id="detail-crm" name="hubspotDealUrl" defaultValue={details.hubspotDealUrl} className={inputClass} />
        </Field>
        <Field label="Contract date" htmlFor="detail-contract">
          <input id="detail-contract" name="contractDate" type="date" defaultValue={details.contractDate} className={inputClass} />
        </Field>
        <Field label="Expected ARR" htmlFor="detail-arr">
          <input id="detail-arr" name="expectedArr" defaultValue={details.expectedArr} className={inputClass} />
        </Field>
      </div>
      <SubmitButton pendingLabel="Saving…">Save details</SubmitButton>
      <FormError error={localError ?? state.error} />
      <FormSuccess message={state.ok ? (state.message ?? "Saved.") : undefined} />
    </form>
  );
}
