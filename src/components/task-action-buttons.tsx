"use client";

import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/cn";
import {
  DOCK_TASK_ACTION_LABEL,
  resolveTaskActionButtons,
  type ResolvedTaskActionButton,
  type TaskActionAsset,
} from "@/lib/playbook-resources";

function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

export function TaskActionButtons({
  title,
  assets,
  taskHref,
  compact = false,
  className,
}: {
  title: string;
  assets?: TaskActionAsset[];
  taskHref?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const buttons = resolveTaskActionButtons({ title, assets, taskHref });
  const [popup, setPopup] = useState<ResolvedTaskActionButton | null>(null);

  if (buttons.length === 0) return null;

  return (
    <>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2",
          compact ? "shrink-0" : "gap-x-3 gap-y-2",
          className,
        )}
      >
        {buttons.map((b) => (
          <TaskActionButton
            key={b.id}
            button={b}
            compact={compact}
            onPopup={() => setPopup(b)}
          />
        ))}
        {!compact
          ? buttons.map((b) => (
              <span key={`${b.id}-hint`} className="text-[12.5px] text-ink-3">
                {b.kind === "link" || b.kind === "form"
                  ? `Opens the ${b.resourceName}`
                  : b.kind === "download"
                    ? `Downloads ${b.resourceName}`
                    : "Opens Upload files on this task"}
              </span>
            ))
          : null}
      </div>
      {popup ? (
        <TaskActionPopup
          title={popup.resourceName}
          href={popup.href}
          onClose={() => setPopup(null)}
        />
      ) : null}
    </>
  );
}

function TaskActionButton({
  button,
  compact,
  onPopup,
}: {
  button: ResolvedTaskActionButton;
  compact: boolean;
  onPopup: () => void;
}) {
  const className = cn(
    "inline-flex items-center justify-center rounded-lg bg-[#113c64] px-3 text-center font-semibold !text-white shadow-sm hover:bg-[#0d2f4f] hover:!text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#113c64]",
    compact
      ? "h-auto min-h-7 max-w-[min(100%,18rem)] px-2.5 py-1 text-[12px] leading-tight"
      : "h-auto min-h-9 px-4 py-1.5 text-[14px] leading-snug",
  );
  const label = button.label || DOCK_TASK_ACTION_LABEL;
  const aria = `${label}: ${button.resourceName}`;

  if (button.popup && isExternalHref(button.href)) {
    return (
      <button
        type="button"
        className={className}
        aria-label={aria}
        title={button.resourceName}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPopup();
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <a
      href={button.href}
      className={className}
      aria-label={aria}
      title={button.resourceName}
      target={isExternalHref(button.href) ? "_blank" : undefined}
      rel={isExternalHref(button.href) ? "noopener noreferrer" : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      {label}
    </a>
  );
}

function TaskActionPopup({
  title,
  href,
  onClose,
}: {
  title: string;
  href: string;
  onClose: () => void;
}) {
  const labelId = useId();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className="relative z-10 flex h-[min(880px,92vh)] w-[min(1100px,96vw)] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <h2 id={labelId} className="truncate text-[14px] font-semibold text-ink">
            {title}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12.5px] font-medium text-brand hover:underline"
            >
              Open in new tab
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-[12.5px] text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              Close
            </button>
          </div>
        </div>
        <iframe title={title} src={href} className="min-h-0 flex-1 bg-white" />
      </div>
    </div>
  );
}
