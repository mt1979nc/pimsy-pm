"use client";

import { useMemo, useState } from "react";
import { Card, CardHeader, EmptyState, ProgressBar } from "@/components/ui";
import { TaskListToolbar } from "@/components/task-list-toolbar";
import { CollapsibleCompleted } from "@/components/collapsible-completed";
import { PortalTaskRow } from "@/app/portal/portal-task-row";
import { pctComplete } from "@/lib/pct-complete";
import {
  excludeCollapsedDescendants,
  filterNestedTasks,
  partitionCompletedGroups,
  type TaskListView,
} from "@/lib/task-list-filter";
import type { TaskActionAsset } from "@/lib/playbook-resources";
import type { BookingUrlMap } from "@/lib/booking-urls";
import { cn } from "@/lib/cn";
import { PortalAreaIntro } from "@/components/portal-area-intro";

export type PortalListTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  ownerSide: "INTERNAL" | "CUSTOMER";
  parentTaskId: string | null;
  assigneeId?: string | null;
  assigneeIds?: string[];
  notApplicable?: boolean | null;
  assignee?: { id: string; name: string | null; image?: string | null } | null;
  assignees?: Array<{ id: string; name: string | null; image?: string | null }>;
  commentCount?: number;
};

function childParentIds(tasks: PortalListTask[]): Set<string> {
  const ids = new Set<string>();
  for (const t of tasks) {
    if (t.parentTaskId) ids.add(t.parentTaskId);
  }
  return ids;
}

export function PortalPhaseTaskList({
  projectId,
  projectCode,
  phaseName,
  phaseDescription,
  tasks,
  assetsByTaskId,
  bookingUrls,
}: {
  projectId: string;
  projectCode?: string | null;
  phaseName: string;
  phaseDescription: string | null;
  tasks: PortalListTask[];
  assetsByTaskId: Record<string, TaskActionAsset[]>;
  bookingUrls?: BookingUrlMap | null;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<TaskListView>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const filtered = useMemo(
    () => filterNestedTasks(tasks, { query, view }),
    [tasks, query, view],
  );
  const { active, completed } = useMemo(() => partitionCompletedGroups(filtered), [filtered]);
  const parents = childParentIds(filtered);

  const done = tasks.filter((t) => t.status === "DONE").length;
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const pct = pctComplete(done, tasks.length);

  function rows(list: PortalListTask[]) {
    const visible = excludeCollapsedDescendants(list, collapsed);
    return visible.map((t) => (
      <div key={t.id}>
        <PortalTaskRow
          task={{
            id: t.id,
            title: t.title,
            description: t.description,
            status: t.status,
            dueDate: t.dueDate,
            projectId,
            projectCode,
            commentCount: t.commentCount,
          }}
          assets={assetsByTaskId[t.id]}
          bookingUrls={bookingUrls}
          canUpload={t.ownerSide === "CUSTOMER"}
        />
        {parents.has(t.id) ? (
          <button
            type="button"
            className="mb-1 ml-12 text-[12px] text-ink-3 hover:text-ink hover:underline"
            onClick={() =>
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(t.id)) next.delete(t.id);
                else next.add(t.id);
                return next;
              })
            }
          >
            {collapsed.has(t.id) ? "Show nested items" : "Hide nested items"}
          </button>
        ) : null}
      </div>
    ));
  }

  return (
    <Card>
      <CardHeader
        title={phaseName}
        subtitle={
          phaseDescription ??
          "Status for this area — parent items only. Specialist checklists stay with your implementation team."
        }
        action={
          tasks.length > 0 ? (
            <span className="text-[12.5px] text-ink-3">
              {done}/{tasks.length} complete
              {inProgress > 0 ? ` · ${inProgress} in progress` : ""}
            </span>
          ) : undefined
        }
      />
      <PortalAreaIntro
        phaseName={phaseName}
        description={null}
        tasks={tasks.map((t) => ({ id: t.id, title: t.title }))}
        taskHref={(taskId) => `/portal/projects/${projectId}/tasks/${taskId}`}
      />
      {tasks.length > 0 ? (
        <div className="space-y-3 px-5 pt-4">
          <ProgressBar value={done} total={tasks.length} tone={pct === 100 ? "green" : "brand"} />
          <TaskListToolbar
            query={query}
            onQuery={setQuery}
            view={view}
            onView={setView}
            showMine={false}
            placeholder="Filter this area…"
          />
        </div>
      ) : null}

      {tasks.length === 0 ? (
        <EmptyState title="Nothing here yet" description="Check back once this phase gets underway." />
      ) : filtered.length === 0 ? (
        <p className="px-5 py-4 text-[13px] text-ink-3">No tasks match this filter.</p>
      ) : (
        <div className={cn("mt-3 divide-y divide-border")}>{rows(active)}</div>
      )}
      <CollapsibleCompleted count={completed.length}>{rows(completed)}</CollapsibleCompleted>
    </Card>
  );
}
