"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setTaskStatus, setTaskVisibility } from "@/actions/tasks";
import { Badge, PriorityBadge, VisibilityBadge, Avatar } from "@/components/ui";
import { dueLabel, isOverdue } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { Priority, TaskStatus, Visibility, OwnerSide } from "@/db/schema";

export type TaskRowData = {
  id: string;
  projectId?: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  visibility: Visibility;
  ownerSide: OwnerSide;
  dueDate: Date | string | null;
  completedAt: Date | string | null;
  assignee?: { id: string; name: string | null; image?: string | null } | null;
  project?: { id: string; name: string; code: string } | null;
};

export function TaskRow({
  task,
  showProject = false,
  canEdit = true,
  showVisibility = true,
}: {
  task: TaskRowData;
  showProject?: boolean;
  canEdit?: boolean;
  showVisibility?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const projectId = task.projectId ?? task.project?.id;
  const href = projectId ? `/projects/${projectId}/tasks/${task.id}` : null;
  const done = task.status === "DONE";
  const completedAt = done && task.completedAt ? new Date(task.completedAt) : null;
  const overdue = isOverdue(task.dueDate, completedAt);

  function toggle() {
    if (!canEdit) return;
    setError(null);
    startTransition(async () => {
      try {
        await setTaskStatus(task.id, done ? "TODO" : "DONE");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update that item.");
      }
    });
  }

  function flipVisibility() {
    setError(null);
    startTransition(async () => {
      try {
        await setTaskVisibility(task.id, task.visibility === "SHARED" ? "INTERNAL" : "SHARED");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not change visibility.");
      }
    });
  }

  return (
    <div
      className={cn(
        "group flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2",
        pending && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={!canEdit || pending}
        aria-label={done ? `Mark ${task.title} not done` : `Mark ${task.title} done`}
        className={cn(
          "mt-0.5 flex size-[17px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
          done
            ? "border-green bg-green text-white"
            : "border-border-strong bg-surface hover:border-brand",
          !canEdit && "cursor-default opacity-60",
        )}
      >
        {done ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
            <path d="m5 13 4.5 4.5L19 7" />
          </svg>
        ) : null}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {href ? (
            <Link
              href={href}
              className={cn(
                "text-[13.5px] leading-snug hover:text-brand hover:underline",
                done ? "text-ink-3 line-through" : "text-ink",
              )}
            >
              {task.title}
            </Link>
          ) : (
            <span
              className={cn(
                "text-[13.5px] leading-snug",
                done ? "text-ink-3 line-through" : "text-ink",
              )}
            >
              {task.title}
            </span>
          )}
          <PriorityBadge priority={task.priority} />
          {task.ownerSide === "CUSTOMER" ? <Badge tone="violet">Customer action</Badge> : null}
          {task.status === "BLOCKED" ? <Badge tone="red">Blocked</Badge> : null}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
          {showProject && task.project ? (
            <Link
              href={`/projects/${task.project.id}`}
              className="font-medium text-ink-2 hover:text-brand"
            >
              {task.project.name}
            </Link>
          ) : null}
          {task.dueDate ? (
            <span className={cn(overdue && !done && "font-medium text-red")}>
              {dueLabel(task.dueDate, completedAt)}
            </span>
          ) : null}
          {showVisibility ? (
            <button
              type="button"
              onClick={flipVisibility}
              disabled={pending || !canEdit}
              title="Toggle whether the customer can see this"
              className="rounded transition-opacity hover:opacity-80 disabled:cursor-default"
            >
              <VisibilityBadge visibility={task.visibility} />
            </button>
          ) : null}
        </div>

        {error ? <p className="mt-1 text-[12px] text-red">{error}</p> : null}
      </div>

      {task.assignee ? (
        <Avatar name={task.assignee.name} image={task.assignee.image} size={22} className="mt-0.5" />
      ) : null}
    </div>
  );
}
