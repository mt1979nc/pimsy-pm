"use client";

import { useActionState, useTransition } from "react";
import { addChecklistItem, removeChecklistItem, setChecklistItemDone } from "@/actions/checklists";
import { SubmitButton, FormError } from "@/components/submit-button";
import { inputClass } from "@/components/ui";
import { cn } from "@/lib/cn";

export type ChecklistItemView = {
  id: string;
  label: string;
  done: boolean;
  visibility: "INTERNAL" | "SHARED";
};

export function TaskChecklist({
  taskId,
  items,
  canEdit,
  canToggle,
  taskIsInternal,
}: {
  taskId: string;
  items: ChecklistItemView[];
  canEdit: boolean;
  canToggle: boolean;
  taskIsInternal: boolean;
}) {
  const [pending, start] = useTransition();
  const [state, action] = useActionState(addChecklistItem, {});
  const doneCount = items.filter((i) => i.done).length;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4">
        <p className="text-[12.5px] text-ink-3">
          {items.length === 0
            ? "No areas listed yet."
            : `${doneCount}/${items.length} covered`}
        </p>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-3 text-[13px] text-ink-3">
          {canEdit
            ? "Add the topics this session should cover. Staff check them off during training."
            : "No areas listed on this task."}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className={cn("flex items-start gap-3 px-5 py-2.5", pending && "opacity-70")}>
              <button
                type="button"
                disabled={!canToggle || pending}
                aria-label={item.done ? `Mark ${item.label} not covered` : `Mark ${item.label} covered`}
                onClick={() => {
                  start(async () => {
                    await setChecklistItemDone(item.id, !item.done);
                  });
                }}
                className={cn(
                  "mt-0.5 flex size-[17px] shrink-0 items-center justify-center rounded-[5px] border",
                  item.done ? "border-green bg-green text-white" : "border-border-strong bg-surface",
                  !canToggle && "cursor-default opacity-70",
                )}
              >
                {item.done ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                    <path d="m5 13 4.5 4.5L19 7" />
                  </svg>
                ) : null}
              </button>
              <div className="min-w-0 flex-1">
                <span className={cn("text-[13.5px]", item.done ? "text-ink-3 line-through" : "text-ink")}>
                  {item.label}
                </span>
                {item.visibility === "INTERNAL" ? (
                  <span className="ml-2 text-[11px] uppercase tracking-wide text-ink-3">Team only</span>
                ) : null}
              </div>
              {canEdit ? (
                <button
                  type="button"
                  className="text-[12px] text-ink-3 hover:text-red"
                  onClick={() => {
                    start(async () => {
                      await removeChecklistItem(item.id);
                    });
                  }}
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <form action={action} className="flex flex-wrap items-end gap-2 border-t border-border px-5 py-3">
          <input type="hidden" name="taskId" value={taskId} />
          {!taskIsInternal ? <input type="hidden" name="visibility" value="SHARED" /> : (
            <input type="hidden" name="visibility" value="INTERNAL" />
          )}
          <input
            name="label"
            placeholder="Add an area to cover"
            className={cn(inputClass, "min-w-[200px] flex-1")}
            maxLength={300}
            required
          />
          <SubmitButton size="sm" pendingLabel="Adding…">
            Add
          </SubmitButton>
          <FormError error={state.error} />
        </form>
      ) : null}
    </div>
  );
}
