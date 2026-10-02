"use client";

import { useSyncExternalStore } from "react";

/** Per-browser dismiss. Staff-only surfaces import this; the portal does not. */
export const CUTOVER_BANNER_DISMISS_KEY = "path.cutover-banner.dismissed";

const DISMISS_EVENT = "path-cutover-banner";
let memoryDismissed = false;

function readDismissed() {
  if (memoryDismissed) return true;
  try {
    return window.localStorage.getItem(CUTOVER_BANNER_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(DISMISS_EVENT, onChange);
  return () => window.removeEventListener(DISMISS_EVENT, onChange);
}

export function CutoverBanner() {
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => false);
  if (dismissed) return null;

  return (
    <div
      role="note"
      className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-ehr-slate/30 bg-brand-soft px-4 py-3 text-[13px] leading-snug text-ink"
    >
      <p>
        <span className="font-semibold">Roster and time slips are live in PATH.</span> Tasks are
        still in Dock — tracking here is empty until cutover.
      </p>
      <button
        type="button"
        className="shrink-0 rounded-md px-1.5 py-0.5 text-[12.5px] font-medium text-ink-2 hover:bg-surface hover:text-ink"
        onClick={() => {
          memoryDismissed = true;
          try {
            window.localStorage.setItem(CUTOVER_BANNER_DISMISS_KEY, "1");
          } catch {
            /* private mode: hide for this view only */
          }
          window.dispatchEvent(new Event(DISMISS_EVENT));
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
