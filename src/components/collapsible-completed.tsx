"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export function CollapsibleCompleted({
  count,
  children,
  defaultOpen = false,
  noun = "completed",
  hideHint = "— hide finished work",
  showHint = "— show",
  flush = false,
}: {
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  noun?: string;
  hideHint?: string;
  showHint?: string;
  /** Skip the top border when this is already the first child of a card. */
  flush?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count <= 0) return null;

  return (
    <div className={cn(!flush && "border-t border-border")}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[12.5px] font-medium text-ink-2 hover:bg-surface-2"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          className={cn("shrink-0 transition-transform", open && "rotate-90")}
          aria-hidden
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
        {count} {noun}
        <span className="font-normal text-ink-3">{open ? hideHint : showHint}</span>
      </button>
      {open ? <div className="divide-y divide-border border-t border-border">{children}</div> : null}
    </div>
  );
}
