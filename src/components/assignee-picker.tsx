"use client";

import { useState, useTransition } from "react";
import { assignTask } from "@/actions/tasks";
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

/**
 * Assign a task to a person — your team, or a named contact at the customer.
 * Picking a customer contact makes the task customer-side and customer-visible,
 * which the control says out loud rather than doing silently.
 */
export function AssigneePicker({
  taskId,
  current,
  staff,
  contacts,
  customerName,
}: {
  taskId: string;
  current: Candidate | null;
  staff: Candidate[];
  contacts: Candidate[];
  customerName?: string | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(current?.id ?? "");

  function change(next: string) {
    setError(null);
    setValue(next);
    start(async () => {
      try {
        await assignTask(taskId, next || null);
      } catch (e) {
        setValue(current?.id ?? "");
        setError(e instanceof Error ? e.message : "Could not assign that.");
      }
    });
  }

  const selectedIsContact = contacts.some((c) => c.id === value);

  return (
    <div className={cn(pending && "opacity-60")}>
      <div className="mb-1.5 flex items-center gap-2">
        {current ? (
          <>
            <Avatar name={current.name} image={current.image} size={24} />
            <span className="truncate text-[13px] text-ink">{current.name ?? current.email}</span>
            {current.role === "CUSTOMER" ? <Badge tone="violet">Customer</Badge> : null}
          </>
        ) : (
          <span className="text-[13px] text-ink-3">Nobody yet</span>
        )}
      </div>

      <select
        value={value}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        className="w-full rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-[13px] text-ink focus:border-brand focus:outline-none"
      >
        <option value="">Unassigned</option>
        <optgroup label="Your team">
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name ?? s.email}
            </option>
          ))}
        </optgroup>
        {contacts.length > 0 ? (
          <optgroup label={customerName ? `${customerName} contacts` : "Customer contacts"}>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name ?? c.email}
                {c.title ? ` · ${c.title}` : ""}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>

      {selectedIsContact ? (
        <p className="mt-1.5 text-[12px] leading-snug text-ink-3">
          Assigning a customer contact makes this their action item and shows it in their portal.
        </p>
      ) : null}
      {contacts.length === 0 ? (
        <p className="mt-1.5 text-[12px] leading-snug text-ink-3">
          No contacts invited for this customer yet — add one from the customer&apos;s page.
        </p>
      ) : null}
      {error ? <p className="mt-1.5 text-[12px] text-red">{error}</p> : null}
    </div>
  );
}
