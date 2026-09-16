"use client";

import { useMemo, useState, useTransition } from "react";
import { moveTask } from "@/actions/tasks";
import { Button, Field, inputClass } from "@/components/ui";
import { descendantIdsOf, parentOptionsForPhase, type MoveTaskNode } from "@/lib/task-move";
import { cn } from "@/lib/cn";

export type MoveTaskPhaseOption = { id: string; name: string };

type MoveTaskDialogProps = {
  taskId: string;
  title: string;
  currentPhaseId: string | null;
  currentParentTaskId: string | null;
  phases: MoveTaskPhaseOption[];
  tasks: MoveTaskNode[];
  compact?: boolean;
  onClose: () => void;
};

export function MoveTaskControl({
  compact = false,
  buttonClassName,
  ...props
}: Omit<MoveTaskDialogProps, "onClose"> & { buttonClassName?: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          buttonClassName ?? "text-[13px] text-ink-3 hover:text-ink hover:underline"
        }
      >
        Move…
      </button>
    );
  }
  return <MoveTaskDialog {...props} compact={compact} onClose={() => setOpen(false)} />;
}

export function MoveTaskDialog({
  taskId,
  title,
  currentPhaseId,
  currentParentTaskId,
  phases,
  tasks,
  compact = false,
  onClose,
}: MoveTaskDialogProps) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [phaseId, setPhaseId] = useState<string>(currentPhaseId ?? "");
  const [parentTaskId, setParentTaskId] = useState<string>(currentParentTaskId ?? "");

  const selectedPhaseId = phaseId === "" ? null : phaseId;
  const parentOptions = useMemo(
    () => parentOptionsForPhase(taskId, selectedPhaseId, tasks),
    [taskId, selectedPhaseId, tasks],
  );
  const nestedCount = useMemo(() => descendantIdsOf(taskId, tasks).size, [taskId, tasks]);

  const parentStillValid = parentOptions.some((p) => p.id === parentTaskId);
  const effectiveParentId = parentStillValid ? parentTaskId : "";

  function onPhaseChange(next: string) {
    setPhaseId(next);
    const nextPhase = next === "" ? null : next;
    const still = parentOptionsForPhase(taskId, nextPhase, tasks).some((p) => p.id === parentTaskId);
    if (!still) setParentTaskId("");
  }

  function confirm() {
    setError(null);
    start(async () => {
      try {
        await moveTask(taskId, selectedPhaseId, effectiveParentId || null);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not move that task.");
      }
    });
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-lg border border-border bg-surface-2",
        compact ? "mt-2 p-3" : "p-4",
      )}
    >
      <p className="text-[13px] font-medium text-ink">Move “{title}”</p>
      <Field label="Section" htmlFor={`move-phase-${taskId}`}>
        <select
          id={`move-phase-${taskId}`}
          value={phaseId}
          onChange={(e) => onPhaseChange(e.target.value)}
          className={inputClass}
          disabled={pending}
        >
          {phases.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="">Unphased</option>
        </select>
      </Field>
      <Field
        label="Parent task"
        htmlFor={`move-parent-${taskId}`}
        hint="Top-level puts this item directly in the section. Nested sub-tasks stay with it."
      >
        <select
          id={`move-parent-${taskId}`}
          value={effectiveParentId}
          onChange={(e) => setParentTaskId(e.target.value)}
          className={inputClass}
          disabled={pending}
        >
          <option value="">Top-level in this section</option>
          {parentOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {`${"\u00A0".repeat(p.depth * 2)}${p.depth > 0 ? "↳ " : ""}${p.title}`}
            </option>
          ))}
        </select>
      </Field>
      {nestedCount > 0 ? (
        <p className="text-[12px] text-ink-3">
          {nestedCount} nested item{nestedCount === 1 ? "" : "s"} will stay under this task.
        </p>
      ) : null}
      {error ? <p className="text-[12px] text-red">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" type="button" variant="primary" disabled={pending} onClick={confirm}>
          {pending ? "Moving…" : "Move"}
        </Button>
        <Button size="sm" type="button" variant="secondary" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
