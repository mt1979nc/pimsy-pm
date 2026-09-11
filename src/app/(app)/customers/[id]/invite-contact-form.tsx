"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { inviteCustomerContact, setUserActive } from "@/actions/customers";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Button, inputClass, Field, CardHeader } from "@/components/ui";

export function PortalContactsPanel({
  customerAccountId,
  projects,
  children,
}: {
  customerAccountId: string;
  projects: { id: string; name: string }[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [emailSkipped, setEmailSkipped] = useState(false);
  const [copied, setCopied] = useState(false);
  const [state, action] = useActionState(inviteCustomerContact, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setOpen(false);
      if (state.inviteUrl) {
        setInviteUrl(state.inviteUrl);
        setEmailSkipped(Boolean(state.emailSkipped));
        setCopied(false);
      }
    }
  }, [state]);

  async function copyLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <CardHeader
        title="Portal contacts"
        subtitle="Who can sign in to see this customer's projects"
        action={
          !open ? (
            <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
              Invite contact
            </Button>
          ) : null
        }
      />

      {inviteUrl ? (
        <div className="space-y-2 border-b border-border bg-brand-soft px-5 py-3">
          <p className="text-[12.5px] font-medium text-ink">
            {emailSkipped
              ? "Invite created — email was not sent (no Resend key). Copy this link for the contact:"
              : "Invite sent. Staff copy of the magic/set-password link:"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={inviteUrl}
              className={`${inputClass} min-w-0 flex-1 font-mono text-[12px]`}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button size="sm" variant="secondary" type="button" onClick={() => void copyLink()}>
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button size="sm" type="button" onClick={() => setInviteUrl(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      {open ? (
        <form ref={formRef} action={action} className="space-y-3 border-b border-border px-5 py-4">
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
            They&apos;ll get an email with a one-click sign-in link when Resend is configured.
            They can only ever see this customer&apos;s projects, and only the parts marked visible
            to the customer. A copyable invite link always appears here for staff after send.
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
      ) : null}

      {children}
    </>
  );
}

/** @deprecated Prefer PortalContactsPanel — kept for ToggleContactActive export site. */
export function InviteContactForm({
  customerAccountId,
  projects,
}: {
  customerAccountId: string;
  projects: { id: string; name: string }[];
}) {
  return (
    <PortalContactsPanel customerAccountId={customerAccountId} projects={projects}>
      {null}
    </PortalContactsPanel>
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
