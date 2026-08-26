"use client";

import { useActionState, useState, useTransition } from "react";
import { publishStatusUpdate, createRisk, setRiskStatus } from "@/actions/projects";
import { toggleMilestone, createMilestone } from "@/actions/tasks";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Field, inputClass, Button, VisibilityBadge } from "@/components/ui";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Status update composer — replaces the weekly "where are we?" email
// ---------------------------------------------------------------------------

export function StatusUpdateForm({
  projectId,
  currentHealth,
}: {
  projectId: string;
  currentHealth: string;
}) {
  const [state, action] = useActionState(publishStatusUpdate, {});
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState<"SHARED" | "INTERNAL">("SHARED");

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Post an update
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-3 border-t border-border p-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="visibility" value={visibility} />
      <FormError error={state.error} />

      <Field label="Summary" htmlFor="summary">
        <textarea
          id="summary"
          name="summary"
          rows={2}
          required
          autoFocus
          placeholder="Config is complete and we start staff training Monday."
          className={inputClass}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Done this period" htmlFor="accomplished">
          <textarea id="accomplished" name="accomplished" rows={3} className={inputClass} />
        </Field>
        <Field label="Coming up next" htmlFor="upcoming">
          <textarea id="upcoming" name="upcoming" rows={3} className={inputClass} />
        </Field>
        <Field label="What we need from you" htmlFor="needsFromYou">
          <textarea id="needsFromYou" name="needsFromYou" rows={3} className={inputClass} />
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
