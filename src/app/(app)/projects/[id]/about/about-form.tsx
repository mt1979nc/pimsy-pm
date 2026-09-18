"use client";

import { useActionState } from "react";
import { updateProjectAbout } from "@/actions/projects";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";
import { customFieldsAsLines } from "@/lib/about-profile";
import { bookmarkFromCustomFields, customFieldsWithoutBookmark } from "@/lib/accessing-pimsy";
import {
  BOOKING_FORM_FIELD,
  BOOKING_MEETING_LABELS,
  BOOKING_MEETING_TYPES,
  migrateLegacyZoomBooking,
  normalizeBookingUrls,
  type BookingUrlMap,
} from "@/lib/booking-urls";

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
    bookingUrls?: BookingUrlMap;
    aboutNotes: string | null;
    customFields: Record<string, string>;
    onboarded: boolean;
    specialistName?: string | null;
    specialistBookingUrl?: string | null;
  };
}) {
  const [state, action] = useActionState(updateProjectAbout, {});
  const bookmarkUrl = bookmarkFromCustomFields(project.customFields);
  const bookingUrls = migrateLegacyZoomBooking(
    project.zoomBookingUrl,
    normalizeBookingUrls(project.bookingUrls),
  );
  const customLines = customFieldsAsLines(customFieldsWithoutBookmark(project.customFields ?? {}));

  return (
    <form action={action} className="space-y-4 p-5">
      <input type="hidden" name="projectId" value={project.id} />
      <FormError error={state.error} />
      {state.ok ? (
        <p className="rounded-lg bg-green-soft px-3 py-2 text-[12.5px] text-green">Saved.</p>
      ) : null}

      <div className="rounded-xl border border-border p-4">
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            name="onboarded"
            defaultChecked={project.onboarded}
            className="mt-0.5 size-4 rounded border-border-strong"
          />
          <span>
            <span className="block text-[13.5px] font-medium text-ink">Onboarded</span>
            <span className="block text-[12px] text-ink-3">
              Hides overdue/upcoming from dashboard, My work, and Portfolio. Stays on this hub.
            </span>
          </span>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="CRM acronym" htmlFor="crmAcronym" hint="Auto-create and About account.">
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
            placeholder="Desktop-install security key when issued"
            className={inputClass}
          />
        </Field>
      </div>

      <Field
        label="Live site"
        htmlFor="bookmarkUrl"
        hint="Practice PIMSY web link. Shown on About and Accessing Pimsy."
      >
        <input
          id="bookmarkUrl"
          name="bookmarkUrl"
          type="url"
          defaultValue={bookmarkUrl ?? ""}
          placeholder="https://…"
          className={inputClass}
        />
      </Field>

      <Field
        label="HubSpot deal URL"
        htmlFor="hubspotDealUrl"
        hint="CRM auto-create. Staff only — not the live site."
      >
        <input
          id="hubspotDealUrl"
          name="hubspotDealUrl"
          type="url"
          defaultValue={project.hubspotDealUrl ?? ""}
          placeholder="https://app.hubspot.com/contacts/…/record/0-3/…"
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
      </div>

      <div className="space-y-3 rounded-xl border border-border p-4">
        <div>
          <h3 className="text-[13px] font-medium text-ink">Booking links</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {BOOKING_MEETING_TYPES.map((type) => {
            const field = BOOKING_FORM_FIELD[type];
            return (
              <Field
                key={type}
                label={BOOKING_MEETING_LABELS[type]}
                htmlFor={field}
                hint={
                  type === "kickoff" && project.specialistBookingUrl && !bookingUrls.kickoff
                    ? `Uses ${project.specialistName ?? "specialist"}’s booking page.`
                    : undefined
                }
              >
                <input
                  id={field}
                  name={field}
                  type="url"
                  defaultValue={bookingUrls[type] ?? ""}
                  placeholder="https://…"
                  className={inputClass}
                />
              </Field>
            );
          })}
        </div>
      </div>

      <Field label="About notes" htmlFor="aboutNotes">
        <textarea
          id="aboutNotes"
          name="aboutNotes"
          rows={5}
          defaultValue={project.aboutNotes ?? ""}
          placeholder="Site profile notes the team (and the customer) should see…"
          className={inputClass}
        />
      </Field>

      <Field label="Extra fields" htmlFor="customFields" hint="One per line as key=value.">
        <textarea
          id="customFields"
          name="customFields"
          rows={3}
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
