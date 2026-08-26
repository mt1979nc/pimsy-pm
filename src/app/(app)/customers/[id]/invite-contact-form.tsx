"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { inviteCustomerContact, setUserActive } from "@/actions/customers";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Button, inputClass, Field } from "@/components/ui";

export function InviteContactForm({
  customerAccountId,
  projects,
}: {
  customerAccountId: string;
  projects: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(inviteCustomerContact, {});
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state.ok]);

  if (!open) {
    return (
      <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
        Invite contact
      </Button>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-3 border-t border-border p-4">
      <input type="hidden" name="customerAccountId" value={customerAccountId} />
      <FormError error={state.error} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="contactName">
          <input id="contactName" name="name" required autoFocus className={inputClass} />
        </Field>
        <Field label="Work email" htmlFor="contactEmail">
          <input id="contactEmail" name="email" type="email" required className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" htmlFor="contactTitle">
          <input
            id="contactTitle"
            name="title"
            placeholder="Practice Administrator"
            className={inputClass}
          />
        </Field>
        <Field label="Add to project" htmlFor="contactProject">
          <select id="contactProject" name="projectId" className={inputClass}>
            <option value="">Account access only</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <p className="text-[12px] leading-relaxed text-ink-3">
        They&apos;ll get an email with a one-click sign-in link. They can only ever see this
        customer&apos;s projects, and only the parts marked visible to the customer.
      </p>

      <div className="flex justify-end gap-2">
        <Button size="sm" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <SubmitButton size="sm" pendingLabel="Sending…">
          Send invite
        </SubmitButton>
      </div>
    </form>
  );
}

export function ToggleContactActive({
  userId,
  isActive,
}: {
  userId: string;
  isActive: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (await setUserActive(userId, !isActive)))}
      className="text-[12px] text-ink-3 underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
    >
      {isActive ? "Revoke access" : "Restore access"}
    </button>
  );
}
