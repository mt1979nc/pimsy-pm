"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setTaskStatus } from "@/actions/tasks";
import { dueLabel, isOverdue } from "@/lib/dates";
import { cn } from "@/lib/cn";

export function PortalTaskRow({
  task,
}: {
  task: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    dueDate: string | null;
    projectName?: string | null;
    projectId?: string | null;
  };
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const done = task.status === "DONE";
  const overdue = isOverdue(task.dueDate) && !done;

  return (
    <div className={cn("flex items-start gap-3 px-5 py-3", pending && "opacity-60")}>
      <button
        type="button"
        disabled={pending}
        aria-label={done ? `Mark ${task.title} not done` : `Mark ${task.title} done`}
        onClick={() => {
          setError(null);
          start(async () => {
            try {
              await setTaskStatus(task.id, done ? "TODO" : "DONE");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not update that item.");
            }
          });
        }}
        className={cn(
          "mt-0.5 flex size-[19px] shrink-0 items-center justify-center rounded-md border transition-colors",
          done
            ? "border-green bg-green text-white"
            : "border-border-strong bg-surface hover:border-brand",
        )}
      >
        {done ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
            <path d="m5 13 4.5 4.5L19 7" />
          </svg>
        ) : null}
      </button>

      <div className="min-w-0 flex-1">
        {task.projectId ? (
          <Link
            href={`/portal/projects/${task.projectId}/tasks/${task.id}`}
            className={cn(
              "block text-[14px] leading-snug hover:text-brand hover:underline",
              done ? "text-ink-3 line-through" : "text-ink",
            )}
          >
            {task.title}
          </Link>
        ) : (
          <div
            className={cn(
              "text-[14px] leading-snug",
              done ? "text-ink-3 line-through" : "text-ink",
            )}
          >
            {task.title}
          </div>
        )}
        {task.description ? (
          <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-2">
            {task.description}
          </p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
          {task.projectName ? (
            <>
              <span>{task.projectName}</span>
              <span>·</span>
            </>
          ) : null}
          {task.dueDate ? (
            <span className={cn(overdue && "font-medium text-red")}>{dueLabel(task.dueDate)}</span>
          ) : (
            <span>No due date</span>
          )}
        </div>
        {error ? <p className="mt-1 text-[12px] text-red">{error}</p> : null}
      </div>
    </div>
  );
}
