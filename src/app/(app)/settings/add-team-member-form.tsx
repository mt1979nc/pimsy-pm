"use client";

import { useActionState } from "react";
import { addTeamMember } from "@/actions/add-team-member";
import { FormError, FormSuccess, SubmitButton } from "@/components/submit-button";
import { Card, CardHeader, inputClass } from "@/components/ui";
import { ADDABLE_STAFF_ROLES, STAFF_ROLE_LABELS } from "@/lib/team-member";

/** Owner/admin only. One action: Add. Hours start at 30 in the People list. */
export function AddTeamMemberForm() {
  const [state, action] = useActionState(addTeamMember, {});

  return (
    <Card>
      <CardHeader title="Add team member" subtitle="They show in People. Hours start at 30." />
      <form action={action} className="grid gap-3 p-4 sm:grid-cols-2">
        <FormError error={state.error} />
        <FormSuccess message={state.message} />
        <label className="grid gap-1 text-[12.5px] text-ink-2 sm:col-span-1">
          Name
          <input name="name" required autoComplete="off" className={inputClass} />
        </label>
        <label className="grid gap-1 text-[12.5px] text-ink-2">
          Email
          <input name="email" type="email" required autoComplete="off" className={inputClass} />
        </label>
        <label className="grid gap-1 text-[12.5px] text-ink-2">
          Role
          <select name="role" defaultValue="SPECIALIST" className={inputClass}>
            {ADDABLE_STAFF_ROLES.map((role) => (
              <option key={role} value={role}>
                {STAFF_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-4 pb-2 text-[12.5px] text-ink-2">
          <label className="flex items-center gap-1.5">
            <input name="canLead" type="checkbox" defaultChecked className="size-3.5 accent-brand" />
            Lead
          </label>
          <label className="flex items-center gap-1.5">
            <input name="capacityExempt" type="checkbox" className="size-3.5 accent-brand" />
            Exempt
          </label>
          <label className="flex items-center gap-1.5">
            <input name="isDirector" type="checkbox" className="size-3.5 accent-brand" />
            Director
          </label>
        </div>
        <div className="sm:col-span-2">
          <SubmitButton>Add</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
