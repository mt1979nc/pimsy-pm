"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { inviteCustomerContact, setUserActive, resendCustomerInvite } from "@/actions/customers";
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
  const [inviteSkipped, setInviteSkipped] = useState(false);
  const [copied, setCopied] = useState(false);
  const [state, action] = useActionState(inviteCustomerContact, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setOpen(false);
      setInviteSkipped(Boolean(state.inviteSkipped) && !state.inviteUrl);
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

      {inviteSkipped ? (
        <p className="border-b border-border bg-amber-soft px-5 py-2.5 text-[12.5px] text-amber">
          That contact already has PATH access or a pending invite. Use Resend invite if they
          need a new link.
        </p>
      ) : null}

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
            They&apos;ll get a PATH invite email with a one-click set-password link when Resend
            is configured. Repeats are skipped if they already have a pending invite or have
            signed in — use Resend invite on the contact if they need a new link. They can only
            ever see this customer&apos;s projects, and only the parts marked visible to the
            customer. A copyable invite link appears here after a new send.
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

export function ResendContactInvite({ userId }: { userId: string }) {
  const [pending, start] = useTransition();
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [emailSkipped, setEmailSkipped] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="shrink-0 text-right">
      {inviteUrl ? (
        <div className="mb-1 max-w-[220px] space-y-1">
          <p className="text-[11px] text-ink-3">
            {emailSkipped ? "Link created (email not sent):" : "New invite sent. Copy:"}
          </p>
          <input
            readOnly
            value={inviteUrl}
            className={`${inputClass} font-mono text-[11px]`}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            onClick={() => void copyLink()}
            className="text-[12px] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await resendCustomerInvite(userId);
              if (result.error) {
                setError(result.error);
                return;
              }
              if (result.inviteUrl) {
                setInviteUrl(result.inviteUrl);
                setEmailSkipped(Boolean(result.emailSkipped));
                setCopied(false);
              }
            })
          }
          className="text-[12px] text-ink-3 underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
        >
          {pending ? "Sending…" : "Resend invite"}
        </button>
      )}
      {error ? <p className="text-[11px] text-red">{error}</p> : null}
    </div>
  );
}
