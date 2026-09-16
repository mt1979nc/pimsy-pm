"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setTaskStatus } from "@/actions/tasks";
import { TaskActionButtons } from "@/components/task-action-buttons";
import { AddAttachment } from "@/components/attachments";
import { CommentCountBadge } from "@/components/comment-count-badge";
import { dueLabel, isOverdue } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { TaskActionAsset } from "@/lib/playbook-resources";

export function PortalTaskRow({
  task,
  showActions = true,
  assets,
  canUpload = false,
}: {
  task: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    dueDate: string | null;
    projectName?: string | null;
    projectId?: string | null;
    projectCode?: string | null;
    commentCount?: number;
    visibility?: "INTERNAL" | "SHARED";
  };
  showActions?: boolean;
  assets?: TaskActionAsset[];
  canUpload?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const done = task.status === "DONE";
  const overdue = isOverdue(task.dueDate) && !done;
  const comments = task.commentCount ?? 0;
  const taskHref = task.projectId
    ? `/portal/projects/${task.projectId}/tasks/${task.id}`
    : null;

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
        <div className="flex items-start gap-2">
          {taskHref ? (
            <Link
              href={taskHref}
              className={cn(
                "block min-w-0 flex-1 text-[14px] leading-snug hover:text-brand hover:underline",
                done ? "text-ink-3 line-through" : "text-ink",
              )}
            >
              {task.title}
            </Link>
          ) : (
            <div
              className={cn(
                "min-w-0 flex-1 text-[14px] leading-snug",
                done ? "text-ink-3 line-through" : "text-ink",
              )}
            >
              {task.title}
            </div>
          )}
          {showActions ? (
            <TaskActionButtons
              title={task.title}
              assets={assets}
              taskHref={taskHref}
              projectCode={task.projectCode}
              compact
              onUpload={canUpload ? () => setUploadOpen((v) => !v) : undefined}
            />
          ) : null}
          {comments > 0 ? (
            <CommentCountBadge count={comments} href={taskHref} />
          ) : null}
        </div>
        {task.projectName ? (
          <div className="mt-0.5 text-[12px] text-ink-3">{task.projectName}</div>
        ) : null}
        {task.description ? (
          <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-2">
            {task.description}
          </p>
        ) : null}
        {uploadOpen && task.projectId ? (
          <div className="mt-2 overflow-hidden rounded-lg border border-border">
            <AddAttachment
              taskId={task.id}
              canChooseVisibility={false}
              defaultVisibility="SHARED"
              taskIsInternal={false}
              uploadRequest
              startInFileMode
              fileOnly
              onFinished={() => setUploadOpen(false)}
            />
          </div>
        ) : null}
        {task.dueDate ? (
          <div className={cn("mt-1 text-[12px]", overdue ? "font-medium text-red" : "text-ink-3")}>
            {dueLabel(task.dueDate)}
          </div>
        ) : null}
        {error ? <p className="mt-1 text-[12px] text-red">{error}</p> : null}
      </div>
    </div>
  );
}
