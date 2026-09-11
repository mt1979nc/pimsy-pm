"use client";

import { useActionState, useState } from "react";
import { addRcmTrack } from "@/actions/projects";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";
import { STAFFING_ROLES, STAFFING_ROLE_LABELS } from "@/lib/staffing";

type Option = { id: string; name: string | null };

export function AddRcmTrackForm({
  projectId,
  staff,
}: {
  projectId: string;
  staff: Option[];
}) {
  const [state, action] = useActionState(addRcmTrack, {});
  const [confirm, setConfirm] = useState(false);

  return (
    <form action={action} className="space-y-3 p-4">
      <input type="hidden" name="projectId" value={projectId} />
      <FormError error={state.error} />
      {state.ok ? (
        <p className="rounded-lg bg-green-soft px-3 py-2 text-[12.5px] text-green">
          RCM track added. Overlapping implementation tasks were auto-completed.
        </p>
      ) : null}
      <p className="text-[12.5px] leading-relaxed text-ink-3">
        Adds RCM phases and tasks to this site only. EHR kickoff and go-live stay as they are.
        Overlapping standard-implementation work is marked done.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="RCM start" htmlFor="rcmStartDate">
          <input
            id="rcmStartDate"
            name="rcmStartDate"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={inputClass}
          />
        </Field>
        <Field label="RCM target" htmlFor="rcmTargetGoLiveDate">
          <input id="rcmTargetGoLiveDate" name="rcmTargetGoLiveDate" type="date" className={inputClass} />
        </Field>
      </div>
      {STAFFING_ROLES.filter((r) => r.includes("RCM") || r === "T1_BILLING_SUPPORT").map((role) => (
        <Field key={role} label={STAFFING_ROLE_LABELS[role]} htmlFor={`rcm-${role}`}>
          <select id={`rcm-${role}`} name={`roleAssignment:${role}`} className={inputClass} defaultValue="">
            <option value="">— Not assigned —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      ))}
      <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
        Add the RCM track to this project
      </label>
      {confirm ? (
        <SubmitButton size="sm" pendingLabel="Adding…">
          Add RCM track
        </SubmitButton>
      ) : (
        <p className="text-[12px] text-ink-3">Check the box to enable the add button.</p>
      )}
    </form>
  );
}
