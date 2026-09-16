"use client";

import { useMemo, useState } from "react";
import { Card, CardHeader, Badge, VisibilityBadge, EmptyState } from "@/components/ui";
import { TaskRow, type TaskRowData } from "@/components/task-row";
import { TaskListToolbar } from "@/components/task-list-toolbar";
import { CollapsibleCompleted } from "@/components/collapsible-completed";
import { AddTaskInline, AddPhaseForm } from "@/app/(app)/projects/[id]/tasks/task-forms";
import { PhaseNaButton } from "@/app/(app)/projects/[id]/tasks/phase-na-button";
import { PhaseVisibilityButton } from "@/app/(app)/projects/[id]/tasks/phase-visibility-button";
import { fmtShort } from "@/lib/dates";
import {
  excludeCollapsedDescendants,
  filterNestedTasks,
  partitionCompletedGroups,
  type TaskListView,
} from "@/lib/task-list-filter";
import type { ChecklistItemView } from "@/components/task-checklist";
import type { TaskActionAsset } from "@/lib/playbook-resources";

export type ProjectTaskListItem = TaskRowData & {
  assigneeId?: string | null;
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
  checklistByTaskId,
  allowStructureEdit,
}: {
  projectId: string;
  tasks: ProjectTaskListItem[];
  staff: StaffOption[];
  defaultAssigneeId?: string;
  assetsByTaskId: Record<string, TaskActionAsset[]>;
  checklistByTaskId: Record<string, ChecklistItemView[]>;
  allowStructureEdit: boolean;
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
          checklist={checklistByTaskId[t.id] ?? []}
          hasChildren={parentsWithChildren.has(t.id)}
          childrenCollapsed={collapsed.has(t.id)}
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
  checklistByTaskId,
}: {
  projectId: string;
  currentUserId: string;
  defaultAssigneeId?: string;
  staff: StaffOption[];
  phases: PhaseBlock[];
  unphased: ProjectTaskListItem[];
  assetsByTaskId: Record<string, TaskActionAsset[]>;
  checklistByTaskId: Record<string, ChecklistItemView[]>;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<TaskListView>("all");

  const allTasks = useMemo(
    () => [...phases.flatMap((p) => p.tasks), ...unphased],
    [phases, unphased],
  );

  const filteredPhases = useMemo(() => {
    return phases.map((phase) => {
      const filtered = filterNestedTasks(phase.tasks, {
        query,
        view,
        currentUserId,
      });
      const split = partitionCompletedGroups(filtered);
      return { phase, filtered, ...split };
    });
  }, [phases, query, view, currentUserId]);

  const unphasedFiltered = useMemo(() => {
    const filtered = filterNestedTasks(unphased, { query, view, currentUserId });
    return { filtered, ...partitionCompletedGroups(filtered) };
  }, [unphased, query, view, currentUserId]);

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
        <AddPhaseForm projectId={projectId} />
      </div>

      {nothingAtAll ? null : (
        <TaskListToolbar query={query} onQuery={setQuery} view={view} onView={setView} />
      )}

      {nothingAtAll ? (
        <Card>
          <EmptyState
            title="No tasks yet"
            description="Add a phase to structure the work, or start adding tasks directly."
          />
          <div className="border-t border-border">
            <AddTaskInline projectId={projectId} staff={staff} defaultAssigneeId={defaultAssigneeId} />
          </div>
        </Card>
      ) : null}

      {filteredPhases.map(({ phase, filtered, active, completed }) => {
        const done = phase.tasks.filter((t) => t.status === "DONE").length;
        const applicable = phase.tasks.filter((t) => !t.notApplicable).length;
        return (
          <Card key={phase.id}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  {phase.name}
                  {phase.visibility === "INTERNAL" ? (
                    <VisibilityBadge visibility="INTERNAL" />
                  ) : null}
                  {phase.notApplicable ? <Badge tone="amber">N/A</Badge> : null}
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
                  <PhaseNaButton phaseId={phase.id} notApplicable={phase.notApplicable} />
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
                  checklistByTaskId={checklistByTaskId}
                  allowStructureEdit
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
                checklistByTaskId={checklistByTaskId}
                allowStructureEdit
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

      {unphased.length > 0 || phases.length > 0 ? (
        <Card>
          <CardHeader title="Unphased tasks" subtitle={`${unphased.length} item(s)`} />
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
                checklistByTaskId={checklistByTaskId}
                allowStructureEdit
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
              checklistByTaskId={checklistByTaskId}
              allowStructureEdit
            />
          </CollapsibleCompleted>
          <div className="border-t border-border">
            <AddTaskInline projectId={projectId} staff={staff} defaultAssigneeId={defaultAssigneeId} />
          </div>
        </Card>
      ) : null}

      <p className="text-[12.5px] leading-relaxed text-ink-3">
        Check a box to complete — you do not have to open the task. Upload files and Click Here run
        from this list. Finished groups collapse under Completed. Add or remove tasks here; that
        does not change the playbook. Nested specialist work stays on this staff list. The customer
        portal shows parent status plus customer-owned items. Playbook authoring is Templates
        (owner/admin).
      </p>
    </div>
  );
}
