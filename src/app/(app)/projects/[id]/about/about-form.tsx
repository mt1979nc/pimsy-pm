"use client";

import { useActionState } from "react";
import { updateProjectAbout } from "@/actions/projects";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";

export function ProjectAboutForm({
  project,
}: {
  project: {
    id: string;
    hubspotDealUrl: string | null;
    prismClientId: string | null;
    crmAcronym: string | null;
    crmKey: string | null;
    zoomBookingUrl: string | null;
    aboutNotes: string | null;
    customFields: Record<string, string>;
  };
}) {
  const [state, action] = useActionState(updateProjectAbout, {});
  const customLines = Object.entries(project.customFields ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  return (
    <form action={action} className="space-y-4 p-5">
      <input type="hidden" name="projectId" value={project.id} />
      <FormError error={state.error} />
      {state.ok ? (
        <p className="rounded-lg bg-green-soft px-3 py-2 text-[12.5px] text-green">Saved.</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="CRM acronym" htmlFor="crmAcronym">
          <input
            id="crmAcronym"
            name="crmAcronym"
            defaultValue={project.crmAcronym ?? ""}
            placeholder="e.g. ACME"
            className={inputClass}
          />
        </Field>
        <Field label="CRM key" htmlFor="crmKey">
          <input
            id="crmKey"
            name="crmKey"
            defaultValue={project.crmKey ?? ""}
            placeholder="Internal CRM key"
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="HubSpot deal URL" htmlFor="hubspotDealUrl">
        <input
          id="hubspotDealUrl"
          name="hubspotDealUrl"
          type="url"
          defaultValue={project.hubspotDealUrl ?? ""}
          placeholder="https://app.hubspot.com/contacts/…"
          className={inputClass}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prism client ID" htmlFor="prismClientId">
          <input
            id="prismClientId"
            name="prismClientId"
            defaultValue={project.prismClientId ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Zoom booking URL" htmlFor="zoomBookingUrl">
          <input
            id="zoomBookingUrl"
            name="zoomBookingUrl"
            type="url"
            defaultValue={project.zoomBookingUrl ?? ""}
            placeholder="https://…"
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="About notes" htmlFor="aboutNotes">
        <textarea
          id="aboutNotes"
          name="aboutNotes"
          rows={5}
          defaultValue={project.aboutNotes ?? ""}
          placeholder="Site profile notes the team (and optionally the customer) should see…"
          className={inputClass}
        />
      </Field>

      <Field
        label="Custom fields"
        htmlFor="customFields"
        hint="One per line as key=value. Shown to staff; portal shows notes + booking + acronym only."
      >
        <textarea
          id="customFields"
          name="customFields"
          rows={4}
          defaultValue={customLines}
          placeholder={"timezone=America/Chicago\npreferredContact=Jane"}
          className={inputClass}
        />
      </Field>

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">Save About</SubmitButton>
      </div>
    </form>
  );
}
