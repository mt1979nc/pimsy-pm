"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addTaskComment } from "@/actions/tasks";
import { SubmitButton, FormError } from "@/components/submit-button";
import { inputClass, VisibilityBadge, Avatar, Badge, EmptyState } from "@/components/ui";
import { fmtRelative } from "@/lib/dates";

type Comment = {
  id: string;
  body: string;
  visibility: "INTERNAL" | "SHARED";
  createdAt: Date | string;
  author: { id: string; name: string | null; image?: string | null; role: string };
};

export function TaskComments({
  taskId,
  comments,
  currentUserId,
  canChooseVisibility,
  taskIsInternal,
}: {
  taskId: string;
  comments: Comment[];
  currentUserId: string;
  canChooseVisibility: boolean;
  taskIsInternal: boolean;
}) {
  const [state, action] = useActionState(addTaskComment, {});
  const [visibility, setVisibility] = useState<"INTERNAL" | "SHARED">(
    canChooseVisibility && !taskIsInternal ? "SHARED" : canChooseVisibility ? "INTERNAL" : "SHARED",
  );
  const formRef = useRef<HTMLFormElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      taRef.current?.focus();
    }
  }, [state.ok]);

  const effective = taskIsInternal ? "INTERNAL" : visibility;

  return (
    <div>
      {comments.length === 0 ? (
        <EmptyState
          title="No comments yet"
          description={
            canChooseVisibility
              ? "Ask a question, record a decision, or leave a note for your team."
              : "Ask your implementation team anything about this item."
          }
        />
      ) : (
        <div className="divide-y divide-border">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3 px-5 py-3.5">
              <Avatar name={c.author.name} image={c.author.image} size={28} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-ink">
                    {c.author.name}
                    {c.author.id === currentUserId ? (
                      <span className="ml-1 font-normal text-ink-3">(you)</span>
                    ) : null}
                  </span>
                  {c.author.role === "CUSTOMER" ? <Badge tone="violet">Customer</Badge> : null}
                  <span className="text-[12px] text-ink-3">{fmtRelative(c.createdAt)}</span>
                  {canChooseVisibility ? <VisibilityBadge visibility={c.visibility} /> : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">
                  {c.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <form ref={formRef} action={action} className="border-t border-border p-4">
        <input type="hidden" name="taskId" value={taskId} />
        <input type="hidden" name="visibility" value={effective} />
        <FormError error={state.error} />
        <textarea
          ref={taRef}
          name="body"
          rows={3}
          required
          placeholder={
            effective === "SHARED"
              ? "Write a comment — the customer will see this."
              : "Write a comment — internal only."
          }
          className={inputClass}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {canChooseVisibility ? (
            <button
              type="button"
              disabled={taskIsInternal}
              title={
                taskIsInternal
                  ? "This task is internal, so its comments are too"
                  : "Toggle whether the customer can see this comment"
              }
              onClick={() => setVisibility(visibility === "SHARED" ? "INTERNAL" : "SHARED")}
              className="disabled:opacity-70"
            >
              <VisibilityBadge visibility={effective} />
            </button>
          ) : (
            <span className="text-[12px] text-ink-3">
              Visible to your implementation team.
            </span>
          )}
          <div className="flex items-center gap-2">
            <span className="hidden text-[11.5px] text-ink-3 sm:inline">⌘↵ to post</span>
            <SubmitButton size="sm" pendingLabel="Posting…">
              Comment
            </SubmitButton>
          </div>
        </div>
      </form>
    </div>
  );
}
