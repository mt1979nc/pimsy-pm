"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, EmptyState, ProgressBar } from "@/components/ui";
import { TaskListToolbar } from "@/components/task-list-toolbar";
import { CollapsibleCompleted } from "@/components/collapsible-completed";
import { PortalTaskRow } from "@/app/portal/portal-task-row";
import { pctComplete } from "@/lib/pct-complete";
import {
  excludeCollapsedDescendants,
  filterNestedTasks,
  parseTaskListPrefs,
  partitionCompletedGroups,
  taskListPrefsKey,
  type TaskListView,
} from "@/lib/task-list-filter";
import type { TaskActionAsset } from "@/lib/playbook-resources";
import type { BookingUrlMap } from "@/lib/booking-urls";
import { cn } from "@/lib/cn";

export type PortalListTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  sessionAt?: string | null;
  ownerSide: "INTERNAL" | "CUSTOMER";
  parentTaskId: string | null;
  assigneeId?: string | null;
  assigneeIds?: string[];
  notApplicable?: boolean | null;
  assignee?: { id: string; name: string | null; image?: string | null } | null;
  assignees?: Array<{ id: string; name: string | null; image?: string | null }>;
  commentCount?: number;
  depth?: number;
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
  const [filterReady, setFilterReady] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    try {
      const prefs = parseTaskListPrefs(sessionStorage.getItem(taskListPrefsKey(projectId, "portal")));
      if (prefs) {
        setQuery(prefs.query);
        setView(prefs.view === "mine" ? "all" : prefs.view);
      }
    } catch {
      // This tab cannot read sessionStorage. The list still filters in memory.
    }
    setFilterReady(true);
  }, [projectId]);

  useEffect(() => {
    if (!filterReady) return;
    try {
      sessionStorage.setItem(
        taskListPrefsKey(projectId, "portal"),
        JSON.stringify({ query, view }),
      );
    } catch {
      // Ignore quota / private-mode failures. The filter still works for this visit.
    }
  }, [filterReady, projectId, query, view]);

  const filtered = useMemo(
    () => filterNestedTasks(tasks, { query, view }),
    [tasks, query, view],
  );
  const { active, completed } = useMemo(() => partitionCompletedGroups(filtered), [filtered]);
  const parents = childParentIds(filtered);

  const done = tasks.filter((t) => t.status === "DONE").length;
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const pct = pctComplete(done, tasks.length);

  function toggleParent(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function rows(list: PortalListTask[]) {
    const visible = excludeCollapsedDescendants(list, collapsed);
    return visible.map((t) => (
      <PortalTaskRow
        key={t.id}
        task={{
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status,
          dueDate: t.dueDate,
          sessionAt: t.sessionAt ?? null,
          projectId,
          projectCode,
          commentCount: t.commentCount,
          depth: t.depth ?? 0,
        }}
        assets={assetsByTaskId[t.id]}
        bookingUrls={bookingUrls}
        canUpload={t.ownerSide === "CUSTOMER"}
        hasChildren={parents.has(t.id)}
        childrenCollapsed={collapsed.has(t.id)}
        onToggleChildren={parents.has(t.id) ? () => toggleParent(t.id) : undefined}
      />
    ));
  }

  return (
    <Card>
      <CardHeader
        title={phaseName}
        action={
          tasks.length > 0 ? (
            <span className="text-[12.5px] text-ink-3">
              {done}/{tasks.length}
              {inProgress > 0 ? ` · ${inProgress} in progress` : ""}
            </span>
          ) : undefined
        }
      />
      {phaseDescription ? (
        <p className="line-clamp-2 px-4 pb-2 text-[12.5px] text-ink-3">{phaseDescription}</p>
      ) : null}
      {tasks.length > 0 ? (
        <div className="space-y-3 px-5 pt-4">
          <ProgressBar value={done} total={tasks.length} tone={pct === 100 ? "green" : "brand"} />
          <TaskListToolbar
            query={query}
            onQuery={setQuery}
            view={view}
            onView={setView}
            showMine={false}
            placeholder={view === "punch" ? "Filter the punch list…" : "Filter this area…"}
          />
        </div>
      ) : null}

      {tasks.length === 0 ? (
        <EmptyState title="Nothing here yet" />
      ) : filtered.length === 0 ? (
        <p className="px-5 py-4 text-[13px] text-ink-3">No tasks match this filter.</p>
      ) : (
        <div className={cn("mt-3 divide-y divide-border")}>{rows(active)}</div>
      )}
      <CollapsibleCompleted count={completed.length}>{rows(completed)}</CollapsibleCompleted>
    </Card>
  );
}
