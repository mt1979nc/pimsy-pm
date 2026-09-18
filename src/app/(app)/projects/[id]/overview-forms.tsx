"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  publishStatusUpdate,
  createRisk,
  setRiskStatus,
  editStatusUpdate,
  deleteStatusUpdate,
  editRisk,
  deleteRisk,
} from "@/actions/projects";
import { toggleMilestone, createMilestone } from "@/actions/tasks";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Field, inputClass, Button, VisibilityBadge, HealthBadge, SeverityBadge, Avatar } from "@/components/ui";
import { MentionBody } from "@/components/mention-body";
import { MentionTextarea } from "@/components/mention-textarea";
import { cn } from "@/lib/cn";
import { fmtRelative } from "@/lib/dates";
import { canEditAuthoredRecord } from "@/lib/authored-content";
import type { ActionState } from "@/actions/messages";
import type { MentionCandidate } from "@/lib/mentions";
import {
  PROJECT_UPDATES_DUE_TODAY_LABEL,
  PROJECT_UPDATES_THURSDAY_HEADLINE,
  PROJECT_UPDATES_THURSDAY_ITEMS,
} from "@/lib/project-updates";
import { isWeeklyUpdateReminderDay } from "@/lib/weekly-status-update";

function WeeklyUpdateInstruction() {
  const dueToday = isWeeklyUpdateReminderDay(new Date());
  return (
    <div className="border-b border-border px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[12.5px] font-medium text-ink">{PROJECT_UPDATES_THURSDAY_HEADLINE}</p>
        {dueToday ? (
          <span className="rounded-full bg-amber-soft px-2 py-0.5 text-[11px] font-medium text-amber">
            {PROJECT_UPDATES_DUE_TODAY_LABEL}
          </span>
        ) : null}
      </div>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] leading-snug text-ink-3">
        {PROJECT_UPDATES_THURSDAY_ITEMS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status update composer — replaces the weekly "where are we?" email
// ---------------------------------------------------------------------------

export function StatusUpdateForm({
  projectId,
  currentHealth,
  mentionCandidates = [],
}: {
  projectId: string;
  currentHealth: string;
  mentionCandidates?: MentionCandidate[];
}) {
  const [state, action] = useActionState(publishStatusUpdate, {});
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState<"SHARED" | "INTERNAL">("SHARED");

  return (
    <div>
      <WeeklyUpdateInstruction />
      {open ? (
        <form action={action} className="space-y-3 border-b border-border p-4">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="visibility" value={visibility} />
          <FormError error={state.error} />

          <Field label="Summary" htmlFor="summary" hint="Type @ to mention">
            <MentionTextarea
              id="summary"
              name="summary"
              rows={2}
              required
              autoFocus
              candidates={mentionCandidates}
              visibility={visibility}
              placeholder="Config is complete and we start staff training Monday."
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Done this period" htmlFor="accomplished">
              <MentionTextarea
                id="accomplished"
                name="accomplished"
                rows={3}
                candidates={mentionCandidates}
                visibility={visibility}
              />
            </Field>
            <Field label="Coming up next" htmlFor="upcoming">
              <MentionTextarea
                id="upcoming"
                name="upcoming"
                rows={3}
                candidates={mentionCandidates}
                visibility={visibility}
              />
            </Field>
            <Field label="What we need from you" htmlFor="needsFromYou">
              <MentionTextarea
                id="needsFromYou"
                name="needsFromYou"
                rows={3}
                candidates={mentionCandidates}
                visibility={visibility}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <Field label="Health" htmlFor="health" className="w-[190px]">
              <select id="health" name="health" defaultValue={currentHealth} className={inputClass}>
                <option value="GREEN">On track</option>
                <option value="YELLOW">Needs attention</option>
                <option value="RED">At risk</option>
              </select>
            </Field>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setVisibility(visibility === "SHARED" ? "INTERNAL" : "SHARED")}
                title="Toggle who sees this update"
              >
                <VisibilityBadge visibility={visibility} />
              </button>
              <Button size="sm" type="button" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <SubmitButton size="sm" pendingLabel="Publishing…">
                {visibility === "SHARED" ? "Publish to customer" : "Save internal note"}
              </SubmitButton>
            </div>
          </div>
        </form>
      ) : (
        <div className="flex justify-end border-b border-border px-4 py-2">
          <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
            Post update
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export function MilestoneToggle({
  milestoneId,
  completed,
  label,
}: {
  milestoneId: string;
  completed: boolean;
  label: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={completed ? `Reopen ${label}` : `Complete ${label}`}
      onClick={() => start(async () => void (await toggleMilestone(milestoneId)))}
      className={cn(
        "flex size-[17px] shrink-0 items-center justify-center rounded-full border transition-colors",
        completed
          ? "border-green bg-green text-white"
          : "border-border-strong bg-surface hover:border-brand",
        pending && "opacity-50",
      )}
    >
      {completed ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
          <path d="m5 13 4.5 4.5L19 7" />
        </svg>
      ) : null}
    </button>
  );
}

export function AddMilestoneForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState(createMilestone, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full px-4 py-2.5 text-left text-[13px] text-ink-3 hover:bg-surface-2 hover:text-ink"
      >
        + Add milestone
      </button>
    );
  }

  return (
    <form action={action} className="space-y-2.5 border-t border-border p-4">
      <input type="hidden" name="projectId" value={projectId} />
      <FormError error={state.error} />
      <input
        name="name"
        required
        autoFocus
        placeholder="Milestone name"
        className={inputClass}
      />
      <div className="flex items-center gap-2">
        <input name="dueDate" type="date" className={inputClass} />
        <select name="visibility" defaultValue="SHARED" className={inputClass}>
          <option value="SHARED">Customer sees it</option>
          <option value="INTERNAL">Internal only</option>
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <SubmitButton size="sm">Add</SubmitButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Risks
// ---------------------------------------------------------------------------

export function AddRiskForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState(createRisk, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full px-4 py-2.5 text-left text-[13px] text-ink-3 hover:bg-surface-2 hover:text-ink"
      >
        + Log a risk
      </button>
    );
  }

  return (
    <form action={action} className="space-y-2.5 border-t border-border p-4">
      <input type="hidden" name="projectId" value={projectId} />
      <FormError error={state.error} />
      <input
        name="title"
        required
        autoFocus
        placeholder="What could derail this?"
        className={inputClass}
      />
      <textarea
        name="description"
        rows={2}
        placeholder="Impact and mitigation (optional)"
        className={inputClass}
      />
      <div className="flex items-center gap-2">
        <select name="severity" defaultValue="MEDIUM" className={inputClass}>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>
        <select name="visibility" defaultValue="INTERNAL" className={inputClass}>
          <option value="INTERNAL">Internal only</option>
          <option value="SHARED">Customer sees it</option>
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <SubmitButton size="sm">Log risk</SubmitButton>
      </div>
    </form>
  );
}

export function RiskStatusControl({ riskId, status }: { riskId: string; status: string }) {
  const [pending, start] = useTransition();
  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        start(async () => void (await setRiskStatus(riskId, next)));
      }}
      className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11.5px] text-ink-2"
    >
      <option value="OPEN">Open</option>
      <option value="MITIGATING">Mitigating</option>
      <option value="RESOLVED">Resolved</option>
      <option value="ACCEPTED">Accepted</option>
    </select>
  );
}

function EditDeleteLinks({
  onEdit,
  onDelete,
  deleting,
}: {
  onEdit: () => void;
  onDelete: () => void;
  deleting?: boolean;
}) {
  return (
    <span className="ml-auto flex items-center gap-2">
      <button type="button" className="text-[12px] text-ink-3 hover:text-ink hover:underline" onClick={onEdit}>
        Edit
      </button>
      <button
        type="button"
        disabled={deleting}
        className="text-[12px] text-ink-3 hover:text-red hover:underline"
        onClick={onDelete}
      >
        Delete
      </button>
    </span>
  );
}

export function StatusUpdateItem({
  update,
  currentUserId,
  currentUserRole,
  mentionCandidates = [],
}: {
  update: {
    id: string;
    summary: string;
    accomplished: string | null;
    upcoming: string | null;
    needsFromYou: string | null;
    health: "GREEN" | "YELLOW" | "RED";
    visibility: "INTERNAL" | "SHARED";
    publishedAt: Date | string | null;
    editedAt: Date | string | null;
    authorId: string;
    author: { id: string; name: string | null; image?: string | null };
  };
  currentUserId: string;
  currentUserRole: string;
  mentionCandidates?: MentionCandidate[];
}) {
  const canManage = canEditAuthoredRecord({ id: currentUserId, role: currentUserRole }, update.authorId);
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState(editStatusUpdate, {} as ActionState);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state]);

  if (editing) {
    return (
      <form action={action} className="space-y-3 px-5 py-4">
        <input type="hidden" name="updateId" value={update.id} />
        <FormError error={state.error} />
        <Field label="Summary" htmlFor={`summary-${update.id}`}>
          <MentionTextarea
            id={`summary-${update.id}`}
            name="summary"
            rows={2}
            required
            defaultValue={update.summary}
            candidates={mentionCandidates}
            visibility={update.visibility}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Done this period" htmlFor={`accomplished-${update.id}`}>
            <MentionTextarea
              id={`accomplished-${update.id}`}
              name="accomplished"
              rows={3}
              defaultValue={update.accomplished ?? ""}
              candidates={mentionCandidates}
              visibility={update.visibility}
            />
          </Field>
          <Field label="Coming up next" htmlFor={`upcoming-${update.id}`}>
            <MentionTextarea
              id={`upcoming-${update.id}`}
              name="upcoming"
              rows={3}
              defaultValue={update.upcoming ?? ""}
              candidates={mentionCandidates}
              visibility={update.visibility}
            />
          </Field>
          <Field label="What we need from you" htmlFor={`needs-${update.id}`}>
            <MentionTextarea
              id={`needs-${update.id}`}
              name="needsFromYou"
              rows={3}
              defaultValue={update.needsFromYou ?? ""}
              candidates={mentionCandidates}
              visibility={update.visibility}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Field label="Health" htmlFor={`health-${update.id}`} className="w-[190px]">
            <select
              id={`health-${update.id}`}
              name="health"
              defaultValue={update.health}
              className={inputClass}
            >
              <option value="GREEN">On track</option>
              <option value="YELLOW">Needs attention</option>
              <option value="RED">At risk</option>
            </select>
          </Field>
          <div className="flex items-center gap-2">
            <Button size="sm" type="button" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <SubmitButton size="sm" pendingLabel="Saving…">
              Save
            </SubmitButton>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div className="px-5 py-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Avatar name={update.author.name} image={update.author.image} size={22} />
        <span className="text-[13px] font-medium text-ink">{update.author.name}</span>
        <span className="text-[12px] text-ink-3">{fmtRelative(update.publishedAt)}</span>
        {update.editedAt ? <span className="text-[11.5px] text-ink-3">edited</span> : null}
        <HealthBadge health={update.health} />
        <VisibilityBadge visibility={update.visibility} />
        {canManage ? (
          <EditDeleteLinks
            onEdit={() => setEditing(true)}
            deleting={pending}
            onDelete={() => {
              if (!confirm("Delete this update?")) return;
              setError(null);
              start(async () => {
                try {
                  await deleteStatusUpdate(update.id);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not delete.");
                }
              });
            }}
          />
        ) : null}
      </div>
      {error ? <p className="mb-2 text-[12px] text-red">{error}</p> : null}
      <MentionBody
        text={update.summary}
        className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink"
      />
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {[
          ["Completed", update.accomplished],
          ["Next", update.upcoming],
          ["Needs from customer", update.needsFromYou],
        ]
          .filter(([, v]) => v)
          .map(([label, v]) => (
            <div key={label as string} className="rounded-lg bg-surface-2 p-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                {label}
              </div>
              <MentionBody
                text={v as string}
                className="mt-1 whitespace-pre-wrap text-[12.5px] leading-snug text-ink-2"
              />
            </div>
          ))}
      </div>
    </div>
  );
}

export function RiskItem({
  risk,
  currentUserId,
  currentUserRole,
}: {
  risk: {
    id: string;
    title: string;
    description: string | null;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    status: string;
    visibility: "INTERNAL" | "SHARED";
    ownerId: string | null;
    editedAt: Date | string | null;
    owner: { id: string; name: string | null } | null;
  };
  currentUserId: string;
  currentUserRole: string;
}) {
  const canManage = canEditAuthoredRecord({ id: currentUserId, role: currentUserRole }, risk.ownerId);
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState(editRisk, {} as ActionState);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state]);

  if (editing) {
    return (
      <form action={action} className="space-y-2.5 px-4 py-2.5">
        <input type="hidden" name="riskId" value={risk.id} />
        <FormError error={state.error} />
        <input name="title" required defaultValue={risk.title} className={inputClass} />
        <textarea
          name="description"
          rows={2}
          defaultValue={risk.description ?? ""}
          className={inputClass}
        />
        <select name="severity" defaultValue={risk.severity} className={inputClass}>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>
        <div className="flex justify-end gap-2">
          <Button size="sm" type="button" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <SubmitButton size="sm" pendingLabel="Saving…">
            Save
          </SubmitButton>
        </div>
      </form>
    );
  }

  return (
    <div className="px-4 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] text-ink">
          {risk.title}
          {risk.editedAt ? (
            <span className="ml-2 text-[11.5px] font-normal text-ink-3">edited</span>
          ) : null}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <SeverityBadge severity={risk.severity} />
          {canManage ? (
            <EditDeleteLinks
              onEdit={() => setEditing(true)}
              deleting={pending}
              onDelete={() => {
                if (!confirm("Delete this risk?")) return;
                setError(null);
                start(async () => {
                  try {
                    await deleteRisk(risk.id);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not delete.");
                  }
                });
              }}
            />
          ) : null}
        </div>
      </div>
      {risk.description ? (
        <p className="mt-1 text-[12.5px] leading-snug text-ink-3">{risk.description}</p>
      ) : null}
      {error ? <p className="mt-1 text-[12px] text-red">{error}</p> : null}
      <div className="mt-1.5 flex items-center gap-2">
        <RiskStatusControl riskId={risk.id} status={risk.status} />
        {risk.owner ? <span className="text-[12px] text-ink-3">{risk.owner.name}</span> : null}
        <VisibilityBadge visibility={risk.visibility} />
      </div>
    </div>
  );
}
