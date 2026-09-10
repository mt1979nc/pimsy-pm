"use client";

import { useActionState, useEffect, useRef } from "react";
import { createThread, type ActionState } from "@/actions/messages";
import { Button, Field, inputClass } from "@/components/ui";

const initial: ActionState = {};

/**
 * Customer messaging composer. Use `embedded` inside a card column; default
 * sticky footer still works on simple pages if needed.
 */
export function PortalMessageBox({
  projects,
  embedded = false,
}: {
  projects: { id: string; name: string }[];
  embedded?: boolean;
}) {
  const [state, action, pending] = useActionState(createThread, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  if (projects.length === 0) return null;

  const body = (
    <div className="rounded-xl border border-border-strong bg-surface p-4">
      <div className="mb-3">
        <h2 className="text-[14px] font-semibold text-ink">Message your team</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-2">
          Questions stay with your implementation project. We’ll see it in Dock-side threads.
        </p>
      </div>
      <form ref={formRef} action={action} className="space-y-3">
        <input type="hidden" name="visibility" value="SHARED" />
        {projects.length === 1 ? (
          <input type="hidden" name="projectId" value={projects[0].id} />
        ) : (
          <Field label="Project" htmlFor="portal-msg-project">
            <select
              id="portal-msg-project"
              name="projectId"
              required
              className={inputClass}
              defaultValue={projects[0]?.id}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Subject" htmlFor="portal-msg-subject">
          <input
            id="portal-msg-subject"
            name="subject"
            required
            maxLength={200}
            placeholder="What’s this about?"
            className={inputClass}
          />
        </Field>
        <Field label="Message" htmlFor="portal-msg-body">
          <textarea
            id="portal-msg-body"
            name="body"
            required
            rows={3}
            maxLength={20000}
            placeholder="Write a note for your specialist…"
            className={inputClass}
          />
        </Field>
        {state?.error ? (
          <p className="text-[12.5px] text-red">{state.error}</p>
        ) : null}
        {state?.ok ? (
          <p className="text-[12.5px] text-green">Sent — your team will see it shortly.</p>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Sending…" : "Send message"}
          </Button>
        </div>
      </form>
    </div>
  );

  if (embedded) return body;

  return (
    <div className="sticky bottom-0 z-20 -mx-1 mt-6 border-t border-border bg-bg/95 px-1 pb-2 pt-3 backdrop-blur supports-[backdrop-filter]:bg-bg/80">
      {body}
    </div>
  );
}
