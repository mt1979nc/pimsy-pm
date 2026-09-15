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
  addTemplateTaskChecklistItem,
  removeTemplateTaskChecklistItem,
  attachLibraryToTemplateTask,
  detachLibraryFromTemplateTask,
  bulkSetTemplateArea,
} from "@/actions/templates";
import { DuplicateTemplateButton } from "../duplicate-template-button";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Badge, Button, Card, CardHeader, Field, LinkButton, VisibilityBadge, inputClass } from "@/components/ui";
import { STAFFING_ROLES, STAFFING_ROLE_LABELS, staffingRoleLabel } from "@/lib/staffing";
import {
  OPTIONAL_AREA_CATALOG,
  PLAYBOOK_PATH_META,
  collectTemplateAreaRows,
  optionalAreaLabel,
} from "@/lib/playbook-meta";
import type { PlaybookPath, WorkTrack } from "@/db/schema";
import { playbookResourceButtonLabel } from "@/lib/playbook-resources";

type LibraryOption = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  isPlaceholder: boolean;
};

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
  checklistItems: Array<{ id: string; label: string; visibility: "INTERNAL" | "SHARED" }>;
  attachments: Array<{
    id: string;
    name: string;
    kind: string;
    isPlaceholder: boolean;
    libraryAssetId: string;
    url: string | null;
  }>;
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

/** Keep drag order, append newly created ids, drop deleted ones. */
function mergeOrder(current: string[], incoming: string[]): string[] {
  const incomingSet = new Set(incoming);
  const kept = current.filter((id) => incomingSet.has(id));
  const keptSet = new Set(kept);
  const added = incoming.filter((id) => !keptSet.has(id));
  if (kept.length === current.length && added.length === 0) return current;
  return [...kept, ...added];
}

function AreaKeyFields({
  idPrefix,
  value,
  extraKeys,
}: {
  idPrefix: string;
  value: string | null;
  extraKeys: string[];
}) {
  const keys = [...new Set([...Object.keys(OPTIONAL_AREA_CATALOG), ...extraKeys, value ?? ""].filter(Boolean))];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Area key">
        <select id={`${idPrefix}-area`} name="areaKey" defaultValue={value ?? ""} className={inputClass}>
          <option value="">— none —</option>
          {keys.map((key) => (
            <option key={key} value={key}>
              {optionalAreaLabel(key)} ({key})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Or custom area key" htmlFor={`${idPrefix}-area-custom`}>
        <input
          id={`${idPrefix}-area-custom`}
          name="areaKeyCustom"
          placeholder="e.g. labs"
          className={inputClass}
        />
      </Field>
    </div>
  );
}

export function TemplateEditor({
  template,
  library,
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
  library: LibraryOption[];
}) {
  const [metaState, metaAction] = useActionState(updateTemplateMeta, {});
  const [phaseOrder, setPhaseOrder] = useState(template.phases.map((p) => p.id));
  const [pending, start] = useTransition();
  const [dragPhase, setDragPhase] = useState<string | null>(null);
  const [areaFilter, setAreaFilter] = useState("");

  const incomingPhaseIds = template.phases.map((p) => p.id);
  const nextPhaseOrder = mergeOrder(phaseOrder, incomingPhaseIds);
  if (nextPhaseOrder !== phaseOrder) setPhaseOrder(nextPhaseOrder);

  const phaseById = new Map(template.phases.map((p) => [p.id, p]));
  const orderedPhases = nextPhaseOrder.map((id) => phaseById.get(id)).filter(Boolean) as EditorPhase[];
  const extraKeys = [
    ...new Set(
      template.phases.flatMap((p) => [p.areaKey, ...p.tasks.map((t) => t.areaKey)]).filter(Boolean) as string[],
    ),
  ];
  const areaRows = collectTemplateAreaRows(template.phases);

  function onDropPhase(targetId: string) {
    if (!dragPhase || dragPhase === targetId) return;
    const next = nextPhaseOrder.filter((id) => id !== dragPhase);
    const idx = next.indexOf(targetId);
    next.splice(idx, 0, dragPhase);
    setPhaseOrder(next);
    setDragPhase(null);
    start(() => reorderTemplatePhases(template.id, next));
  }

  const visiblePhases = areaFilter
    ? orderedPhases.filter(
        (p) =>
          p.areaKey === areaFilter ||
          p.tasks.some((t) => t.areaKey === areaFilter),
      )
    : orderedPhases;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Playbook"
          subtitle="Used when creating a new workspace. Rename here. Duplicate makes a custom copy so the four site-creation paths stay unique. Changes here do not rewrite live projects."
          action={<DuplicateTemplateButton templateId={template.id} name={template.name} />}
        />
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

      <AreasPanel templateId={template.id} rows={areaRows} filter={areaFilter} onFilter={setAreaFilter} />

      <Card>
        <CardHeader title="Phases" subtitle="Jump to a section. Drag the handle on a phase card to reorder." />
        <ol className="flex flex-wrap gap-1.5 p-4">
          {orderedPhases.map((phase, i) => (
            <li key={phase.id}>
              <a
                href={`#phase-${phase.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[12.5px] text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                <span className="tabular-nums text-ink-3">{i + 1}</span>
                {phase.name}
              </a>
            </li>
          ))}
        </ol>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-ink-3">
          Drag the handle to reorder phases or tasks. Add nested subtasks, descriptions, training
          areas, and library files — this is the Dock-style playbook editor.
        </p>
        {pending ? <span className="text-[12px] text-ink-3">Saving order…</span> : null}
      </div>

      {visiblePhases.map((phase) => (
        <div
          key={phase.id}
          id={`phase-${phase.id}`}
          onDragOver={(e) => {
            if (dragPhase) e.preventDefault();
          }}
          onDrop={() => onDropPhase(phase.id)}
        >
          <PhaseEditor
            phase={phase}
            templateId={template.id}
            extraKeys={extraKeys}
            library={library}
            dragging={dragPhase === phase.id}
            onDragStart={() => setDragPhase(phase.id)}
            onDragEnd={() => setDragPhase(null)}
          />
        </div>
      ))}

      <AddPhaseCard templateId={template.id} extraKeys={extraKeys} />
    </div>
  );
}

function AreasPanel({
  templateId,
  rows,
  filter,
  onFilter,
}: {
  templateId: string;
  rows: ReturnType<typeof collectTemplateAreaRows>;
  filter: string;
  onFilter: (key: string) => void;
}) {
  const [state, action] = useActionState(bulkSetTemplateArea, {});
  return (
    <Card>
      <CardHeader
        title="Optional areas"
        subtitle="These keys drive include/exclude on New project. Bulk-mark optional here instead of opening every task. Filter the editor to one area."
      />
      <div className="space-y-3 p-5">
        <FormError error={state.error} />
        {state.ok ? (
          <p className="rounded-lg bg-green-soft px-3 py-2 text-[12.5px] text-green">Area flags saved.</p>
        ) : null}
        {rows.length === 0 ? (
          <p className="text-[13px] text-ink-3">
            No area keys yet. Set an area on a phase or task (catalog or custom) to make it optional
            on create.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.key}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => onFilter(filter === row.key ? "" : row.key)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block text-[13px] font-medium text-ink">{row.label}</span>
                  <span className="block text-[12px] text-ink-3">
                    {row.hint ? `${row.hint} · ` : ""}
                    {row.phaseCount} phase{row.phaseCount === 1 ? "" : "s"} · {row.taskCount} task
                    {row.taskCount === 1 ? "" : "s"} · {row.optionalCount} optional
                    {filter === row.key ? " · filtering" : ""}
                  </span>
                </button>
                <form action={action}>
                  <input type="hidden" name="templateId" value={templateId} />
                  <input type="hidden" name="areaKey" value={row.key} />
                  <input type="hidden" name="mode" value="mark-optional" />
                  <SubmitButton size="sm">Mark optional</SubmitButton>
                </form>
                <form action={action}>
                  <input type="hidden" name="templateId" value={templateId} />
                  <input type="hidden" name="areaKey" value={row.key} />
                  <input type="hidden" name="mode" value="clear-optional" />
                  <SubmitButton size="sm" variant="secondary">
                    Include always
                  </SubmitButton>
                </form>
              </div>
            ))}
          </div>
        )}
        {filter ? (
          <Button size="sm" type="button" onClick={() => onFilter("")}>
            Clear area filter
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function PhaseEditor({
  phase,
  templateId,
  extraKeys,
  library,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  phase: EditorPhase;
  templateId: string;
  extraKeys: string[];
  library: LibraryOption[];
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

  const incomingTaskIds = phase.tasks.map((t) => t.id);
  const nextTaskOrder = mergeOrder(taskOrder, incomingTaskIds);
  if (nextTaskOrder !== taskOrder) setTaskOrder(nextTaskOrder);

  const taskById = new Map(phase.tasks.map((t) => [t.id, t]));
  const orderedTasks = nextTaskOrder.map((id) => taskById.get(id)).filter(Boolean) as EditorTask[];
  const parents = orderedTasks.filter((t) => !t.parentTaskId);

  function onDropTask(targetId: string) {
    if (!dragTask || dragTask === targetId) return;
    const next = nextTaskOrder.filter((id) => id !== dragTask);
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
            {phase.areaKey ? ` · ${optionalAreaLabel(phase.areaKey)}` : ""}
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
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" name="isOptional" defaultChecked={phase.isOptional} />
            Optional area (can exclude on create)
          </label>
          <AreaKeyFields idPrefix={`ph-${phase.id}`} value={phase.areaKey} extraKeys={extraKeys} />
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
              siblings={orderedTasks.filter((p) => p.id !== task.id && p.parentTaskId !== task.id)}
              extraKeys={extraKeys}
              library={library}
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
        {parents.length > 0 ? (
          <Field label="Nest under (optional)">
            <select name="parentTaskId" defaultValue="" className={inputClass}>
              <option value="">Top-level in this phase</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <p className="text-[11.5px] text-ink-3">
          New tasks land at the end of this phase. Nest under a section task to match Dock checklists.
          Drag to reorder.
        </p>
      </form>
      <p className="hidden">{templateId}</p>
    </Card>
  );
}

function TaskEditor({
  task,
  siblings,
  extraKeys,
  library,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  task: EditorTask;
  siblings: EditorTask[];
  extraKeys: string[];
  library: LibraryOption[];
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(updateTemplateTask, {});
  const [checkState, checkAction] = useActionState(addTemplateTaskChecklistItem, {});
  const [attState, attAction] = useActionState(attachLibraryToTemplateTask, {});
  const [pending, start] = useTransition();
  const attachedIds = new Set(task.attachments.map((a) => a.libraryAssetId));
  const attachable = library.filter((l) => !attachedIds.has(l.id));

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
            {task.checklistItems.length > 0 ? (
              <Badge>{task.checklistItems.length} checklist items</Badge>
            ) : null}
            {task.attachments.map((att) => (
              <Badge key={att.id} tone={att.kind === "LINK" ? "green" : "neutral"}>
                {att.kind === "LINK" ? "Link" : att.isPlaceholder ? "Placeholder" : "File"}: {att.name}
              </Badge>
            ))}
          </div>
          {task.description ? (
            <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-3">{task.description}</p>
          ) : null}
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
        <div className="space-y-4 bg-surface-2 px-5 py-3">
          <form action={action} className="space-y-3">
            <input type="hidden" name="taskId" value={task.id} />
            <FormError error={state.error} />
            <Field label="Title">
              <input name="title" defaultValue={task.title} className={inputClass} />
            </Field>
            <Field label="Description">
              <textarea
                name="description"
                rows={4}
                defaultValue={task.description ?? ""}
                className={inputClass}
                placeholder="Dock task notes — training cues, links the specialist should use, what “done” looks like."
              />
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
            {siblings.length > 0 || task.parentTaskId ? (
              <Field label="Nest under">
                <select name="parentTaskId" defaultValue={task.parentTaskId ?? ""} className={inputClass}>
                  <option value="">Top-level</option>
                  {siblings.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <input type="hidden" name="parentTaskId" value="" />
            )}
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
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" name="isOptional" defaultChecked={task.isOptional} />
              Optional
            </label>
            <AreaKeyFields idPrefix={`tk-${task.id}`} value={task.areaKey} extraKeys={extraKeys} />
            <SubmitButton size="sm">Save task</SubmitButton>
          </form>

          <div className="rounded-lg border border-border bg-surface">
            <div className="border-b border-border px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3">
              Training checklist
            </div>
            {task.checklistItems.length === 0 ? (
              <p className="px-3 py-2 text-[12.5px] text-ink-3">
                No areas listed. Add the topics this session should cover; new projects copy them.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {task.checklistItems.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 px-3 py-1.5">
                    <span className="min-w-0 flex-1 text-[13px] text-ink">{item.label}</span>
                    {item.visibility === "INTERNAL" ? (
                      <span className="text-[11px] uppercase tracking-wide text-ink-3">Team only</span>
                    ) : null}
                    <button
                      type="button"
                      className="text-[12px] text-ink-3 hover:text-red"
                      onClick={() => start(() => removeTemplateTaskChecklistItem(item.id))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form action={checkAction} className="flex flex-wrap items-end gap-2 border-t border-border px-3 py-2">
              <input type="hidden" name="taskId" value={task.id} />
              <input
                name="label"
                required
                maxLength={300}
                placeholder="Add an area to cover"
                className={`${inputClass} min-w-[200px] flex-1`}
              />
              <select name="visibility" defaultValue="SHARED" className={inputClass}>
                <option value="SHARED">Shared</option>
                <option value="INTERNAL">Internal</option>
              </select>
              <SubmitButton size="sm">Add</SubmitButton>
              <FormError error={checkState.error} />
            </form>
          </div>

          <div className="rounded-lg border border-border bg-surface">
            <div className="border-b border-border px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3">
              Default attachments
            </div>
            {task.attachments.length === 0 ? (
              <p className="px-3 py-2 text-[12.5px] text-ink-3">
                No library files on this task. Attach Discovery Wizard, billing sheets, or other
                library rows — new workspaces clone them.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {task.attachments.map((att) => (
                  <li key={att.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                    <span className="min-w-0 flex-1 text-[13px] text-ink">
                      {att.name}
                      <span className="ml-2 text-[11.5px] text-ink-3">
                        {att.kind === "LINK" ? "Link" : att.isPlaceholder ? "Placeholder" : "File"}
                      </span>
                    </span>
                    {att.kind === "LINK" && att.url ? (
                      <LinkButton href={att.url} size="sm" target="_blank" rel="noopener noreferrer">
                        {playbookResourceButtonLabel({
                          kind: "LINK",
                          name: att.name,
                          url: att.url,
                        })}
                      </LinkButton>
                    ) : (
                      <LinkButton href={`/api/library/${att.libraryAssetId}`} size="sm">
                        {playbookResourceButtonLabel({ kind: att.kind, name: att.name })}
                      </LinkButton>
                    )}
                    <button
                      type="button"
                      className="text-[12px] text-ink-3 hover:text-red"
                      onClick={() => start(() => detachLibraryFromTemplateTask(att.id))}
                    >
                      Detach
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {attachable.length > 0 ? (
              <form action={attAction} className="flex flex-wrap items-end gap-2 border-t border-border px-3 py-2">
                <input type="hidden" name="taskId" value={task.id} />
                <select name="libraryAssetId" required className={`${inputClass} min-w-[220px] flex-1`}>
                  <option value="">Attach a library file…</option>
                  {attachable.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.kind === "LINK" ? "link" : l.isPlaceholder ? "placeholder" : "file"})
                    </option>
                  ))}
                </select>
                <SubmitButton size="sm">Attach</SubmitButton>
                <FormError error={attState.error} />
              </form>
            ) : (
              <p className="border-t border-border px-3 py-2 text-[12px] text-ink-3">
                Every library file is already on this task, or the library is empty. Replace binaries
                at File library.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AddPhaseCard({ templateId, extraKeys }: { templateId: string; extraKeys: string[] }) {
  const [state, action] = useActionState(createTemplatePhase, {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return <Button onClick={() => setOpen(true)}>Add phase</Button>;
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
        <AreaKeyFields idPrefix="new-ph" value={null} extraKeys={extraKeys} />
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
