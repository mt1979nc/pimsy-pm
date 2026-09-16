"use client";

import { useTransition } from "react";
import { setPhaseVisibility } from "@/actions/projects";

export function PhaseVisibilityButton({
  phaseId,
  visibility,
}: {
  phaseId: string;
  visibility: "INTERNAL" | "SHARED";
}) {
  const [pending, start] = useTransition();
  const hidden = visibility === "INTERNAL";

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => setPhaseVisibility(phaseId, hidden))}
      className="inline-flex items-center gap-1 text-[12px] text-ink-3 underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
      title={
        hidden
          ? "Show this tab in the customer portal (Dock eyelid open)"
          : "Hide this tab from the customer until you are ready"
      }
      aria-label={hidden ? "Expose tab to customer" : "Hide tab from customer"}
    >
      {hidden ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
      {hidden ? "Expose tab" : "Hide tab"}
    </button>
  );
}
