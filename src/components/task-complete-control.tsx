"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setTaskStatus } from "@/actions/tasks";
import { cn } from "@/lib/cn";

export function TaskCompleteControl({
  taskId,
  title,
  status,
  canEdit,
  size = "md",
}: {
  taskId: string;
  title: string;
  status: string;
  canEdit: boolean;
  size?: "sm" | "md";
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);
  const done = optimisticStatus === "DONE";
  const box = size === "sm" ? "size-[17px]" : "size-[22px]";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={!canEdit || pending}
        aria-label={done ? `Mark ${title} not done` : `Mark ${title} done`}
        onClick={() => {
          if (!canEdit) return;
          setError(null);
          const next = done ? "TODO" : "DONE";
          start(async () => {
            setOptimisticStatus(next);
            try {
              await setTaskStatus(taskId, next);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not update that item.");
            }
          });
        }}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px] font-medium transition-colors",
          done
            ? "border-green bg-green/15 text-green"
            : "border-border-strong bg-surface text-ink hover:border-brand",
          !canEdit && "cursor-default opacity-60",
          pending && "cursor-default",
        )}
      >
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-[5px] border",
            box,
            done ? "border-green bg-green text-white" : "border-border-strong bg-surface",
          )}
        >
          {done ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
              <path d="m5 13 4.5 4.5L19 7" />
            </svg>
          ) : null}
        </span>
        {done ? "Completed" : "Mark done"}
      </button>
      {error ? <p className="text-[12px] text-red">{error}</p> : null}
    </div>
  );
}
