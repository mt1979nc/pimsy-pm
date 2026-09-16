"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setTaskStatus, setTaskVisibility, markTaskNotApplicable, deleteTask } from "@/actions/tasks";
import { Badge, PriorityBadge, VisibilityBadge, Avatar } from "@/components/ui";
import { TaskActionButtons } from "@/components/task-action-buttons";
import { AddAttachment } from "@/components/attachments";
import { TaskChecklist, type ChecklistItemView } from "@/components/task-checklist";
import { AddTaskInline } from "@/app/(app)/projects/[id]/tasks/task-forms";
import { dueLabel, isOverdue } from "@/lib/dates";
import { descriptionSnippet } from "@/lib/task-description";
import { cn } from "@/lib/cn";
import type { Priority, TaskStatus, Visibility, OwnerSide } from "@/db/schema";
import type { TaskActionAsset } from "@/lib/playbook-resources";

export type TaskRowData = {
  id: string;
  projectId?: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: Priority;
  visibility: Visibility;
  ownerSide: OwnerSide;
  dueDate: Date | string | null;
  completedAt: Date | string | null;
  assignee?: { id: string; name: string | null; image?: string | null } | null;
  project?: { id: string; name: string; code: string } | null;
  notApplicable?: boolean;
  workTrack?: "EHR" | "RCM" | "SHARED";
  parentTaskId?: string | null;
  depth?: number;
  phaseId?: string | null;
};

type StaffOption = { id: string; name: string | null };

export function TaskRow({
  task,
  showProject = false,
  canEdit = true,
  showVisibility = true,
  allowStructureEdit = false,
  staff = [],
  defaultAssigneeId,
  assets,
  checklist = [],
  hasChildren = false,
  childrenCollapsed = false,
  onToggleChildren,
}: {
  task: TaskRowData;
  showProject?: boolean;
  canEdit?: boolean;
  showVisibility?: boolean;
  /** Live project list: add sub-task / remove without opening a template editor. */
  allowStructureEdit?: boolean;
  staff?: StaffOption[];
  defaultAssigneeId?: string;
  assets?: TaskActionAsset[];
  checklist?: ChecklistItemView[];
  hasChildren?: boolean;
  childrenCollapsed?: boolean;
  onToggleChildren?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const projectId = task.projectId ?? task.project?.id;
  const href = projectId ? `/projects/${projectId}/tasks/${task.id}` : null;
  const done = task.status === "DONE";
  const na = Boolean(task.notApplicable);
  const completedAt = done && task.completedAt ? new Date(task.completedAt) : null;
  const overdue = isOverdue(task.dueDate, completedAt);
  const specialistSub = Boolean(task.parentTaskId) && task.ownerSide === "INTERNAL";
  const nested = (task.depth ?? 0) > 0;
  const snippet = descriptionSnippet(task.description, nested ? 120 : 180);

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
        "group transition-colors hover:bg-surface-2",
        pending && "opacity-60",
        na && "opacity-70",
        specialistSub && task.visibility === "INTERNAL" && "bg-amber-soft/40",
      )}
    >
      <div
        className="flex items-start gap-3 px-4 py-2.5"
        style={task.depth ? { paddingLeft: 16 + task.depth * 14 } : undefined}
      >
        {hasChildren && onToggleChildren ? (
          <button
            type="button"
            aria-label={childrenCollapsed ? `Expand ${task.title}` : `Collapse ${task.title}`}
            aria-expanded={!childrenCollapsed}
            onClick={onToggleChildren}
            className="mt-0.5 flex size-[17px] shrink-0 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              className={cn("transition-transform", !childrenCollapsed && "rotate-90")}
              aria-hidden
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        ) : nested ? (
          <span className="mt-0.5 size-[17px] shrink-0" aria-hidden />
        ) : null}
        <button
          type="button"
          onClick={toggle}
          disabled={!canEdit || pending || na}
          aria-label={done ? `Mark ${task.title} not done` : `Mark ${task.title} done`}
          title={done ? "Completed — click to reopen" : "Mark done"}
          className={cn(
            "mt-0.5 flex size-[19px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
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
            {nested && task.priority !== "HIGH" && task.priority !== "URGENT" ? null : (
              <PriorityBadge priority={task.priority} />
            )}
            {task.ownerSide === "CUSTOMER" ? <Badge tone="violet">Customer action</Badge> : null}
            {specialistSub ? <Badge tone="amber">Specialist</Badge> : null}
            {task.status === "BLOCKED" ? <Badge tone="red">Blocked</Badge> : null}
            {na ? <Badge tone="amber">N/A</Badge> : null}
            {task.workTrack === "RCM" ? <Badge tone="violet">RCM</Badge> : null}
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
            {canEdit ? (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      await markTaskNotApplicable(task.id, !na);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Could not update that item.");
                    }
                  })
                }
                className="hover:text-ink hover:underline opacity-0 group-hover:opacity-100 focus:opacity-100"
                title="Remove from this project only — does not change the template"
              >
                {na ? "Restore" : "N/A"}
              </button>
            ) : null}
            {allowStructureEdit && projectId ? (
              <span className="opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                <AddTaskInline
                  projectId={projectId}
                  phaseId={task.phaseId ?? undefined}
                  parentTaskId={task.id}
                  staff={staff}
                  defaultAssigneeId={defaultAssigneeId}
                />
              </span>
            ) : null}
            {allowStructureEdit ? (
              confirmRemove ? (
                <span className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await deleteTask(task.id);
                          setConfirmRemove(false);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Could not remove that task.");
                        }
                      })
                    }
                    className="font-medium text-red hover:underline"
                  >
                    Confirm remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(false)}
                    className="hover:text-ink hover:underline"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirmRemove(true)}
                  className="hover:text-red hover:underline opacity-0 group-hover:opacity-100 focus:opacity-100"
                  title="Remove this task from the live project. Does not change the playbook."
                >
                  Remove
                </button>
              )
            ) : null}
          </div>

          {snippet ? (
            <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-ink-2">{snippet}</p>
          ) : null}

          {checklist.length > 0 ? (
            <div className="mt-2">
              <TaskChecklist
                taskId={task.id}
                items={checklist}
                canEdit={false}
                canToggle={canEdit}
                taskIsInternal={task.visibility === "INTERNAL"}
                compact
              />
            </div>
          ) : null}

          {uploadOpen && projectId ? (
            <div className="mt-2 overflow-hidden rounded-lg border border-border">
              <AddAttachment
                taskId={task.id}
                canChooseVisibility={canEdit}
                defaultVisibility={task.visibility === "INTERNAL" ? "INTERNAL" : "SHARED"}
                taskIsInternal={task.visibility === "INTERNAL"}
                uploadRequest
                startInFileMode
                fileOnly
                onFinished={() => setUploadOpen(false)}
              />
            </div>
          ) : null}

          {error ? <p className="mt-1 text-[12px] text-red">{error}</p> : null}
        </div>

        <TaskActionButtons
          title={task.title}
          assets={assets}
          taskHref={href}
          compact
          className="mt-0.5"
          onUpload={() => setUploadOpen((v) => !v)}
        />
        {task.assignee ? (
          <Avatar name={task.assignee.name} image={task.assignee.image} size={22} className="mt-0.5" />
        ) : null}
      </div>
    </div>
  );
}

export function DeleteTaskControl({
  taskId,
  projectId,
  title,
}: {
  taskId: string;
  projectId: string;
  title: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button
        type="button"
        className="text-[13px] text-ink-3 hover:text-red hover:underline"
        onClick={() => setConfirming(true)}
      >
        Remove task
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[12.5px] leading-relaxed text-ink-2">
        Remove “{title}” from this live project? Nested sub-tasks are removed with it. The playbook
        template is unchanged.
      </p>
      {error ? <p className="text-[12px] text-red">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          className="rounded-lg bg-red px-2.5 py-1 text-[13px] font-medium text-white disabled:opacity-50"
          onClick={() =>
            start(async () => {
              try {
                await deleteTask(taskId);
                router.push(`/projects/${projectId}/tasks`);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not remove that task.");
              }
            })
          }
        >
          {pending ? "Removing…" : "Confirm remove"}
        </button>
        <button
          type="button"
          className="text-[13px] text-ink-3 hover:underline"
          onClick={() => setConfirming(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
