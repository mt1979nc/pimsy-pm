"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addProjectMember, removeProjectMember } from "@/actions/projects";
import { inviteCustomerContact } from "@/actions/customers";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Button, Field, inputClass, Avatar, Badge, EmptyState } from "@/components/ui";
import { fmtRelative } from "@/lib/dates";

type Contact = {
  id: string;
  name: string | null;
  email: string;
  title: string | null;
  image?: string | null;
  isActive: boolean;
  lastSeenAt: Date | string | null;
};

/**
 * Who at the customer can see this project.
 *
 * Two different things live here and the difference matters: a contact exists
 * on the customer *account*, and separately is added to a *project*. Removing
 * someone from the project doesn't delete them; revoking their access is a
 * different, louder action taken on the customer record.
 */
export function ProjectContacts({
  projectId,
  customerId,
  customerName,
  onProject,
  available,
  portalEnabled,
}: {
  projectId: string;
  customerId: string | null;
  customerName: string | null;
  onProject: Contact[];
  available: Contact[];
  portalEnabled: boolean;
}) {
  const [addState, addAction] = useActionState(addProjectMember, {});
  const [inviteState, inviteAction] = useActionState(inviteCustomerContact, {});
  const [inviting, setInviting] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inviteRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (inviteState.ok) {
      inviteRef.current?.reset();
      setInviting(false);
    }
  }, [inviteState.ok]);

  if (!customerId) {
    return (
      <p className="px-5 py-4 text-[13px] text-ink-3">
        This is an internal project, so it has no customer contacts.
      </p>
    );
  }

  return (
    <div>
      {!portalEnabled ? (
        <p className="border-b border-border bg-amber-soft px-4 py-2.5 text-[12.5px] text-amber">
          The portal is switched off for this project, so nobody below can open it — even the
          people listed here.
        </p>
      ) : null}

      {onProject.length === 0 ? (
        <EmptyState
          title="No contacts on this project"
          description="Add someone from the practice so they can see their plan and action items."
        />
      ) : (
        <div className="divide-y divide-border">
          {onProject.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar name={c.name} image={c.image} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] text-ink">{c.name ?? c.email}</span>
                  {!c.isActive ? <Badge tone="red">Access revoked</Badge> : null}
                  {c.isActive && !c.lastSeenAt ? <Badge tone="amber">Never signed in</Badge> : null}
                </div>
                <div className="truncate text-[12px] text-ink-3">
                  {c.email}
                  {c.title ? ` · ${c.title}` : ""}
                  {c.lastSeenAt ? ` · seen ${fmtRelative(c.lastSeenAt)}` : ""}
                </div>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  start(async () => {
                    try {
                      await removeProjectMember(projectId, c.id);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Could not remove them.");
                    }
                  });
                }}
                className="shrink-0 text-[12px] text-ink-3 underline-offset-2 hover:text-red hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {error ? <p className="px-4 pb-2 text-[12px] text-red">{error}</p> : null}

      {available.length > 0 ? (
        <form action={addAction} className="flex flex-wrap items-end gap-2 border-t border-border p-4">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="role" value="CUSTOMER_CONTACT" />
          <Field label="Add an existing contact" htmlFor="contactPick" className="min-w-[220px] flex-1">
            <select id="contactPick" name="userId" required className={inputClass}>
              <option value="">Choose someone…</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? c.email}
                  {c.title ? ` · ${c.title}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <SubmitButton size="sm">Add to project</SubmitButton>
          <FormError error={addState.error} />
        </form>
      ) : null}

      {inviting ? (
        <form ref={inviteRef} action={inviteAction} className="space-y-3 border-t border-border bg-surface-2 p-4">
          <input type="hidden" name="customerAccountId" value={customerId} />
          <input type="hidden" name="projectId" value={projectId} />
          <FormError error={inviteState.error} />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="newName">
              <input id="newName" name="name" required autoFocus className={inputClass} />
            </Field>
            <Field label="Work email" htmlFor="newEmail">
              <input id="newEmail" name="email" type="email" required className={inputClass} />
            </Field>
          </div>
          <Field label="Title" htmlFor="newTitle">
            <input
              id="newTitle"
              name="title"
              placeholder="Practice Administrator"
              className={inputClass}
            />
          </Field>

          <p className="text-[12px] leading-relaxed text-ink-3">
            They&apos;ll get an email with a sign-in link and be added to this project. They can
            only ever see {customerName ?? "this customer"}&apos;s projects, and only the parts
            marked visible to the customer.
          </p>

          <div className="flex justify-end gap-2">
            <Button size="sm" type="button" onClick={() => setInviting(false)}>
              Cancel
            </Button>
            <SubmitButton size="sm" pendingLabel="Sending…">
              Invite & add
            </SubmitButton>
          </div>
        </form>
      ) : (
        <div className="border-t border-border px-4 py-2.5">
          <button
            type="button"
            onClick={() => setInviting(true)}
            className="text-[13px] text-ink-3 hover:text-ink"
          >
            + Invite a new contact
          </button>
        </div>
      )}
    </div>
  );
}
