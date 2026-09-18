"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, Badge, Button, VisibilityBadge, EmptyState } from "@/components/ui";
import { TaskRow, type TaskRowData } from "@/components/task-row";
import { TaskListToolbar } from "@/components/task-list-toolbar";
import { CollapsibleCompleted } from "@/components/collapsible-completed";
import { AddTaskInline, AddPhaseForm } from "@/app/(app)/projects/[id]/tasks/task-forms";
import {
  AddRcmOnSummary,
  AddRcmTrackForm,
  type AddRcmSummary,
} from "@/app/(app)/projects/[id]/settings/add-rcm-track-form";
import { ADD_RCM_HASH, addRcmHashShouldExpand, addRcmPanelView } from "@/lib/add-rcm";
import { PhaseNaButton } from "@/app/(app)/projects/[id]/tasks/phase-na-button";
import { PhaseVisibilityButton } from "@/app/(app)/projects/[id]/tasks/phase-visibility-button";
import type { MoveTaskPhaseOption } from "@/components/move-task-dialog";
import type { MoveTaskNode } from "@/lib/task-move";
import { fmtShort } from "@/lib/dates";
import {
  excludeCollapsedDescendants,
  filterNestedTasks,
  isSectionComplete,
  partitionCompletedGroups,
  sortSectionsByCompletion,
  type TaskListView,
} from "@/lib/task-list-filter";
import type { ChecklistItemView } from "@/components/task-checklist";
import type { TaskActionAsset } from "@/lib/playbook-resources";
import type { BookingUrlMap } from "@/lib/booking-urls";

export type ProjectTaskListItem = TaskRowData & {
  assigneeId?: string | null;
  assigneeIds?: string[];
  order: number;
  description?: string | null;
  parentTaskId: string | null;
};

type StaffOption = { id: string; name: string | null };

type PhaseBlock = {
  id: string;
  name: string;
  visibility: "INTERNAL" | "SHARED";
  notApplicable: boolean;
  workTrack?: "EHR" | "RCM" | "SHARED" | null;
  dueDate: string | null;
  tasks: ProjectTaskListItem[];
};

function childIdsOf(tasks: ProjectTaskListItem[]): Set<string> {
  const ids = new Set<string>();
  for (const t of tasks) {
    if (t.parentTaskId) ids.add(t.parentTaskId);
  }
  return ids;
}

function PhaseTaskRows({
  projectId,
  tasks,
  staff,
  defaultAssigneeId,
  assetsByTaskId,
  bookingUrls,
  checklistByTaskId,
  allowStructureEdit,
  movePhases,
  moveTasks,
  onPreviewChange,
}: {
  projectId: string;
  tasks: ProjectTaskListItem[];
  staff: StaffOption[];
  defaultAssigneeId?: string;
  assetsByTaskId: Record<string, TaskActionAsset[]>;
  bookingUrls?: BookingUrlMap | null;
  checklistByTaskId: Record<string, ChecklistItemView[]>;
  allowStructureEdit: boolean;
  movePhases: MoveTaskPhaseOption[];
  moveTasks: MoveTaskNode[];
  onPreviewChange?: (
    taskId: string,
    patch: { status?: ProjectTaskListItem["status"]; notApplicable?: boolean },
  ) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const parentsWithChildren = childIdsOf(tasks);
  const visible = excludeCollapsedDescendants(tasks, collapsed);

  return (
    <>
      {visible.map((t) => (
        <TaskRow
          key={t.id}
          task={{ ...t, projectId }}
          allowStructureEdit={allowStructureEdit}
          staff={staff}
          defaultAssigneeId={defaultAssigneeId}
          assets={assetsByTaskId[t.id]}
          bookingUrls={bookingUrls}
          checklist={checklistByTaskId[t.id] ?? []}
          hasChildren={parentsWithChildren.has(t.id)}
          childrenCollapsed={collapsed.has(t.id)}
          movePhases={movePhases}
          moveTasks={moveTasks}
          onPreviewChange={
            onPreviewChange ? (patch) => onPreviewChange(t.id, patch) : undefined
          }
          onToggleChildren={
            parentsWithChildren.has(t.id)
              ? () =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(t.id)) next.delete(t.id);
                    else next.add(t.id);
                    return next;
                  })
              : undefined
          }
        />
      ))}
    </>
  );
}

export function ProjectTaskBoard({
  projectId,
  currentUserId,
  defaultAssigneeId,
  staff,
  phases,
  unphased,
  assetsByTaskId,
  bookingUrls,
  checklistByTaskId,
  addRcm,
  rcmSummary,
}: {
  projectId: string;
  currentUserId: string;
  defaultAssigneeId?: string;
  staff: StaffOption[];
  phases: PhaseBlock[];
  unphased: ProjectTaskListItem[];
  assetsByTaskId: Record<string, TaskActionAsset[]>;
  bookingUrls?: BookingUrlMap | null;
  checklistByTaskId: Record<string, ChecklistItemView[]>;
  addRcm?: { defaultAssignments: Record<string, string> } | null;
  rcmSummary?: AddRcmSummary | null;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<TaskListView>("all");
  const [addRcmOpen, setAddRcmOpen] = useState(false);
  const alreadyOn = Boolean(rcmSummary) && !addRcm;
  const rcmView = addRcmPanelView({
    eligible: Boolean(addRcm),
    alreadyOn,
    expanded: addRcmOpen,
  });

  useEffect(() => {
    const sync = () => {
      if (addRcmHashShouldExpand(window.location.hash, alreadyOn)) setAddRcmOpen(true);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [alreadyOn]);

  function setAddRcmExpanded(next: boolean) {
    setAddRcmOpen(next);
    if (typeof window === "undefined") return;
    if (next && window.location.hash !== ADD_RCM_HASH) {
      window.history.replaceState(null, "", ADD_RCM_HASH);
    }
    if (!next && window.location.hash === ADD_RCM_HASH) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }

  const [taskPreview, setTaskPreview] = useState<
    Record<string, { status?: ProjectTaskListItem["status"]; notApplicable?: boolean }>
  >({});
  const [phaseNaPreview, setPhaseNaPreview] = useState<Record<string, boolean>>({});

  const serverTasks = useMemo(
    () => [...phases.flatMap((p) => p.tasks), ...unphased],
    [phases, unphased],
  );

  useEffect(() => {
    setTaskPreview((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const byId = new Map(serverTasks.map((t) => [t.id, t]));
      let changed = false;
      const next = { ...prev };
      for (const [id, patch] of Object.entries(next)) {
        const server = byId.get(id);
        if (
          !server ||
          ((patch.status === undefined || patch.status === server.status) &&
            (patch.notApplicable === undefined || patch.notApplicable === server.notApplicable))
        ) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setPhaseNaPreview((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      for (const phase of phases) {
        if (next[phase.id] === undefined || next[phase.id] === phase.notApplicable) {
          if (next[phase.id] !== undefined) {
            delete next[phase.id];
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [serverTasks, phases]);

  const livePhases = useMemo(
    () =>
      phases.map((phase) => ({
        ...phase,
        notApplicable: phaseNaPreview[phase.id] ?? phase.notApplicable,
        tasks: phase.tasks.map((t) => (taskPreview[t.id] ? { ...t, ...taskPreview[t.id] } : t)),
      })),
    [phases, taskPreview, phaseNaPreview],
  );
  const liveUnphased = useMemo(
    () => unphased.map((t) => (taskPreview[t.id] ? { ...t, ...taskPreview[t.id] } : t)),
    [unphased, taskPreview],
  );

  const allTasks = useMemo(
    () => [...livePhases.flatMap((p) => p.tasks), ...liveUnphased],
    [livePhases, liveUnphased],
  );
  const movePhases = useMemo<MoveTaskPhaseOption[]>(
    () => livePhases.map((p) => ({ id: p.id, name: p.name })),
    [livePhases],
  );
  const moveTasks = useMemo<MoveTaskNode[]>(
    () =>
      allTasks.map((t) => ({
        id: t.id,
        title: t.title,
        phaseId: t.phaseId ?? null,
        parentTaskId: t.parentTaskId,
      })),
    [allTasks],
  );

  function previewTaskChange(
    taskId: string,
    patch: { status?: ProjectTaskListItem["status"]; notApplicable?: boolean },
  ) {
    setTaskPreview((prev) => ({ ...prev, [taskId]: { ...prev[taskId], ...patch } }));
  }

  const filteredPhases = useMemo(() => {
    const rows = livePhases.map((phase) => {
      const filtered = filterNestedTasks(phase.tasks, {
        query,
        view,
        currentUserId,
      });
      const split = partitionCompletedGroups(filtered);
      return { phase, filtered, ...split };
    });
    return sortSectionsByCompletion(rows, (row) =>
      isSectionComplete(row.phase.tasks, { sectionNotApplicable: row.phase.notApplicable }),
    );
  }, [livePhases, query, view, currentUserId]);

  const unphasedFiltered = useMemo(() => {
    const filtered = filterNestedTasks(liveUnphased, { query, view, currentUserId });
    return { filtered, ...partitionCompletedGroups(filtered) };
  }, [liveUnphased, query, view, currentUserId]);

  const openCount = allTasks.filter(
    (t) => !t.notApplicable && t.status !== "DONE" && t.status !== "CANCELLED",
  ).length;
  const doneCount = allTasks.filter((t) => t.status === "DONE").length;
  const customerCount = allTasks.filter(
    (t) =>
      t.ownerSide === "CUSTOMER" &&
      !t.notApplicable &&
      t.status !== "DONE" &&
      t.status !== "CANCELLED",
  ).length;

  const nothingAtAll = phases.length === 0 && allTasks.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
          <Badge>{openCount} open</Badge>
          <Badge tone="green">{doneCount} done</Badge>
          {customerCount > 0 ? (
            <Badge tone="violet">{customerCount} waiting on customer</Badge>
          ) : null}
        </div>
        <span className="flex flex-wrap items-center gap-2">
          {rcmView === "trigger" || rcmView === "form" ? (
            <Button
              size="sm"
              variant="secondary"
              type="button"
              aria-expanded={rcmView === "form"}
              aria-controls="add-rcm"
              onClick={() => setAddRcmExpanded(rcmView !== "form")}
            >
              {rcmView === "form" ? "Cancel" : "Add RCM"}
            </Button>
          ) : rcmView === "summary" ? (
            <AddRcmOnSummary {...rcmSummary} />
          ) : null}
          <AddPhaseForm projectId={projectId} />
        </span>
      </div>

      {rcmView === "form" && addRcm ? (
        <Card id="add-rcm">
          <CardHeader title="Add RCM" />
          <AddRcmTrackForm
            projectId={projectId}
            staff={staff}
            defaultAssignments={addRcm.defaultAssignments}
            onCancel={() => setAddRcmExpanded(false)}
          />
        </Card>
      ) : null}

      {nothingAtAll ? null : (
        <TaskListToolbar query={query} onQuery={setQuery} view={view} onView={setView} />
      )}

      {nothingAtAll ? (
        <Card>
          <EmptyState title="No tasks yet" />
          <div className="border-t border-border">
            <AddTaskInline projectId={projectId} staff={staff} defaultAssigneeId={defaultAssigneeId} />
          </div>
        </Card>
      ) : null}

      {filteredPhases.map(({ phase, filtered, active, completed }) => {
        const done = phase.tasks.filter((t) => t.status === "DONE").length;
        const applicable = phase.tasks.filter((t) => !t.notApplicable).length;
        const sectionDone = isSectionComplete(phase.tasks, {
          sectionNotApplicable: phase.notApplicable,
        });
        return (
          <Card key={phase.id}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  {phase.name}
                  {phase.visibility === "INTERNAL" ? (
                    <VisibilityBadge visibility="INTERNAL" />
                  ) : null}
                  {phase.notApplicable ? (
                    <Badge tone="amber">N/A</Badge>
                  ) : sectionDone ? (
                    <Badge tone="green">Done</Badge>
                  ) : null}
                  {phase.workTrack === "RCM" ? <Badge tone="violet">RCM</Badge> : null}
                </span>
              }
              subtitle={
                <>
                  {done}/{applicable} complete
                  {phase.dueDate ? ` · due ${fmtShort(phase.dueDate)}` : ""}
                </>
              }
              action={
                <span className="flex flex-wrap items-center justify-end gap-3">
                  <PhaseVisibilityButton phaseId={phase.id} visibility={phase.visibility} />
                  <PhaseNaButton
                    phaseId={phase.id}
                    notApplicable={phase.notApplicable}
                    onPreviewChange={(next) =>
                      setPhaseNaPreview((prev) => ({ ...prev, [phase.id]: next }))
                    }
                  />
                </span>
              }
            />
            {filtered.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-ink-3">
                {phase.tasks.length === 0 ? "Nothing in this phase yet." : "No tasks match this filter."}
              </p>
            ) : (
              <div className="divide-y divide-border">
                <PhaseTaskRows
                  projectId={projectId}
                  tasks={active}
                  staff={staff}
                  defaultAssigneeId={defaultAssigneeId}
                  assetsByTaskId={assetsByTaskId}
                  bookingUrls={bookingUrls}
                  checklistByTaskId={checklistByTaskId}
                  allowStructureEdit
                  movePhases={movePhases}
                  moveTasks={moveTasks}
                  onPreviewChange={previewTaskChange}
                />
              </div>
            )}
            <CollapsibleCompleted count={completed.length}>
              <PhaseTaskRows
                projectId={projectId}
                tasks={completed}
                staff={staff}
                defaultAssigneeId={defaultAssigneeId}
                assetsByTaskId={assetsByTaskId}
                bookingUrls={bookingUrls}
                checklistByTaskId={checklistByTaskId}
                allowStructureEdit
                movePhases={movePhases}
                moveTasks={moveTasks}
                onPreviewChange={previewTaskChange}
              />
            </CollapsibleCompleted>
            <div className="border-t border-border">
              <AddTaskInline
                projectId={projectId}
                phaseId={phase.id}
                staff={staff}
                defaultAssigneeId={defaultAssigneeId}
              />
            </div>
          </Card>
        );
      })}

      {unphased.length > 0 ? (
        <Card>
          <CardHeader title="Unphased" subtitle={`${unphased.length}`} />
          {unphasedFiltered.filtered.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-ink-3">
              {unphased.length === 0 ? "Everything is assigned to a phase." : "No tasks match this filter."}
            </p>
          ) : (
            <div className="divide-y divide-border">
              <PhaseTaskRows
                projectId={projectId}
                tasks={unphasedFiltered.active}
                staff={staff}
                defaultAssigneeId={defaultAssigneeId}
                assetsByTaskId={assetsByTaskId}
                bookingUrls={bookingUrls}
                checklistByTaskId={checklistByTaskId}
                allowStructureEdit
                movePhases={movePhases}
                moveTasks={moveTasks}
                onPreviewChange={previewTaskChange}
              />
            </div>
          )}
          <CollapsibleCompleted count={unphasedFiltered.completed.length}>
            <PhaseTaskRows
              projectId={projectId}
              tasks={unphasedFiltered.completed}
              staff={staff}
              defaultAssigneeId={defaultAssigneeId}
              assetsByTaskId={assetsByTaskId}
              bookingUrls={bookingUrls}
              checklistByTaskId={checklistByTaskId}
              allowStructureEdit
              movePhases={movePhases}
              moveTasks={moveTasks}
              onPreviewChange={previewTaskChange}
            />
          </CollapsibleCompleted>
          <div className="border-t border-border">
            <AddTaskInline projectId={projectId} staff={staff} defaultAssigneeId={defaultAssigneeId} />
          </div>
        </Card>
      ) : phases.length > 0 ? (
        <Card>
          <AddTaskInline
            projectId={projectId}
            staff={staff}
            defaultAssigneeId={defaultAssigneeId}
            label="+ Add unphased task"
          />
        </Card>
      ) : null}
    </div>
  );
}
