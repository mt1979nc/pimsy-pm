"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Add-RCM-style default: a short header with one action; the large form or
 * essay stays hidden until clicked. Status chips stay outside this wrapper.
 */
export function CollapsedSection({
  title,
  subtitle,
  children,
  defaultOpen = false,
  openLabel = "Show",
  closeLabel = "Hide",
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  openLabel?: string;
  closeLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={className}>
      <div className="flex items-start justify-between gap-3 px-4 py-2">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold tracking-tight text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[12px] text-ink-3">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-[12.5px] font-medium text-brand hover:underline"
        >
          {open ? closeLabel : openLabel}
        </button>
      </div>
      {open ? <div className="border-t border-border">{children}</div> : null}
    </div>
  );
}

export function LearnMore({
  label = "Learn more",
  children,
  className,
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("text-[12px] text-ink-3", className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="font-medium text-ink-2 hover:text-ink hover:underline"
      >
        {open ? "Hide" : label}
      </button>
      {open ? <div className="mt-1 leading-snug">{children}</div> : null}
    </div>
  );
}
