"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addTaskComment, deleteTaskComment, editTaskComment } from "@/actions/tasks";
import { SubmitButton, FormError } from "@/components/submit-button";
import { VisibilityBadge, Avatar, Badge, EmptyState } from "@/components/ui";
import { MentionBody } from "@/components/mention-body";
import { MentionTextarea } from "@/components/mention-textarea";
import { fmtRelative } from "@/lib/dates";
import { canEditAuthoredRecord } from "@/lib/authored-content";
import type { MentionCandidate } from "@/lib/mentions";

type Comment = {
  id: string;
  body: string;
  visibility: "INTERNAL" | "SHARED";
  createdAt: Date | string;
  editedAt?: Date | string | null;
  author: { id: string; name: string | null; image?: string | null; role: string };
};

export function TaskComments({
  taskId,
  comments,
  currentUserId,
  currentUserRole,
  canChooseVisibility,
  taskIsInternal,
  readOnly = false,
  mentionCandidates = [],
}: {
  taskId: string;
  comments: Comment[];
  currentUserId: string;
  currentUserRole: string;
  canChooseVisibility: boolean;
  taskIsInternal: boolean;
  /** Customer view / portal preview: show SHARED comments without posting. */
  readOnly?: boolean;
  mentionCandidates?: MentionCandidate[];
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
            readOnly
              ? "Shared comments from your implementation team appear here."
              : canChooseVisibility
                ? "Ask a question, record a decision, or leave a note for your team."
                : "Ask your implementation team anything about this item."
          }
        />
      ) : (
        <div className="divide-y divide-border">
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              canChooseVisibility={canChooseVisibility}
              readOnly={readOnly}
              mentionCandidates={mentionCandidates}
            />
          ))}
        </div>
      )}

      {readOnly ? null : (
      <form ref={formRef} action={action} className="border-t border-border p-4">
        <input type="hidden" name="taskId" value={taskId} />
        <input type="hidden" name="visibility" value={effective} />
        <FormError error={state.error} />
        <MentionTextarea
          ref={taRef}
          name="body"
          rows={3}
          required
          candidates={mentionCandidates}
          visibility={effective}
          placeholder={
            effective === "SHARED"
              ? "Write a comment — the customer will see this. Type @ to mention."
              : "Write a comment — internal only. Type @ to mention."
          }
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
      )}
    </div>
  );
}

function CommentItem({
  comment,
  currentUserId,
  currentUserRole,
  canChooseVisibility,
  readOnly,
  mentionCandidates,
}: {
  comment: Comment;
  currentUserId: string;
  currentUserRole: string;
  canChooseVisibility: boolean;
  readOnly: boolean;
  mentionCandidates: MentionCandidate[];
}) {
  const canManage = !readOnly && canEditAuthoredRecord(
    { id: currentUserId, role: currentUserRole },
    comment.author.id,
  );
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    setBody(comment.body);
  }, [comment.body]);

  return (
    <div className="flex gap-3 px-5 py-3.5">
      <Avatar name={comment.author.name} image={comment.author.image} size={28} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-ink">
            {comment.author.name}
            {comment.author.id === currentUserId ? (
              <span className="ml-1 font-normal text-ink-3">(you)</span>
            ) : null}
          </span>
          {comment.author.role === "CUSTOMER" ? <Badge tone="violet">Customer</Badge> : null}
          <span className="text-[12px] text-ink-3">{fmtRelative(comment.createdAt)}</span>
          {comment.editedAt ? <span className="text-[11.5px] text-ink-3">edited</span> : null}
          {canChooseVisibility ? <VisibilityBadge visibility={comment.visibility} /> : null}
          {canManage && !editing ? (
            <span className="ml-auto flex items-center gap-2">
              <button
                type="button"
                className="text-[12px] text-ink-3 hover:text-ink hover:underline"
                onClick={() => {
                  setError(null);
                  setEditing(true);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                disabled={pending}
                className="text-[12px] text-ink-3 hover:text-red hover:underline"
                onClick={() => {
                  if (!confirm("Delete this comment?")) return;
                  setError(null);
                  start(async () => {
                    try {
                      await deleteTaskComment(comment.id);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Could not delete.");
                    }
                  });
                }}
              >
                Delete
              </button>
            </span>
          ) : null}
        </div>
        {editing ? (
          <div className="mt-2 space-y-2">
            {error ? <p className="text-[12px] text-red">{error}</p> : null}
            <MentionTextarea
              rows={3}
              value={body}
              onChange={setBody}
              candidates={mentionCandidates}
              visibility={comment.visibility}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="text-[12.5px] text-ink-3 hover:underline"
                onClick={() => {
                  setBody(comment.body);
                  setEditing(false);
                  setError(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending || !body.trim()}
                className="rounded-lg bg-[#113c64] px-2.5 py-1 text-[13px] font-medium text-white disabled:opacity-50"
                onClick={() =>
                  start(async () => {
                    try {
                      await editTaskComment(comment.id, body);
                      setEditing(false);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Could not save.");
                    }
                  })
                }
              >
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {error ? <p className="mt-1 text-[12px] text-red">{error}</p> : null}
            <MentionBody
              text={comment.body}
              className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink"
            />
          </>
        )}
      </div>
    </div>
  );
}
