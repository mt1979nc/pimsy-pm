"use client";

import { useActionState, useState } from "react";

import { updateProjectCoLead } from "@/actions/management-engagements";
import { EngagementOwnersFields } from "@/app/(app)/management/_components/engagement-owners-fields";
import { FormError, FormSuccess, SubmitButton } from "@/components/submit-button";
import { ownerFormError, ownerSelectState } from "@/lib/co-lead";

type Option = { id: string; name: string | null; email: string };

export function CoLeadForm({
  projectId,
  leadId,
  coLeadId,
  thirdSpecialistId,
  leadSplitPercent,
  coLeadSplitPercent,
  thirdSplitPercent,
  options,
}: {
  projectId: string;
  leadId: string | null;
  coLeadId: string | null;
  thirdSpecialistId: string | null;
  leadSplitPercent: number;
  coLeadSplitPercent: number;
  thirdSplitPercent: number;
  options: Option[];
}) {
  const [state, action] = useActionState(updateProjectCoLead, {});
  const [ownerError, setOwnerError] = useState<string | undefined>();
  const owners = ownerSelectState(
    { leadId, coLeadId, thirdSpecialistId, leadSplitPercent, coLeadSplitPercent, thirdSplitPercent },
    options.map((person) => person.id),
  );

  return (
    <form
      action={action}
      className="space-y-3 border-t border-border px-4 py-3"
      onSubmit={(event) => {
        const error = ownerFormError(new FormData(event.currentTarget));
        setOwnerError(error ?? undefined);
        if (error) event.preventDefault();
      }}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <EngagementOwnersFields
        remountKey={owners.key}
        leadId={owners.leadId}
        coLeadId={owners.coLeadId}
        thirdSpecialistId={owners.thirdSpecialistId}
        leadSplitPercent={owners.leadSplitPercent}
        coLeadSplitPercent={owners.coLeadSplitPercent}
        thirdSplitPercent={owners.thirdSplitPercent}
        options={options}
      />
      <p className="text-[12px] text-ink-3">Percents for the people you assign must total 100. An empty slot has no percent.</p>
      <SubmitButton pendingLabel="Saving…">Save owners</SubmitButton>
      <FormError error={ownerError ?? state.error} />
      <FormSuccess message={state.ok ? (state.message ?? "Saved.") : undefined} />
    </form>
  );
}
