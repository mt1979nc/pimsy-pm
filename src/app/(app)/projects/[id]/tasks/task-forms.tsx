"use client";

import { useActionState, useState, useRef, useEffect } from "react";
import { createTask } from "@/actions/tasks";
import { createPhase } from "@/actions/projects";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Button, inputClass, VisibilityBadge } from "@/components/ui";

type Option = { id: string; name: string | null };

export function AddTaskInline({
  projectId,
  phaseId,
  parentTaskId,
  staff,
  defaultAssigneeId,
  label,
}: {
  projectId: string;
  phaseId?: string;
  parentTaskId?: string;
  staff: Option[];
  defaultAssigneeId?: string;
  /** Button label when collapsed. */
  label?: string;
}) {
  const isSubtask = Boolean(parentTaskId);
  const [state, action] = useActionState(createTask, {});
  const [open, setOpen] = useState(false);
  const [ownerSide, setOwnerSide] = useState<"INTERNAL" | "CUSTOMER">("INTERNAL");
  const [visibility, setVisibility] = useState<"INTERNAL" | "SHARED">(
    isSubtask ? "INTERNAL" : "INTERNAL",
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setOwnerSide("INTERNAL");
      setVisibility("INTERNAL");
      if (isSubtask) setOpen(false);
    }
  }, [state.ok, isSubtask]);

  // A customer-owned task must be visible to them. Specialist sub-tasks stay internal.
  const effectiveVisibility =
    ownerSide === "CUSTOMER" ? "SHARED" : isSubtask ? "INTERNAL" : visibility;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          isSubtask
            ? "text-[12px] text-ink-3 hover:text-ink hover:underline"
            : "w-full px-4 py-2.5 text-left text-[13px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        }
      >
        {label ?? (isSubtask ? "+ Add sub-task" : "+ Add task")}
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      className={
        isSubtask
          ? "mt-2 w-full basis-full space-y-2 rounded-lg border border-border bg-surface-2 p-3"
          : "space-y-2.5 border-t border-border bg-surface-2 p-4"
      }
    >
      <input type="hidden" name="projectId" value={projectId} />
      {phaseId ? <input type="hidden" name="phaseId" value={phaseId} /> : null}
      {parentTaskId ? <input type="hidden" name="parentTaskId" value={parentTaskId} /> : null}
      <input type="hidden" name="ownerSide" value={ownerSide} />
      <input type="hidden" name="visibility" value={effectiveVisibility} />
      <FormError error={state.error} />

      <input
        name="title"
        required
        autoFocus
        placeholder={isSubtask ? "Specialist sub-task" : "What needs to happen?"}
        className={inputClass}
      />

      <div className={`grid gap-2 ${isSubtask ? "sm:grid-cols-2" : "sm:grid-cols-4"}`}>
        <select
          name="assigneeId"
          defaultValue={defaultAssigneeId ?? ""}
          className={inputClass}
          disabled={ownerSide === "CUSTOMER"}
        >
          <option value="">Unassigned</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input name="dueDate" type="date" className={inputClass} />
        {isSubtask ? null : (
          <>
            <select name="priority" defaultValue="MEDIUM" className={inputClass}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
            <input
              name="estimateHours"
              type="number"
              step="0.5"
              min="0"
              placeholder="Est. hrs"
              className={inputClass}
            />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-border-strong">
            <button
              type="button"
              onClick={() => setOwnerSide("INTERNAL")}
              className={`px-2.5 py-1 text-[12.5px] font-medium ${
                ownerSide === "INTERNAL" ? "bg-brand text-brand-ink" : "bg-surface text-ink-2"
              }`}
            >
              {isSubtask ? "Specialist" : "Our team"}
            </button>
            <button
              type="button"
              onClick={() => setOwnerSide("CUSTOMER")}
              className={`px-2.5 py-1 text-[12.5px] font-medium ${
                ownerSide === "CUSTOMER" ? "bg-violet text-white" : "bg-surface text-ink-2"
              }`}
            >
              Customer
            </button>
          </div>

          {isSubtask ? (
            <span className="text-[11.5px] text-ink-3">
              {ownerSide === "CUSTOMER"
                ? "Shows in the portal as a customer action"
                : "Staff only — customer sees the parent status"}
            </span>
          ) : (
            <button
              type="button"
              disabled={ownerSide === "CUSTOMER"}
              onClick={() => setVisibility(visibility === "SHARED" ? "INTERNAL" : "SHARED")}
              title={
                ownerSide === "CUSTOMER"
                  ? "Customer action items are always visible to them"
                  : "Toggle whether the customer can see this task"
              }
              className="disabled:opacity-70"
            >
              <VisibilityBadge visibility={effectiveVisibility} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton size="sm" pendingLabel="Adding…">
            {isSubtask ? "Add sub-task" : "Add task"}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}

export function AddPhaseForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState(createPhase, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Add phase
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input
        name="name"
        required
        autoFocus
        placeholder="Phase name"
        className={`${inputClass} w-[200px]`}
      />
      <input name="dueDate" type="date" className={`${inputClass} w-[150px]`} />
      <select name="visibility" defaultValue="SHARED" className={`${inputClass} w-[160px]`}>
        <option value="SHARED">Customer sees it</option>
        <option value="INTERNAL">Internal only</option>
      </select>
      <SubmitButton size="sm">Add</SubmitButton>
      <Button size="sm" type="button" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      <FormError error={state.error} />
    </form>
  );
}
