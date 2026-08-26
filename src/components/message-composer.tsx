"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { postMessage, createThread, setThreadResolved, shareThreadWithCustomer } from "@/actions/messages";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Button, inputClass, VisibilityBadge } from "@/components/ui";
import { useTransition } from "react";

export function MessageComposer({
  threadId,
  visibility,
  placeholder,
}: {
  threadId: string;
  visibility: "INTERNAL" | "SHARED";
  placeholder?: string;
}) {
  const [state, action] = useActionState(postMessage, {});
  const formRef = useRef<HTMLFormElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      taRef.current?.focus();
    }
  }, [state.ok]);

  return (
    <form ref={formRef} action={action} className="border-t border-border p-3">
      <input type="hidden" name="threadId" value={threadId} />
      <FormError error={state.error} />
      <textarea
        ref={taRef}
        name="body"
        rows={3}
        required
        placeholder={
          placeholder ??
          (visibility === "SHARED"
            ? "Reply — the customer will see this and get an email."
            : "Reply — internal only, the customer cannot see this thread.")
        }
        className={inputClass}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <VisibilityBadge visibility={visibility} />
        <div className="flex items-center gap-2">
          <span className="hidden text-[11.5px] text-ink-3 sm:inline">⌘↵ to send</span>
          <SubmitButton size="sm" pendingLabel="Sending…">
            Send
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}

export function NewThreadForm({
  projectId,
  canChooseVisibility = true,
  portal = false,
}: {
  projectId: string;
  canChooseVisibility?: boolean;
  portal?: boolean;
}) {
  const [state, action] = useActionState(createThread, {});
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState<"INTERNAL" | "SHARED">(
    portal ? "SHARED" : "INTERNAL",
  );

  if (!open) {
    return (
      <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
        New conversation
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-2.5 rounded-xl border border-border bg-surface p-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="visibility" value={visibility} />
      <FormError error={state.error} />

      <input name="subject" required autoFocus placeholder="Subject" className={inputClass} />
      <textarea
        name="body"
        rows={4}
        required
        placeholder={
          visibility === "SHARED"
            ? "The customer will see this thread and be emailed."
            : "Internal back channel — the customer will never see this."
        }
        className={inputClass}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        {canChooseVisibility ? (
          <div className="inline-flex overflow-hidden rounded-lg border border-border-strong">
            <button
              type="button"
              onClick={() => setVisibility("INTERNAL")}
              className={`px-2.5 py-1 text-[12.5px] font-medium ${
                visibility === "INTERNAL" ? "bg-ink text-surface" : "bg-surface text-ink-2"
              }`}
            >
              Internal only
            </button>
            <button
              type="button"
              onClick={() => setVisibility("SHARED")}
              className={`px-2.5 py-1 text-[12.5px] font-medium ${
                visibility === "SHARED" ? "bg-brand text-brand-ink" : "bg-surface text-ink-2"
              }`}
            >
              With the customer
            </button>
          </div>
        ) : (
          <VisibilityBadge visibility={visibility} />
        )}

        <div className="flex items-center gap-2">
          <Button size="sm" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton size="sm" pendingLabel="Starting…">
            Start conversation
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}

export function ThreadActions({
  threadId,
  isResolved,
  visibility,
  canShare,
}: {
  threadId: string;
  isResolved: boolean;
  visibility: "INTERNAL" | "SHARED";
  canShare: boolean;
}) {
  const [pending, start] = useTransition();
  const [confirmShare, setConfirmShare] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() => start(async () => void (await setThreadResolved(threadId, !isResolved)))}
      >
        {isResolved ? "Reopen" : "Mark resolved"}
      </Button>

      {canShare && visibility === "INTERNAL" ? (
        confirmShare ? (
          <div className="flex items-center gap-1.5 rounded-lg bg-amber-soft px-2 py-1">
            <span className="text-[12px] text-amber">
              Share the whole thread with the customer? This can&apos;t be undone.
            </span>
            <Button
              size="sm"
              variant="primary"
              disabled={pending}
              onClick={() => start(async () => void (await shareThreadWithCustomer(threadId)))}
            >
              Share it
            </Button>
            <Button size="sm" onClick={() => setConfirmShare(false)}>
              No
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={() => setConfirmShare(true)}>
            Share with customer
          </Button>
        )
      ) : null}
    </div>
  );
}
