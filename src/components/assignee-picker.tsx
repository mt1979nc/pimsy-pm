"use client";

import { useState, useTransition } from "react";
import { addTaskAssignee, removeTaskAssignee } from "@/actions/tasks";
import { Avatar, Badge } from "@/components/ui";
import { cn } from "@/lib/cn";

export type Candidate = {
  id: string;
  name: string | null;
  email: string;
  image?: string | null;
  role: string;
  title?: string | null;
};

function label(c: Candidate) {
  return c.name ?? c.email;
}

/**
 * Multi-assignee control. Adding a person does not wipe the others.
 * Picking a customer contact makes the task a customer-visible action item.
 */
export function AssigneePicker({
  taskId,
  current,
  assignees,
  staff,
  contacts,
  customerName,
}: {
  taskId: string;
  current?: Candidate | null;
  assignees?: Candidate[];
  staff: Candidate[];
  contacts: Candidate[];
  customerName?: string | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<Candidate[]>(
    assignees && assignees.length > 0 ? assignees : current ? [current] : [],
  );

  const selected = new Set(people.map((p) => p.id));
  const availableStaff = staff.filter((s) => !selected.has(s.id));
  const availableContacts = contacts.filter((c) => !selected.has(c.id));

  function add(id: string) {
    const next = [...staff, ...contacts].find((c) => c.id === id);
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
        <p className="mb-2 text-[13px] text-ink-3">Nobody yet</p>
      ) : (
        <ul className="mb-2 space-y-1.5">
          {people.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <Avatar name={p.name} image={p.image} size={24} />
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{label(p)}</span>
              {p.role === "CUSTOMER" ? <Badge tone="violet">Customer</Badge> : null}
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
        </ul>
      )}

      <select
        value=""
        disabled={pending || (availableStaff.length === 0 && availableContacts.length === 0)}
        onChange={(e) => {
          const id = e.target.value;
          if (id) add(id);
        }}
        className="w-full rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-[13px] text-ink focus:border-brand focus:outline-none"
      >
        <option value="">Add an assignee…</option>
        {availableStaff.length > 0 ? (
          <optgroup label="Your team">
            {availableStaff.map((s) => (
              <option key={s.id} value={s.id}>
                {label(s)}
              </option>
            ))}
          </optgroup>
        ) : null}
        {availableContacts.length > 0 ? (
          <optgroup label={customerName ? `${customerName} contacts` : "Customer contacts"}>
            {availableContacts.map((c) => (
              <option key={c.id} value={c.id}>
                {label(c)}
                {c.title ? ` · ${c.title}` : ""}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>

      <p className="mt-1.5 text-[12px] leading-snug text-ink-3">
        More than one person can share a task. Adding someone keeps everyone already named.
      </p>
      {contacts.length === 0 ? (
        <p className="mt-1.5 text-[12px] leading-snug text-ink-3">
          No contacts invited for this customer yet — add one from the customer&apos;s page.
        </p>
      ) : null}
      {error ? <p className="mt-1.5 text-[12px] text-red">{error}</p> : null}
    </div>
  );
}
