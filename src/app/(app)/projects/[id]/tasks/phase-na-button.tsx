"use client";

import { useTransition } from "react";
import { markPhaseNotApplicable } from "@/actions/projects";

export function PhaseNaButton({
  phaseId,
  notApplicable,
  onPreviewChange,
}: {
  phaseId: string;
  notApplicable: boolean;
  onPreviewChange?: (next: boolean) => void;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const next = !notApplicable;
        onPreviewChange?.(next);
        start(async () => {
          try {
            await markPhaseNotApplicable(phaseId, next);
          } catch {
            onPreviewChange?.(notApplicable);
          }
        });
      }}
      className="text-[12px] text-ink-3 underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
      title="Removes this section from this project only. The template is unchanged."
    >
      {notApplicable ? "Restore" : "N/A"}
    </button>
  );
}
