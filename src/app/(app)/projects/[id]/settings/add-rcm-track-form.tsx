"use client";

import { useActionState, useState } from "react";
import { addRcmTrack, type AddRcmActionState } from "@/actions/projects";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";
import { STAFFING_ROLE_LABELS } from "@/lib/staffing";
import { ADD_RCM_ROLES, RCM_TRACK_ALREADY_ON } from "@/lib/add-rcm";

type Option = { id: string; name: string | null };

export function AddRcmAlreadyOnNote() {
  return (
    <p className="px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
      {RCM_TRACK_ALREADY_ON} No additional playbook tasks were added.
    </p>
  );
}

export function AddRcmTrackForm({
  projectId,
  staff,
  defaultAssignments = {},
}: {
  projectId: string;
  staff: Option[];
  defaultAssignments?: Record<string, string>;
}) {
  const [state, action] = useActionState(addRcmTrack, {} as AddRcmActionState);
  const [confirm, setConfirm] = useState(false);

  if (state.alreadyOn) {
    return <AddRcmAlreadyOnNote />;
  }

  return (
    <form action={action} className="space-y-3 p-4">
      <input type="hidden" name="projectId" value={projectId} />
      <FormError error={state.error} />
      {state.ok ? (
        <p className="rounded-lg bg-green-soft px-3 py-2 text-[12.5px] text-green">
          RCM added. Open Billing, Discovery, and Configuration work stays connected
          (complete in one reflects in the other). Copies of already-done overlap were
          marked done. Nobody new was invented — only people already on this project or
          chosen below were assigned.
        </p>
      ) : null}
      <p className="text-[12.5px] leading-relaxed text-ink-3">
        Adds the RCM area, playbook tabs, and tasks onto this live Implementation WIP.
        EHR kickoff and go-live stay as they are. If RCM is already here, PATH reports
        already-on and does not duplicate tasks.
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
      {ADD_RCM_ROLES.map((role) => (
        <Field key={role} label={STAFFING_ROLE_LABELS[role]} htmlFor={`rcm-${role}`}>
          <select
            id={`rcm-${role}`}
            name={`roleAssignment:${role}`}
            className={inputClass}
            defaultValue={defaultAssignments[role] ?? ""}
          >
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
        Add the RCM area and playbook tasks to this project
      </label>
      {confirm ? (
        <SubmitButton size="sm" pendingLabel="Adding…">
          Add RCM
        </SubmitButton>
      ) : (
        <p className="text-[12px] text-ink-3">Check the box to enable Add RCM.</p>
      )}
    </form>
  );
}
