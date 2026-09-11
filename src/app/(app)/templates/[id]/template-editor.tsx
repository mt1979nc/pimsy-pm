"use client";

import { useActionState, useState, useTransition } from "react";
import {
  updateTemplateMeta,
  createTemplatePhase,
  updateTemplatePhase,
  deleteTemplatePhase,
  reorderTemplatePhases,
  createTemplateTask,
  updateTemplateTask,
  deleteTemplateTask,
  reorderTemplateTasks,
} from "@/actions/templates";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Badge, Button, Card, CardHeader, Field, VisibilityBadge, inputClass } from "@/components/ui";
import { STAFFING_ROLES, STAFFING_ROLE_LABELS, staffingRoleLabel } from "@/lib/staffing";
import { OPTIONAL_AREA_CATALOG, PLAYBOOK_PATH_META } from "@/lib/playbook-meta";
import type { PlaybookPath, WorkTrack } from "@/db/schema";

type EditorTask = {
  id: string;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  order: number;
  priority: string;
  visibility: "INTERNAL" | "SHARED";
  ownerSide: "INTERNAL" | "CUSTOMER";
  offsetDays: number;
  durationDays: number;
  isOptional: boolean;
  areaKey: string | null;
  defaultRole: string | null;
  workTrack: WorkTrack;
  overlapKey: string | null;
};

type EditorPhase = {
  id: string;
  name: string;
  description: string | null;
  order: number;
  visibility: "INTERNAL" | "SHARED";
  offsetDays: number;
  durationDays: number;
  isOptional: boolean;
  areaKey: string | null;
  workTrack: WorkTrack;
  tasks: EditorTask[];
};

export function TemplateEditor({
  template,
}: {
  template: {
    id: string;
    name: string;
    description: string | null;
    durationDays: number;
    isActive: boolean;
    playbookPath: PlaybookPath | null;
    phases: EditorPhase[];
  };
}) {
  const [metaState, metaAction] = useActionState(updateTemplateMeta, {});
  const [phaseOrder, setPhaseOrder] = useState(template.phases.map((p) => p.id));
  const [pending, start] = useTransition();
  const [dragPhase, setDragPhase] = useState<string | null>(null);

  const phaseById = new Map(template.phases.map((p) => [p.id, p]));
  const orderedPhases = phaseOrder.map((id) => phaseById.get(id)).filter(Boolean) as EditorPhase[];

  function onDropPhase(targetId: string) {
    if (!dragPhase || dragPhase === targetId) return;
    const next = phaseOrder.filter((id) => id !== dragPhase);
    const idx = next.indexOf(targetId);
    next.splice(idx, 0, dragPhase);
    setPhaseOrder(next);
    setDragPhase(null);
    start(() => reorderTemplatePhases(template.id, next));
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Playbook" subtitle="Used when creating a new workspace. Changes here do not rewrite live projects." />
        <form action={metaAction} className="space-y-4 p-5">
          <input type="hidden" name="templateId" value={template.id} />
          <FormError error={metaState.error} />
          {metaState.ok ? (
            <p className="rounded-lg bg-green-soft px-3 py-2 text-[12.5px] text-green">Saved.</p>
          ) : null}
          <Field label="Name" htmlFor="tplName">
            <input id="tplName" name="name" defaultValue={template.name} required className={inputClass} />
          </Field>
          <Field label="Description" htmlFor="tplDesc">
            <textarea id="tplDesc" name="description" rows={2} defaultValue={template.description ?? ""} className={inputClass} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Typical duration (days)" htmlFor="tplDays">
              <input
                id="tplDays"
                name="durationDays"
                type="number"
                min={1}
                defaultValue={template.durationDays}
                className={inputClass}
              />
            </Field>
            <Field label="Playbook path" htmlFor="tplPath">
              <select id="tplPath" name="playbookPath" defaultValue={template.playbookPath ?? ""} className={inputClass}>
                <option value="">— Custom —</option>
                {Object.entries(PLAYBOOK_PATH_META).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.title}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 pt-6 text-[13px] text-ink-2">
              <input type="checkbox" name="isActive" defaultChecked={template.isActive} />
              Active (shown on create)
            </label>
          </div>
          <div className="flex justify-end">
            <SubmitButton size="sm">Save playbook</SubmitButton>
          </div>
        </form>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-ink-3">
          Drag the handle to reorder phases or tasks. Add, remove, and edit freely — this is the
          Dock-style playbook editor.
        </p>
        {pending ? <span className="text-[12px] text-ink-3">Saving order…</span> : null}
      </div>

      {orderedPhases.map((phase) => (
        <div
          key={phase.id}
          onDragOver={(e) => {
            if (dragPhase) e.preventDefault();
          }}
          onDrop={() => onDropPhase(phase.id)}
        >
          <PhaseEditor
            phase={phase}
            templateId={template.id}
            dragging={dragPhase === phase.id}
            onDragStart={() => setDragPhase(phase.id)}
            onDragEnd={() => setDragPhase(null)}
          />
        </div>
      ))}

      <AddPhaseCard templateId={template.id} />
    </div>
  );
}

function PhaseEditor({
  phase,
  templateId,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  phase: EditorPhase;
  templateId: string;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [taskState, taskAction] = useActionState(createTemplateTask, {});
  const [phaseState, phaseAction] = useActionState(updateTemplatePhase, {});
  const [pending, start] = useTransition();
  const [taskOrder, setTaskOrder] = useState(phase.tasks.map((t) => t.id));
  const [dragTask, setDragTask] = useState<string | null>(null);

  const taskById = new Map(phase.tasks.map((t) => [t.id, t]));
  const orderedTasks = taskOrder.map((id) => taskById.get(id)).filter(Boolean) as EditorTask[];

  function onDropTask(targetId: string) {
    if (!dragTask || dragTask === targetId) return;
    const next = taskOrder.filter((id) => id !== dragTask);
    const idx = next.indexOf(targetId);
    next.splice(idx, 0, dragTask);
    setTaskOrder(next);
    setDragTask(null);
    start(() => reorderTemplateTasks(phase.id, next));
  }

  return (
    <Card className={dragging ? "opacity-60" : undefined}>
      <div className="flex items-start gap-2 border-b border-border px-3 py-3">
        <button
          type="button"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          aria-label={`Drag to reorder ${phase.name}`}
          className="mt-0.5 cursor-grab touch-none px-1 text-ink-3 hover:text-ink"
        >
          <GripIcon />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-ink">{phase.name}</span>
            {phase.isOptional ? <Badge tone="amber">Optional</Badge> : null}
            {phase.workTrack === "RCM" ? <Badge tone="violet">RCM</Badge> : null}
            <VisibilityBadge visibility={phase.visibility} />
            <Badge>{phase.tasks.length} tasks</Badge>
          </div>
          <p className="mt-0.5 text-[12px] text-ink-3">
            day {phase.offsetDays}–{phase.offsetDays + phase.durationDays}
            {phase.areaKey ? ` · ${phase.areaKey}` : ""}
          </p>
        </div>
        <Button size="sm" type="button" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Edit phase"}
        </Button>
        <Button
          size="sm"
          variant="danger"
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm(`Remove phase “${phase.name}” and its tasks from the template?`)) {
              start(() => deleteTemplatePhase(phase.id));
            }
          }}
        >
          Remove
        </Button>
      </div>

      {open ? (
        <form action={phaseAction} className="space-y-3 border-b border-border bg-surface-2 p-4">
          <input type="hidden" name="phaseId" value={phase.id} />
          <FormError error={phaseState.error} />
          <Field label="Phase name" htmlFor={`ph-${phase.id}-name`}>
            <input id={`ph-${phase.id}-name`} name="name" defaultValue={phase.name} className={inputClass} />
          </Field>
          <Field label="Description" htmlFor={`ph-${phase.id}-desc`}>
            <input
              id={`ph-${phase.id}-desc`}
              name="description"
              defaultValue={phase.description ?? ""}
              className={inputClass}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Offset days">
              <input name="offsetDays" type="number" defaultValue={phase.offsetDays} className={inputClass} />
            </Field>
            <Field label="Duration days">
              <input name="durationDays" type="number" defaultValue={phase.durationDays} className={inputClass} />
            </Field>
            <Field label="Visibility">
              <select name="visibility" defaultValue={phase.visibility} className={inputClass}>
                <option value="SHARED">Customer sees it</option>
                <option value="INTERNAL">Internal only</option>
              </select>
            </Field>
            <Field label="Track">
              <select name="workTrack" defaultValue={phase.workTrack} className={inputClass}>
                <option value="EHR">EHR</option>
                <option value="RCM">RCM</option>
                <option value="SHARED">Shared</option>
              </select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" name="isOptional" defaultChecked={phase.isOptional} />
              Optional area (can exclude on create)
            </label>
            <Field label="Area key">
              <select name="areaKey" defaultValue={phase.areaKey ?? ""} className={inputClass}>
                <option value="">— none —</option>
                {Object.entries(OPTIONAL_AREA_CATALOG).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <SubmitButton size="sm">Save phase</SubmitButton>
        </form>
      ) : null}

      <div className="divide-y divide-border">
        {orderedTasks.map((task) => (
          <div
            key={task.id}
            onDragOver={(e) => {
              if (dragTask) e.preventDefault();
            }}
            onDrop={() => onDropTask(task.id)}
          >
            <TaskEditor
              task={task}
              dragging={dragTask === task.id}
              onDragStart={() => setDragTask(task.id)}
              onDragEnd={() => setDragTask(null)}
            />
          </div>
        ))}
      </div>

      <form action={taskAction} className="space-y-2 border-t border-border bg-surface-2 p-4">
        <input type="hidden" name="phaseId" value={phase.id} />
        <FormError error={taskState.error} />
        <div className="grid gap-2 sm:grid-cols-[1fr_160px_140px_auto]">
          <input name="title" required placeholder="Add a task…" className={inputClass} />
          <select name="ownerSide" defaultValue="INTERNAL" className={inputClass}>
            <option value="INTERNAL">Our team</option>
            <option value="CUSTOMER">Customer</option>
          </select>
          <select name="defaultRole" defaultValue="IMPLEMENTATION_SPECIALIST" className={inputClass}>
            <option value="">No auto-assign</option>
            {STAFFING_ROLES.map((r) => (
              <option key={r} value={r}>
                {STAFFING_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <SubmitButton size="sm">Add task</SubmitButton>
        </div>
        <p className="text-[11.5px] text-ink-3">New tasks land at the end of this phase. Drag to reorder.</p>
      </form>
      <p className="hidden">{templateId}</p>
    </Card>
  );
}

function TaskEditor({
  task,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  task: EditorTask;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(updateTemplateTask, {});
  const [pending, start] = useTransition();

  return (
    <div className={dragging ? "opacity-50" : undefined}>
      <div className="flex items-start gap-2 px-3 py-2 hover:bg-surface-2">
        <button
          type="button"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          aria-label={`Drag to reorder ${task.title}`}
          className="mt-0.5 cursor-grab touch-none px-1 text-ink-3 hover:text-ink"
        >
          <GripIcon />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {task.parentTaskId ? <span className="text-[11px] text-ink-3">↳</span> : null}
            <span className="text-[13px] text-ink">{task.title}</span>
            {task.ownerSide === "CUSTOMER" ? <Badge tone="violet">Customer</Badge> : null}
            {task.isOptional ? <Badge tone="amber">Optional</Badge> : null}
            {task.defaultRole ? <Badge>{staffingRoleLabel(task.defaultRole)}</Badge> : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[12px] text-brand hover:underline"
        >
          {open ? "Close" : "Edit"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm(`Remove “${task.title}” from the template?`)) {
              start(() => deleteTemplateTask(task.id));
            }
          }}
          className="text-[12px] text-ink-3 hover:text-red hover:underline"
        >
          Remove
        </button>
      </div>
      {open ? (
        <form action={action} className="space-y-3 bg-surface-2 px-5 py-3">
          <input type="hidden" name="taskId" value={task.id} />
          <FormError error={state.error} />
          <Field label="Title">
            <input name="title" defaultValue={task.title} className={inputClass} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Owner">
              <select name="ownerSide" defaultValue={task.ownerSide} className={inputClass}>
                <option value="INTERNAL">Our team</option>
                <option value="CUSTOMER">Customer</option>
              </select>
            </Field>
            <Field label="Visibility">
              <select name="visibility" defaultValue={task.visibility} className={inputClass}>
                <option value="INTERNAL">Internal</option>
                <option value="SHARED">Shared</option>
              </select>
            </Field>
            <Field label="Default role">
              <select name="defaultRole" defaultValue={task.defaultRole ?? ""} className={inputClass}>
                <option value="">No auto-assign</option>
                {STAFFING_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {STAFFING_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Offset">
              <input name="offsetDays" type="number" defaultValue={task.offsetDays} className={inputClass} />
            </Field>
            <Field label="Duration">
              <input name="durationDays" type="number" defaultValue={task.durationDays} className={inputClass} />
            </Field>
            <Field label="Track">
              <select name="workTrack" defaultValue={task.workTrack} className={inputClass}>
                <option value="EHR">EHR</option>
                <option value="RCM">RCM</option>
                <option value="SHARED">Shared</option>
              </select>
            </Field>
            <Field label="Overlap key">
              <input name="overlapKey" defaultValue={task.overlapKey ?? ""} className={inputClass} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" name="isOptional" defaultChecked={task.isOptional} />
              Optional
            </label>
            <Field label="Area key">
              <select name="areaKey" defaultValue={task.areaKey ?? ""} className={inputClass}>
                <option value="">— none —</option>
                {Object.entries(OPTIONAL_AREA_CATALOG).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <SubmitButton size="sm">Save task</SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function AddPhaseCard({ templateId }: { templateId: string }) {
  const [state, action] = useActionState(createTemplatePhase, {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>Add phase</Button>
    );
  }
  return (
    <Card>
      <CardHeader title="New phase" />
      <form action={action} className="space-y-3 p-5">
        <input type="hidden" name="templateId" value={templateId} />
        <FormError error={state.error} />
        <Field label="Name">
          <input name="name" required autoFocus className={inputClass} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Offset days">
            <input name="offsetDays" type="number" defaultValue={0} className={inputClass} />
          </Field>
          <Field label="Duration days">
            <input name="durationDays" type="number" defaultValue={7} className={inputClass} />
          </Field>
          <Field label="Visibility">
            <select name="visibility" defaultValue="SHARED" className={inputClass}>
              <option value="SHARED">Customer sees it</option>
              <option value="INTERNAL">Internal only</option>
            </select>
          </Field>
        </div>
        <div className="flex items-center gap-2">
          <SubmitButton size="sm">Add phase</SubmitButton>
          <Button size="sm" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}
