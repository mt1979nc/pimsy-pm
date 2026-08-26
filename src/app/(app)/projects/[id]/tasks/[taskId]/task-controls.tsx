"use client";

import { useActionState, useState, useTransition } from "react";
import { updateTask, setTaskStatus, setTaskVisibility } from "@/actions/tasks";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Button, Field, inputClass, VisibilityBadge } from "@/components/ui";

const STATUSES = [
  ["TODO", "To do"],
  ["IN_PROGRESS", "In progress"],
  ["BLOCKED", "Blocked"],
  ["IN_REVIEW", "In review"],
  ["DONE", "Done"],
  ["CANCELLED", "Cancelled"],
] as const;

export function TaskDetailControls({
  task,
}: {
  task: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    visibility: "INTERNAL" | "SHARED";
    ownerSide: "INTERNAL" | "CUSTOMER";
    dueDate: string;
    estimateHours: number | null;
  };
}) {
  const [state, action] = useActionState(updateTask, {});
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function change(fn: () => Promise<unknown>) {
    setError(null);
    start(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "That didn't work.");
      }
    });
  }

  if (!editing) {
    return (
      <div className="space-y-4 p-5">
        {task.description ? (
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">
            {task.description}
          </p>
        ) : (
          <p className="text-[13.5px] italic text-ink-3">No description yet.</p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <select
            value={task.status}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.value;
              change(() => setTaskStatus(task.id, next));
            }}
            className="rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-[13px]"
          >
            {STATUSES.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={pending || task.ownerSide === "CUSTOMER"}
            title={
              task.ownerSide === "CUSTOMER"
                ? "Customer action items are always visible to them"
                : "Toggle whether the customer can see this task"
            }
            onClick={() =>
              change(() =>
                setTaskVisibility(task.id, task.visibility === "SHARED" ? "INTERNAL" : "SHARED"),
              )
            }
            className="disabled:opacity-70"
          >
            <VisibilityBadge visibility={task.visibility} />
          </button>

          <div className="flex-1" />
          <Button size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>

        {error ? <p className="text-[12.5px] text-red">{error}</p> : null}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4 p-5">
      <input type="hidden" name="taskId" value={task.id} />
      <FormError error={state.error} />

      <Field label="Title" htmlFor="title">
        <input id="title" name="title" defaultValue={task.title} required className={inputClass} />
      </Field>

      <Field
        label="Description"
        htmlFor="description"
        hint="What needs doing, and anything the person picking this up would need to know."
      >
        <textarea
          id="description"
          name="description"
          rows={6}
          defaultValue={task.description ?? ""}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Priority" htmlFor="priority">
          <select id="priority" name="priority" defaultValue={task.priority} className={inputClass}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </Field>
        <Field label="Due date" htmlFor="dueDate">
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            defaultValue={task.dueDate}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <SubmitButton size="sm" pendingLabel="Saving…">
          Save changes
        </SubmitButton>
      </div>
    </form>
  );
}
