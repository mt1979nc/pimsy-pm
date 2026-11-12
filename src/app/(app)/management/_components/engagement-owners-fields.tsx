"use client";

import { useState } from "react";

import { Field, inputClass } from "@/components/ui";

type Option = { id: string; name: string | null; email: string; isDirector?: boolean };

function personLabel(person: Option, markDirector: boolean) {
  const name = person.name?.trim() || person.email;
  return markDirector && person.isDirector ? `${name} (Director)` : name;
}

function OwnerSlot({
  label,
  emptyLabel,
  name,
  percentName,
  value,
  percent,
  options,
  markDirector,
  onChange,
  onPercent,
}: {
  label: string;
  emptyLabel: string;
  name: string;
  percentName: string;
  value: string;
  percent: number;
  options: Option[];
  markDirector?: boolean;
  onChange: (id: string) => void;
  onPercent: (percent: number) => void;
}) {
  return (
    <div className="space-y-3">
      <Field label={label} htmlFor={name}>
        <select id={name} name={name} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
          <option value="">{emptyLabel}</option>
          {options.map((person) => (
            <option key={person.id} value={person.id}>
              {personLabel(person, Boolean(markDirector))}
            </option>
          ))}
        </select>
      </Field>
      {value ? (
        <Field label="%" htmlFor={percentName}>
          <input
            id={percentName}
            name={percentName}
            type="number"
            min={0}
            max={100}
            value={percent}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10);
              onPercent(Number.isFinite(next) ? next : 0);
            }}
            className={inputClass}
          />
        </Field>
      ) : null}
    </div>
  );
}

function OwnerSlots({
  leadId,
  coLeadId,
  thirdSpecialistId,
  leadSplitPercent,
  coLeadSplitPercent,
  thirdSplitPercent,
  options,
}: {
  leadId: string;
  coLeadId: string;
  thirdSpecialistId: string;
  leadSplitPercent: number;
  coLeadSplitPercent: number;
  thirdSplitPercent: number;
  options: Option[];
}) {
  const [lead, setLead] = useState(leadId);
  const [coLead, setCoLead] = useState(coLeadId);
  const [third, setThird] = useState(thirdSpecialistId);
  const [leadPct, setLeadPct] = useState(leadSplitPercent);
  const [coPct, setCoPct] = useState(coLeadSplitPercent);
  const [thirdPct, setThirdPct] = useState(thirdSplitPercent);

  function choices(current: string, others: string[]) {
    const taken = new Set(others.filter(Boolean));
    return options.filter((person) => person.id === current || !taken.has(person.id));
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <OwnerSlot
        label="Primary owner"
        emptyLabel="— Unassigned —"
        name="leadId"
        percentName="leadSplitPercent"
        value={lead}
        percent={leadPct}
        options={choices(lead, [coLead, third])}
        markDirector
        onChange={setLead}
        onPercent={setLeadPct}
      />
      <OwnerSlot
        label="Co-lead"
        emptyLabel="— None —"
        name="coLeadId"
        percentName="coLeadSplitPercent"
        value={coLead}
        percent={coPct}
        options={choices(coLead, [lead, third])}
        onChange={setCoLead}
        onPercent={setCoPct}
      />
      <OwnerSlot
        label="3rd specialist"
        emptyLabel="— None —"
        name="thirdSpecialistId"
        percentName="thirdSplitPercent"
        value={third}
        percent={thirdPct}
        options={choices(third, [lead, coLead])}
        onChange={setThird}
        onPercent={setThirdPct}
      />
    </div>
  );
}

/** Remounts after a successful save so the selects keep the stored people. */
export function EngagementOwnersFields(props: {
  remountKey: string;
  leadId: string;
  coLeadId: string;
  thirdSpecialistId: string;
  leadSplitPercent: number;
  coLeadSplitPercent: number;
  thirdSplitPercent: number;
  options: Option[];
}) {
  const { remountKey, ...slotProps } = props;
  return <OwnerSlots key={remountKey} {...slotProps} />;
}
