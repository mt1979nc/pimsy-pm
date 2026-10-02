"use client";

import { useState } from "react";
import Link from "next/link";
import { AreaChip } from "@/components/queue-chips";
import { Badge, EmptyState } from "@/components/ui";
import { dueLabel, isOverdue } from "@/lib/dates";
import {
  WAITING_ON_HIGHLIGHT_AREAS,
  WAITING_ON_AREA_LABELS,
  classifyWaitingOnArea,
  countWaitingOnByArea,
  groupWaitingOnByArea,
  tasksInWaitingOnArea,
  waitingOnPhaseDetail,
  type WaitingOnArea,
  type WaitingOnAreaCounts,
  type WaitingOnAreaTask,
} from "@/lib/waiting-on-area";
import { cn } from "@/lib/cn";

export type ChaseTask = WaitingOnAreaTask & {
  id: string;
  title: string;
  dueDate?: Date | string | null;
  status?: string | null;
  project: {
    id: string;
    name: string;
    customerAccount?: { name: string } | null;
  };
  phase?: { id?: string; name?: string | null } | null;
};

export function WaitingOnAreaHighlights({
  counts,
  area = "all",
  onArea,
  className,
}: {
  counts: WaitingOnAreaCounts;
  area?: WaitingOnArea | "all";
  onArea?: (area: WaitingOnArea | "all") => void;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      aria-label="Outstanding customer actions by area"
    >
      {WAITING_ON_HIGHLIGHT_AREAS.map((key) => {
        const n = counts[key];
        const selected = area === key;
        const chip = <AreaChip area={key} count={n} />;
        if (!onArea || n === 0) return <span key={key}>{chip}</span>;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={selected}
            onClick={() => onArea(selected ? "all" : key)}
            className={cn("rounded-full", selected && "ring-2 ring-brand ring-offset-1")}
            title={selected ? "Show every area" : `Show ${WAITING_ON_AREA_LABELS[key]} only`}
          >
            {chip}
          </button>
        );
      })}
      {counts.other > 0 ? (
        onArea ? (
          <button
            type="button"
            aria-pressed={area === "other"}
            onClick={() => onArea(area === "other" ? "all" : "other")}
            className={cn("rounded-full", area === "other" && "ring-2 ring-brand ring-offset-1")}
            title={area === "other" ? "Show every area" : "Show Other only"}
          >
            <Badge>
              {WAITING_ON_AREA_LABELS.other} {counts.other}
            </Badge>
          </button>
        ) : (
          <Badge>
            {WAITING_ON_AREA_LABELS.other} {counts.other}
          </Badge>
        )
      ) : null}
    </div>
  );
}

function ChaseRow({
  task,
  showProject,
  showStatus,
}: {
  task: ChaseTask;
  showProject: boolean;
  showStatus: boolean;
}) {
  const area = classifyWaitingOnArea(task.phase?.name);
  const phaseDetail = waitingOnPhaseDetail(task.phase?.name, area);
  const overdue = Boolean(task.dueDate && isOverdue(task.dueDate));
  const href = `/projects/${task.project.id}/tasks/${task.id}`;
  const customer = task.project.customerAccount?.name ?? task.project.name;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <Link href={href} className="block truncate text-[13px] text-ink hover:text-brand">
          {task.title}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
          {showProject ? (
            <Link
              href={`/projects/${task.project.id}/tasks`}
              className="font-medium text-ink-2 hover:text-brand"
            >
              {customer}
            </Link>
          ) : null}
          {phaseDetail ? (
            <>
              {showProject ? <span>·</span> : null}
              <span>{phaseDetail}</span>
            </>
          ) : null}
          {task.dueDate ? (
            <>
              {showProject || phaseDetail ? <span>·</span> : null}
              <span className={overdue ? "font-medium text-red" : undefined}>{dueLabel(task.dueDate)}</span>
            </>
          ) : null}
        </div>
      </div>
      {showStatus ? (
        <Badge tone={task.status === "IN_PROGRESS" ? "brand" : "neutral"}>
          {task.status === "IN_PROGRESS" ? "Started" : "Not started"}
        </Badge>
      ) : null}
    </div>
  );
}

/**
 * Existing waiting-on-customer chase list, grouped and highlighted by
 * Discovery / Configuration / Training. Other outstanding customer actions
 * remain on the list under Other.
 */
export function WaitingOnCustomerList({
  tasks,
  emptyTitle = "Nothing outstanding",
  emptyDescription,
  showProject = true,
  showStatus = false,
  highlightClassName,
}: {
  tasks: ChaseTask[];
  emptyTitle?: string;
  emptyDescription?: string;
  showProject?: boolean;
  showStatus?: boolean;
  highlightClassName?: string;
}) {
  const [area, setArea] = useState<WaitingOnArea | "all">("all");
  const counts = countWaitingOnByArea(tasks);
  const shown = tasksInWaitingOnArea(tasks, area);
  const groups = groupWaitingOnByArea(shown);

  if (tasks.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div>
      <div className={cn("border-b border-border px-4 py-2.5", highlightClassName)}>
        <WaitingOnAreaHighlights counts={counts} area={area} onArea={setArea} />
      </div>
      {shown.length === 0 && area !== "all" ? (
        <p className="px-4 py-4 text-[13px] text-ink-3">
          Nothing in {WAITING_ON_AREA_LABELS[area]}.
        </p>
      ) : null}
      {groups.map((group) => (
        <div key={group.key} className="border-b border-border last:border-b-0">
          <div
            className={cn(
              "flex items-center justify-between gap-2 px-4 py-1.5",
              group.key === "discovery" && "bg-ehr-slate/10",
              group.key === "configuration" && "bg-ehr-gold/35",
              group.key === "training" && "bg-ehr-sage-soft",
              group.key === "other" && "bg-surface-2",
            )}
          >
            {group.key === "other" ? (
              <>
                <div className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">
                  {group.label}
                </div>
                <Badge>{group.tasks.length}</Badge>
              </>
            ) : (
              <AreaChip area={group.key} count={group.tasks.length} />
            )}
          </div>
          <div className="divide-y divide-border">
            {group.tasks.map((task) => (
              <ChaseRow
                key={task.id}
                task={task}
                showProject={showProject}
                showStatus={showStatus}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
