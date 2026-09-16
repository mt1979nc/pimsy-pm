"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export function CollapsibleCompleted({
  count,
  children,
  defaultOpen = false,
}: {
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count <= 0) return null;

  return (
    <div className="border-t border-border">
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
        {count} completed
        <span className="font-normal text-ink-3">{open ? "— hide finished work" : "— show"}</span>
      </button>
      {open ? <div className="divide-y divide-border border-t border-border">{children}</div> : null}
    </div>
  );
}
