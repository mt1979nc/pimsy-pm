"use client";

import { useActionState, useEffect, useState } from "react";
import { addRcmTrack, type AddRcmActionState } from "@/actions/projects";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Badge, Button, Card, CardHeader, Field, inputClass } from "@/components/ui";
import { STAFFING_ROLE_LABELS } from "@/lib/staffing";
import {
  ADD_RCM_HASH,
  ADD_RCM_ROLES,
  addRcmHashShouldExpand,
  addRcmPanelView,
} from "@/lib/add-rcm";
import { fmtShort } from "@/lib/dates";

type Option = { id: string; name: string | null };

export type AddRcmSummary = {
  startedAt?: string | Date | null;
  targetGoLiveDate?: string | Date | null;
  taskCountDone?: number;
  taskCountTotal?: number;
};

export function AddRcmOnSummary({
  startedAt,
  targetGoLiveDate,
  taskCountDone,
  taskCountTotal,
}: AddRcmSummary) {
  const bits: string[] = [];
  if (startedAt) bits.push(`start ${fmtShort(startedAt)}`);
  if (targetGoLiveDate) bits.push(`target ${fmtShort(targetGoLiveDate)}`);
  if ((taskCountTotal ?? 0) > 0) bits.push(`${taskCountDone ?? 0}/${taskCountTotal}`);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="violet">RCM</Badge>
      <span className="text-[12.5px] text-ink-3">{bits.length ? bits.join(" · ") : "On"}</span>
    </div>
  );
}

function setAddRcmHash(open: boolean) {
  if (typeof window === "undefined") return;
  if (open && window.location.hash !== ADD_RCM_HASH) {
    window.history.replaceState(null, "", ADD_RCM_HASH);
  }
  if (!open && window.location.hash === ADD_RCM_HASH) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

function useAddRcmExpanded(alreadyOn: boolean): [boolean, (next: boolean) => void] {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const sync = () => {
      if (addRcmHashShouldExpand(window.location.hash, alreadyOn)) setExpanded(true);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [alreadyOn]);

  function setOpen(next: boolean) {
    setExpanded(next);
    setAddRcmHash(next);
  }

  return [expanded, setOpen];
}

export function AddRcmTrackForm({
  projectId,
  staff,
  defaultAssignments = {},
  onCancel,
}: {
  projectId: string;
  staff: Option[];
  defaultAssignments?: Record<string, string>;
  onCancel?: () => void;
}) {
  const [state, action] = useActionState(addRcmTrack, {} as AddRcmActionState);
  const [confirm, setConfirm] = useState(false);

  if (state.alreadyOn) {
    return (
      <div className="px-4 py-3">
        <AddRcmOnSummary />
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3 p-4">
      <input type="hidden" name="projectId" value={projectId} />
      <FormError error={state.error} />
      {state.ok ? (
        <p className="rounded-lg bg-green-soft px-3 py-2 text-[12.5px] text-green">RCM added.</p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="RCM start" htmlFor="rcmStartDate">
          <input
            id="rcmStartDate"
            name="rcmStartDate"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={inputClass}
          />
        </Field>
        <Field label="RCM target" htmlFor="rcmTargetGoLiveDate">
          <input id="rcmTargetGoLiveDate" name="rcmTargetGoLiveDate" type="date" className={inputClass} />
        </Field>
      </div>
      {ADD_RCM_ROLES.map((role) => (
        <Field key={role} label={STAFFING_ROLE_LABELS[role]} htmlFor={`rcm-${role}`}>
          <select
            id={`rcm-${role}`}
            name={`roleAssignment:${role}`}
            className={inputClass}
            defaultValue={defaultAssignments[role] ?? ""}
          >
            <option value="">— Not assigned —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      ))}
      <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
        Add RCM tasks to this project
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {onCancel ? (
          <Button size="sm" type="button" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        {confirm ? (
          <SubmitButton size="sm" pendingLabel="Adding…">
            Add RCM
          </SubmitButton>
        ) : (
          <p className="text-[12px] text-ink-3">Check the box to add.</p>
        )}
      </div>
    </form>
  );
}

export function AddRcmPanel({
  projectId,
  staff,
  defaultAssignments = {},
  alreadyOn = false,
  summary,
}: {
  projectId: string;
  staff: Option[];
  defaultAssignments?: Record<string, string>;
  alreadyOn?: boolean;
  summary?: AddRcmSummary;
}) {
  const [expanded, setExpanded] = useAddRcmExpanded(alreadyOn);
  const view = addRcmPanelView({ eligible: !alreadyOn, alreadyOn, expanded });

  if (view === "summary") {
    return (
      <div
        id="add-rcm"
        className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5"
      >
        <AddRcmOnSummary {...summary} />
      </div>
    );
  }

  if (view === "trigger") {
    return (
      <div id="add-rcm">
        <Button
          size="sm"
          variant="secondary"
          type="button"
          aria-expanded={false}
          aria-controls="add-rcm-form"
          onClick={() => setExpanded(true)}
        >
          Add RCM
        </Button>
      </div>
    );
  }

  if (view !== "form") return null;

  return (
    <Card id="add-rcm">
      <CardHeader title="Add RCM" />
      <div id="add-rcm-form">
        <AddRcmTrackForm
          projectId={projectId}
          staff={staff}
          defaultAssignments={defaultAssignments}
          onCancel={() => setExpanded(false)}
        />
      </div>
    </Card>
  );
}
