"use client";

import { useActionState } from "react";
import { updateOwnProfile } from "@/actions/admin";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";

const ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export function ProfileForm({
  defaults,
}: {
  defaults: { name: string; title: string; timeZone: string; capacityHoursPerWeek: number };
}) {
  const [state, action] = useActionState(updateOwnProfile, {});

  return (
    <form action={action} className="space-y-4 p-5">
      <FormError error={state.error} />
      {state.ok ? (
        <p className="rounded-lg bg-green-soft px-3 py-2 text-[12.5px] text-green">Saved.</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name">
          <input id="name" name="name" defaultValue={defaults.name} className={inputClass} />
        </Field>
        <Field label="Title" htmlFor="title">
          <input
            id="title"
            name="title"
            defaultValue={defaults.title}
            placeholder="Implementation Specialist"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Time zone" htmlFor="timeZone">
          <select
            id="timeZone"
            name="timeZone"
            defaultValue={defaults.timeZone}
            className={inputClass}
          >
            {ZONES.map((z) => (
              <option key={z} value={z}>
                {z.replace("America/", "").replace("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Weekly capacity (hours)"
          htmlFor="capacityHoursPerWeek"
          hint="Drives the team capacity report."
        >
          <input
            id="capacityHoursPerWeek"
            name="capacityHoursPerWeek"
            type="number"
            min="1"
            max="80"
            defaultValue={defaults.capacityHoursPerWeek}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
      </div>
    </form>
  );
}
