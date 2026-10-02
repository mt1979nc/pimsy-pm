"use client";

import { useActionState } from "react";
import { pullHubSpotCeoFields } from "@/actions/projects";
import { FormError, SubmitButton } from "@/components/submit-button";

/** Secondary action on staff About. Fills empty CEO fields; does not overwrite. */
export function PullFromHubSpotForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState(pullHubSpotCeoFields, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="projectId" value={projectId} />
      <SubmitButton variant="secondary" size="sm" pendingLabel="Pulling…">
        Pull from HubSpot
      </SubmitButton>
      <FormError error={state.error} />
      {state.ok && state.message ? (
        <p className="text-[12.5px] text-green" role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
