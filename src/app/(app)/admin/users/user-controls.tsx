"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { inviteStaff, setUserRole } from "@/actions/admin";
import { setUserActive } from "@/actions/customers";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Button, inputClass, Field } from "@/components/ui";

export function InviteStaffForm() {
  const [state, action] = useActionState(inviteStaff, {});
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setOpen(false);
    }
  }, [state.ok]);

  if (!open) {
    return (
      <Button variant="primary" onClick={() => setOpen(true)}>
        Invite teammate
      </Button>
    );
  }

  return (
    <form ref={ref} action={action} className="space-y-3 border-b border-border p-5">
      <FormError error={state.error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="staffName">
          <input id="staffName" name="name" required autoFocus className={inputClass} />
        </Field>
        <Field label="Work email" htmlFor="staffEmail">
          <input id="staffEmail" name="email" type="email" required className={inputClass} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Role" htmlFor="staffRole">
          <select id="staffRole" name="role" defaultValue="SPECIALIST" className={inputClass}>
            <option value="SPECIALIST">Specialist</option>
            <option value="MEMBER">Member</option>
            <option value="MANAGER">Manager</option>
            <option value="ADMIN">Admin</option>
          </select>
        </Field>
        <Field label="Title" htmlFor="staffTitle">
          <input id="staffTitle" name="title" className={inputClass} />
        </Field>
        <Field label="Capacity (h/wk)" htmlFor="staffCapacity">
          <input
            id="staffCapacity"
            name="capacityHoursPerWeek"
            type="number"
            min="1"
            max="80"
            defaultValue={30}
            className={inputClass}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <SubmitButton size="sm" pendingLabel="Inviting…">
          Send invite
        </SubmitButton>
      </div>
    </form>
  );
}

export function RoleSelect({
  userId,
  role,
  disabled,
}: {
  userId: string;
  role: string;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <select
        value={role}
        disabled={disabled || pending}
        onChange={(e) => {
          const next = e.target.value;
          setError(null);
          start(async () => {
            try {
              await setUserRole(userId, next);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not change role.");
            }
          });
        }}
        className="rounded-md border border-border bg-surface px-1.5 py-1 text-[12.5px] capitalize text-ink-2 disabled:opacity-60"
      >
        {["OWNER", "ADMIN", "MANAGER", "SPECIALIST", "MEMBER"].map((r) => (
          <option key={r} value={r}>
            {r.toLowerCase()}
          </option>
        ))}
      </select>
      {error ? <p className="mt-0.5 text-[11.5px] text-red">{error}</p> : null}
    </div>
  );
}

export function ActiveToggle({ userId, isActive }: { userId: string; isActive: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (await setUserActive(userId, !isActive)))}
      className="text-[12px] text-ink-3 underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
    >
      {isActive ? "Deactivate" : "Reactivate"}
    </button>
  );
}
