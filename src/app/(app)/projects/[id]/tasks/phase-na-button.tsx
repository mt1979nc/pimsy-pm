"use client";

import { useTransition } from "react";
import { markPhaseNotApplicable } from "@/actions/projects";

export function PhaseNaButton({
  phaseId,
  notApplicable,
}: {
  phaseId: string;
  notApplicable: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => markPhaseNotApplicable(phaseId, !notApplicable))}
      className="text-[12px] text-ink-3 underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
      title="Removes this section from this project only. The template is unchanged."
    >
      {notApplicable ? "Restore section" : "Section N/A"}
    </button>
  );
}
