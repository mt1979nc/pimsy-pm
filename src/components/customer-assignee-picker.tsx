"use client";

import { useState, useTransition } from "react";
import { addTaskAssignee, removeTaskAssignee } from "@/actions/tasks";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Candidate } from "@/components/assignee-picker";

/**
 * Portal reassignment: customers can add/remove their own teammates on
 * customer-owned action items. Staff assignees are listed read-only.
 */
export function CustomerAssigneePicker({
  taskId,
  assignees,
  team,
  currentUserId,
}: {
  taskId: string;
  assignees: Candidate[];
  team: Candidate[];
  currentUserId: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState(assignees);

  const customerPeople = people.filter((p) => p.role === "CUSTOMER");
  const staffPeople = people.filter((p) => p.role !== "CUSTOMER");
  const selected = new Set(people.map((p) => p.id));
  const available = team.filter((c) => !selected.has(c.id));

  function add(id: string) {
    const next = team.find((c) => c.id === id);
    if (!next) return;
    setError(null);
    setPeople((prev) => [...prev, next]);
    start(async () => {
      try {
        await addTaskAssignee(taskId, id);
      } catch (e) {
        setPeople((prev) => prev.filter((p) => p.id !== id));
        setError(e instanceof Error ? e.message : "Could not assign that.");
      }
    });
  }

  function remove(id: string) {
    const snapshot = people;
    setError(null);
    setPeople((prev) => prev.filter((p) => p.id !== id));
    start(async () => {
      try {
        await removeTaskAssignee(taskId, id);
      } catch (e) {
        setPeople(snapshot);
        setError(e instanceof Error ? e.message : "Could not remove that.");
      }
    });
  }

  return (
    <div className={cn(pending && "opacity-60")}>
      {people.length === 0 ? (
        <p className="mb-2 text-[13px] text-ink-3">Nobody at your practice is named on this yet.</p>
      ) : (
        <ul className="mb-2 space-y-1.5">
          {customerPeople.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <Avatar name={p.name} image={p.image} size={28} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium text-ink">
                  {p.name}
                  {p.id === currentUserId ? (
                    <span className="ml-1 font-normal text-ink-3">(you)</span>
                  ) : null}
                </div>
                <div className="truncate text-[12px] text-ink-3">{p.title ?? "Your team"}</div>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(p.id)}
                className="shrink-0 text-[12px] text-ink-3 underline-offset-2 hover:text-red hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
          {staffPeople.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <Avatar name={p.name} image={p.image} size={28} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium text-ink">{p.name}</div>
                <div className="truncate text-[12px] text-ink-3">Your implementation team</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 ? (
        <select
          value=""
          disabled={pending}
          onChange={(e) => {
            const id = e.target.value;
            if (id) add(id);
          }}
          className="w-full rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-[13px] text-ink focus:border-brand focus:outline-none"
        >
          <option value="">Assign to a teammate…</option>
          {available.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name ?? c.email}
              {c.title ? ` · ${c.title}` : ""}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-[12px] leading-snug text-ink-3">
          Everyone on your project team is already named, or no other contacts have access yet.
        </p>
      )}
      {error ? <p className="mt-1.5 text-[12px] text-red">{error}</p> : null}
    </div>
  );
}
