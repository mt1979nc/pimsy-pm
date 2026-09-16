"use client";

import { TASK_LIST_VIEWS, type TaskListView } from "@/lib/task-list-filter";
import { cn } from "@/lib/cn";
import { inputClass } from "@/components/ui";

export function TaskListToolbar({
  query,
  onQuery,
  view,
  onView,
  showMine = true,
  placeholder = "Filter tasks…",
}: {
  query: string;
  onQuery: (value: string) => void;
  view: TaskListView;
  onView: (view: TaskListView) => void;
  showMine?: boolean;
  placeholder?: string;
}) {
  const views = showMine ? TASK_LIST_VIEWS : TASK_LIST_VIEWS.filter((v) => v.id !== "mine");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="task-list-filter">
        Filter tasks
      </label>
      <input
        id="task-list-filter"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={placeholder}
        className={cn(inputClass, "h-9 min-w-[12rem] flex-1 sm:max-w-sm")}
      />
      <div className="inline-flex overflow-hidden rounded-lg border border-border-strong">
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onView(v.id)}
            className={cn(
              "px-2.5 py-1.5 text-[12.5px] font-medium",
              view === v.id ? "bg-brand text-brand-ink" : "bg-surface text-ink-2 hover:bg-surface-2",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}
