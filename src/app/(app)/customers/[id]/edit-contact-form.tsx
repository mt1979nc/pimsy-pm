"use client";

import { useActionState, useState } from "react";
import { updateCustomerContact } from "@/actions/customers";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Button, Field, inputClass } from "@/components/ui";

export function EditContactForm({
  contact,
}: {
  contact: { id: string; name: string | null; title: string | null; phone: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(updateCustomerContact, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
      >
        Edit
      </button>
    );
  }

  return (
    <form action={action} className="mt-2 space-y-2 rounded-lg border border-border bg-surface-2 p-3">
      <input type="hidden" name="userId" value={contact.id} />
      <FormError error={state.error} />
      {state.ok ? <p className="text-[12px] text-green">Saved — About cards update from this record.</p> : null}
      <Field label="Name" htmlFor={`edit-name-${contact.id}`}>
        <input
          id={`edit-name-${contact.id}`}
          name="name"
          required
          defaultValue={contact.name ?? ""}
          className={inputClass}
        />
      </Field>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Title" htmlFor={`edit-title-${contact.id}`}>
          <input
            id={`edit-title-${contact.id}`}
            name="title"
            defaultValue={contact.title ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Phone" htmlFor={`edit-phone-${contact.id}`}>
          <input
            id={`edit-phone-${contact.id}`}
            name="phone"
            defaultValue={contact.phone ?? ""}
            className={inputClass}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" type="button" variant="secondary" onClick={() => setOpen(false)}>
          Close
        </Button>
        <SubmitButton size="sm" pendingLabel="Saving…">
          Save contact
        </SubmitButton>
      </div>
    </form>
  );
}
