import { Field, inputClass } from "@/components/ui";

/** Optional PATH portal contact on New customer / New project. Auto-invited. */
export function PortalContactFields({ disabled = false }: { disabled?: boolean }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact name" htmlFor="contactName">
          <input
            id="contactName"
            name="contactName"
            autoComplete="name"
            disabled={disabled}
            placeholder="Jordan Lee"
            className={inputClass}
          />
        </Field>
        <Field label="Work email" htmlFor="contactEmail" hint="Cannot be a staff domain.">
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            autoComplete="email"
            disabled={disabled}
            placeholder="jordan@practice.example"
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Title" htmlFor="contactTitle">
        <input
          id="contactTitle"
          name="contactTitle"
          disabled={disabled}
          placeholder="Practice Administrator"
          className={inputClass}
        />
      </Field>
      <p className="text-[12px] leading-relaxed text-ink-3">
        Optional. PATH emails a one-time set-password / magic invite via Resend when this contact is
        created. Repeats are skipped until staff uses Resend invite. Never include patient
        information in this form.
      </p>
    </div>
  );
}
