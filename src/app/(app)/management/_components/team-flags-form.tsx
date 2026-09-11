"use client";

import { useActionState } from "react";
import { updateTeamMemberFlags } from "@/actions/management-team";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Badge, Field, inputClass, Avatar } from "@/components/ui";

export type TeamMemberRow = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  title: string | null;
  capacityHoursPerWeek: number;
  capacityExempt: boolean;
  canLead: boolean;
  isDirector: boolean;
  prismTeamId: string | null;
  image: string | null;
};

export function TeamFlagsForm({ member }: { member: TeamMemberRow }) {
  const [state, action] = useActionState(updateTeamMemberFlags, {});

  return (
    <form
      action={action}
      className="flex flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <input type="hidden" name="userId" value={member.id} />
      <div className="flex min-w-[180px] flex-1 items-center gap-3">
        <Avatar name={member.name} image={member.image} size={32} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[13.5px] font-medium text-ink">
              {member.name ?? member.email}
            </span>
            {member.isDirector ? <Badge tone="violet">Director</Badge> : null}
            {member.capacityExempt ? <Badge tone="amber">Exempt</Badge> : null}
            {!member.canLead ? <Badge>No lead</Badge> : null}
          </div>
          <div className="truncate text-[12px] text-ink-3">
            {member.email}
            {member.title ? ` · ${member.title}` : ""}
            {member.prismTeamId ? ` · ${member.prismTeamId}` : ""}
          </div>
        </div>
      </div>

      <Field label="Hrs/wk" htmlFor={`hrs-${member.id}`} className="w-[88px]">
        <input
          id={`hrs-${member.id}`}
          name="capacityHoursPerWeek"
          type="number"
          min={0}
          max={80}
          defaultValue={member.capacityHoursPerWeek}
          className={inputClass}
        />
      </Field>

      <Field label="Prism id" htmlFor={`ptid-${member.id}`} className="w-[88px]">
        <input
          id={`ptid-${member.id}`}
          name="prismTeamId"
          defaultValue={member.prismTeamId ?? ""}
          placeholder="am"
          className={inputClass}
        />
      </Field>

      <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
        <input
          type="checkbox"
          name="capacityExempt"
          defaultChecked={member.capacityExempt}
          className="size-4 rounded border-border-strong"
        />
        Exempt
      </label>
      <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
        <input
          type="checkbox"
          name="canLead"
          defaultChecked={member.canLead}
          className="size-4 rounded border-border-strong"
        />
        Can lead
      </label>
      <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
        <input
          type="checkbox"
          name="isDirector"
          defaultChecked={member.isDirector}
          className="size-4 rounded border-border-strong"
        />
        Director
      </label>

      <div className="flex flex-col items-stretch gap-1 sm:items-end">
        <FormError error={state.error} />
        {state.ok ? (
          <span className="text-[12px] text-green">Saved</span>
        ) : null}
        <SubmitButton size="sm" pendingLabel="Saving…">
          Save
        </SubmitButton>
      </div>
    </form>
  );
}
