import Link from "next/link";
import { Badge, EmptyState } from "@/components/ui";
import { dueLabel, isOverdue } from "@/lib/dates";
import {
  WAITING_ON_HIGHLIGHT_AREAS,
  WAITING_ON_AREA_LABELS,
  classifyWaitingOnArea,
  countWaitingOnByArea,
  groupWaitingOnByArea,
  waitingOnPhaseDetail,
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
  className,
}: {
  counts: WaitingOnAreaCounts;
  className?: string;
}) {
  const showOther = counts.other > 0;
  return (
    <div
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      aria-label="Outstanding customer actions by area"
    >
      {WAITING_ON_HIGHLIGHT_AREAS.map((key) => {
        const n = counts[key];
        return (
          <Badge key={key} tone={n > 0 ? "violet" : "neutral"}>
            {WAITING_ON_AREA_LABELS[key]} {n}
          </Badge>
        );
      })}
      {showOther ? <Badge>{WAITING_ON_AREA_LABELS.other} {counts.other}</Badge> : null}
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
  const counts = countWaitingOnByArea(tasks);
  const groups = groupWaitingOnByArea(tasks);

  if (tasks.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div>
      <div className={cn("border-b border-border px-4 py-2.5", highlightClassName)}>
        <WaitingOnAreaHighlights counts={counts} />
      </div>
      {groups.map((group) => (
        <div key={group.key} className="border-b border-border last:border-b-0">
          <div className="flex items-center justify-between gap-2 bg-surface-2 px-4 py-1.5">
            <div className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">
              {group.label}
            </div>
            <Badge tone={group.key === "other" ? "neutral" : "violet"}>{group.tasks.length}</Badge>
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
