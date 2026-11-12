"use client";

import { useActionState } from "react";

import { updateProjectCoLead } from "@/actions/management-engagements";
import { ownerSelectState } from "@/lib/co-lead";
import { FormError, FormSuccess, SubmitButton } from "@/components/submit-button";
import { inputClass } from "@/components/ui";

type Option = { id: string; name: string | null; email: string };

export function CoLeadForm({
  projectId,
  coLeadId,
  ownerSplitPercent,
  options,
}: {
  projectId: string;
  coLeadId: string | null;
  ownerSplitPercent: number;
  options: Option[];
}) {
  const [state, action] = useActionState(updateProjectCoLead, {});
  const owners = ownerSelectState(
    { leadId: null, coLeadId, ownerSplitPercent },
    options.map((person) => person.id),
  );

  return (
    <form action={action} className="border-t border-border px-4 py-3">
      <input type="hidden" name="projectId" value={projectId} />
      <div key={owners.key} className="flex flex-wrap items-end gap-3">
        <label className="min-w-[12rem] flex-1 text-[12.5px] text-ink-2">
          Co-lead
          <select name="coLeadId" defaultValue={owners.coLeadId} className={`${inputClass} mt-1`}>
            <option value="">None</option>
            {options.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name?.trim() || person.email}
              </option>
            ))}
          </select>
        </label>
        <label className="w-28 text-[12.5px] text-ink-2">
          Lead share %
          <input
            name="ownerSplitPercent"
            type="number"
            min={1}
            max={100}
            defaultValue={owners.ownerSplitPercent}
            className={`${inputClass} mt-1`}
          />
        </label>
        <SubmitButton pendingLabel="Saving…">Save co-lead</SubmitButton>
      </div>
      <p className="mt-1.5 text-[12px] text-ink-3">The co-lead gets the rest of the hours. Only people marked Can lead are listed.</p>
      <FormError error={state.error} />
      <FormSuccess message={state.ok ? (state.message ?? "Saved.") : undefined} />
    </form>
  );
}
