"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  updateProject,
  addProjectMember,
  removeProjectMember,
  archiveProject,
  setPhaseVisibility,
} from "@/actions/projects";
import {
  addProjectRecording,
  setAttachmentVisibility,
  deleteAttachment,
} from "@/actions/attachments";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Button, Field, inputClass, VisibilityBadge } from "@/components/ui";

type Option = { id: string; name: string | null };

export function ProjectSettingsForm({
  project,
  staff,
}: {
  project: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    health: string;
    leadId: string | null;
    targetGoLiveDate: string | null;
    portalEnabled: boolean;
    portalWelcomeMessage: string | null;
  };
  staff: Option[];
}) {
  const [state, action] = useActionState(updateProject, {});
  const [goLive, setGoLive] = useState(project.targetGoLiveDate ?? "");
  const goLiveMoved = goLive !== (project.targetGoLiveDate ?? "") && goLive !== "";

  return (
    <form action={action} className="space-y-4 p-5">
      <input type="hidden" name="projectId" value={project.id} />
      <FormError error={state.error} />
      {state.ok ? (
        <p className="rounded-lg bg-green-soft px-3 py-2 text-[12.5px] text-green">Saved.</p>
      ) : null}

      <Field label="Project name" htmlFor="name">
        <input id="name" name="name" defaultValue={project.name} className={inputClass} />
      </Field>

      <Field label="Description" htmlFor="description">
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={project.description ?? ""}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Status" htmlFor="status">
          <select id="status" name="status" defaultValue={project.status} className={inputClass}>
            <option value="NOT_STARTED">Not started</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="ON_HOLD">On hold</option>
            <option value="BLOCKED">Blocked</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </Field>
        <Field label="Health" htmlFor="health">
          <select id="health" name="health" defaultValue={project.health} className={inputClass}>
            <option value="GREEN">On track</option>
            <option value="YELLOW">Needs attention</option>
            <option value="RED">At risk</option>
          </select>
        </Field>
        <Field label="Target go-live" htmlFor="targetGoLiveDate">
          <input
            id="targetGoLiveDate"
            name="targetGoLiveDate"
            type="date"
            value={goLive}
            onChange={(e) => setGoLive(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      {goLiveMoved ? (
        <div className="rounded-xl border border-transparent bg-amber-soft p-4">
          <p className="mb-2 text-[12.5px] font-medium text-ink">
            This moves the go-live date — what caused the slip?
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cause" htmlFor="slipCause">
              <select id="slipCause" name="slipCause" defaultValue="" className={inputClass}>
                <option value="">Skip for now</option>
                <option value="CUSTOMER">Customer-caused</option>
                <option value="PIMSY">PIMSY-caused</option>
              </select>
            </Field>
            <Field label="Note (optional)" htmlFor="slipNote">
              <input id="slipNote" name="slipNote" className={inputClass} />
            </Field>
          </div>
          <p className="mt-2 text-[11.5px] text-ink-3">
            Skippable, but shows up as untagged on the Analysis report until someone tags it.
          </p>
        </div>
      ) : null}

      <Field label="Implementation lead" htmlFor="leadId">
        <select
          id="leadId"
          name="leadId"
          defaultValue={project.leadId ?? ""}
          className={inputClass}
        >
          <option value="">Unassigned</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="rounded-xl border border-border p-4">
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            name="portalEnabled"
            defaultChecked={project.portalEnabled}
            className="mt-0.5"
          />
          <span>
            <span className="block text-[13.5px] font-medium text-ink">
              Customer portal enabled
            </span>
            <span className="block text-[12.5px] text-ink-3">
              When off, contacts at this practice cannot open the project at all — even shared
              items.
            </span>
          </span>
        </label>

        <div className="mt-3">
          <Field label="Portal welcome message" htmlFor="portalWelcomeMessage">
            <textarea
              id="portalWelcomeMessage"
              name="portalWelcomeMessage"
              rows={3}
              defaultValue={project.portalWelcomeMessage ?? ""}
              placeholder="Shown at the top of their portal."
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
      </div>
    </form>
  );
}

export function AddMemberForm({
  projectId,
  candidates,
}: {
  projectId: string;
  candidates: (Option & { role: string; email: string })[];
}) {
  const [state, action] = useActionState(addProjectMember, {});

  return (
    <form action={action} className="flex flex-wrap items-end gap-2 border-t border-border p-4">
      <input type="hidden" name="projectId" value={projectId} />
      <Field label="Add someone" htmlFor="memberUser" className="min-w-[220px] flex-1">
        <select id="memberUser" name="userId" required className={inputClass}>
          <option value="">Select a person…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name ?? c.email}
              {c.role === "CUSTOMER" ? " (customer contact)" : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Role" htmlFor="memberRole" className="w-[160px]">
        <select id="memberRole" name="role" defaultValue="CONTRIBUTOR" className={inputClass}>
          <option value="CONTRIBUTOR">Contributor</option>
          <option value="OBSERVER">Observer</option>
          <option value="LEAD">Lead</option>
        </select>
      </Field>
      <SubmitButton size="sm">Add</SubmitButton>
      <FormError error={state.error} />
    </form>
  );
}

export function RemoveMemberButton({
  projectId,
  userId,
}: {
  projectId: string;
  userId: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (await removeProjectMember(projectId, userId)))}
      className="text-[12px] text-ink-3 underline-offset-2 hover:text-red hover:underline disabled:opacity-50"
    >
      Remove
    </button>
  );
}

// ---------------------------------------------------------------------------
// Customer portal tabs (phase visibility)
// ---------------------------------------------------------------------------

type PhaseRow = { id: string; name: string; visibility: "INTERNAL" | "SHARED" };

export function PhaseVisibilityList({ phases }: { phases: PhaseRow[] }) {
  if (phases.length === 0) {
    return <p className="px-4 py-4 text-[12.5px] text-ink-3">No phases yet.</p>;
  }
  return (
    <div className="divide-y divide-border">
      {phases.map((p) => (
        <PhaseVisibilityRow key={p.id} phase={p} />
      ))}
    </div>
  );
}

function PhaseVisibilityRow({ phase }: { phase: PhaseRow }) {
  const [visible, setVisible] = useState(phase.visibility === "SHARED");
  const [pending, start] = useTransition();

  return (
    <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
      <input
        type="checkbox"
        checked={visible}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setVisible(next);
          start(() => setPhaseVisibility(phase.id, next));
        }}
      />
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{phase.name}</span>
      <VisibilityBadge visibility={visible ? "SHARED" : "INTERNAL"} />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Recordings
// ---------------------------------------------------------------------------

type RecordingRowData = {
  id: string;
  name: string;
  description: string | null;
  visibility: "INTERNAL" | "SHARED";
};

export function RecordingsManager({
  projectId,
  recordings,
}: {
  projectId: string;
  recordings: RecordingRowData[];
}) {
  const [state, action] = useActionState(addProjectRecording, {});
  const [items, setItems] = useState(recordings);

  // addProjectRecording revalidates the page, so the server sends this
  // component a fresh `recordings` prop after a successful add — but the
  // local `items` state (needed for optimistic removal) only reads its
  // initial value once. Resync it whenever the server gives us new data.
  useEffect(() => {
    setItems(recordings);
  }, [recordings]);

  return (
    <>
      <div className="divide-y divide-border">
        {items.length === 0 ? (
          <p className="px-4 py-4 text-[12.5px] text-ink-3">
            No recordings yet. Add a link to a training session below.
          </p>
        ) : (
          items.map((r) => (
            <RecordingRow
              key={r.id}
              recording={r}
              onRemoved={() => setItems((prev) => prev.filter((i) => i.id !== r.id))}
            />
          ))
        )}
      </div>

      <form action={action} className="space-y-3 border-t border-border p-4">
        <input type="hidden" name="projectId" value={projectId} />
        <FormError error={state.error} />
        {state.ok ? (
          <p className="rounded-lg bg-green-soft px-3 py-2 text-[12.5px] text-green">Added.</p>
        ) : null}
        <Field label="Name" htmlFor="recName">
          <input
            id="recName"
            name="name"
            placeholder="Core Training — Session 2"
            className={inputClass}
          />
        </Field>
        <Field label="Link" htmlFor="recUrl">
          <input id="recUrl" name="url" placeholder="https://…" className={inputClass} />
        </Field>
        <Field label="Note (optional)" htmlFor="recDescription">
          <input id="recDescription" name="description" className={inputClass} />
        </Field>
        <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
          <input type="checkbox" name="visibility" value="SHARED" />
          Visible to customer right away
        </label>
        <div className="flex justify-end">
          <SubmitButton size="sm" pendingLabel="Adding…">
            Add recording
          </SubmitButton>
        </div>
      </form>
    </>
  );
}

function RecordingRow({
  recording,
  onRemoved,
}: {
  recording: RecordingRowData;
  onRemoved: () => void;
}) {
  const [visible, setVisible] = useState(recording.visibility === "SHARED");
  const [pending, start] = useTransition();

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-ink">{recording.name}</div>
        {recording.description ? (
          <div className="truncate text-[12px] text-ink-3">{recording.description}</div>
        ) : null}
      </div>
      <label className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-ink-3">
        <input
          type="checkbox"
          checked={visible}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setVisible(next);
            start(() => setAttachmentVisibility(recording.id, next ? "SHARED" : "INTERNAL"));
          }}
        />
        Visible
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await deleteAttachment(recording.id);
            onRemoved();
          })
        }
        className="shrink-0 text-[12px] text-ink-3 underline-offset-2 hover:text-red hover:underline disabled:opacity-50"
      >
        Remove
      </button>
    </div>
  );
}

export function ArchiveProjectButton({ projectId }: { projectId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();

  if (!confirm) {
    return (
      <Button variant="danger" size="sm" onClick={() => setConfirm(true)}>
        Archive project
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12.5px] text-ink-2">
        Archive this project and cut off portal access?
      </span>
      <Button
        variant="danger"
        size="sm"
        disabled={pending}
        onClick={() => start(async () => void (await archiveProject(projectId)))}
      >
        Yes, archive
      </Button>
      <Button size="sm" onClick={() => setConfirm(false)}>
        Cancel
      </Button>
    </div>
  );
}
