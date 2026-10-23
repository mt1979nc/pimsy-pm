"use client";

import { useActionState } from "react";
import { savePathSettings } from "@/actions/path-settings";
import { FormError, SubmitButton } from "@/components/submit-button";
import { Card, CardHeader, inputClass } from "@/components/ui";
import type { EstimatorWeights, PathConfig } from "@/lib/path-config-defaults";

type PersonRow = {
  id: string;
  name: string;
  canLead: boolean;
  capacityExempt: boolean;
  capacityHidden: boolean;
  hoursPerWeek: number;
};

type WeightKey = {
  [K in keyof EstimatorWeights]: EstimatorWeights[K] extends number ? K : never;
}[keyof EstimatorWeights];

const WEIGHTS: { name: string; label: string; key: WeightKey }[] = [
  { name: "weight.orgSetupHours", label: "Org setup hours", key: "orgSetupHours" },
  { name: "weight.billingConfigHours", label: "Billing hours", key: "billingConfigHours" },
  { name: "weight.otherSettingsHours", label: "Other settings hours", key: "otherSettingsHours" },
  { name: "weight.minutesPerUser", label: "Minutes / user", key: "minutesPerUser" },
  { name: "weight.minutesPerLocation", label: "Minutes / location", key: "minutesPerLocation" },
  { name: "weight.minutesPerFormPage", label: "Minutes / form page", key: "minutesPerFormPage" },
  { name: "weight.coreTrainingSessions", label: "Core training sessions", key: "coreTrainingSessions" },
  { name: "weight.stateComplianceHours", label: "State compliance hours", key: "stateComplianceHours" },
  { name: "weight.minimalOrgHours", label: "Minimal org hours", key: "minimalOrgHours" },
  { name: "weight.intakeAssistantHours", label: "Intake assistant hours", key: "intakeAssistantHours" },
  { name: "weight.configDays", label: "Config days", key: "configDays" },
  { name: "weight.maxConfigHoursPerDay", label: "Max config hours / day", key: "maxConfigHoursPerDay" },
  { name: "weight.schedulingBufferDays", label: "Scheduling buffer days", key: "schedulingBufferDays" },
  { name: "weight.trainingSessionHours", label: "Training session hours", key: "trainingSessionHours" },
  { name: "weight.trainingPrepHours", label: "Training prep hours", key: "trainingPrepHours" },
  { name: "weight.trainingHoursPerSession", label: "Training hours / session", key: "trainingHoursPerSession" },
  { name: "weight.payrollTrainingHours", label: "Payroll training hours", key: "payrollTrainingHours" },
];

function Num({ name, value, step = "0.1" }: { name: string; value: number; step?: string }) {
  return (
    <input
      name={name}
      type="number"
      step={step}
      defaultValue={value}
      className={`${inputClass} w-24 tabular-nums`}
    />
  );
}

function Text({ name, value }: { name: string; value: string }) {
  return <input name={name} defaultValue={value} className={inputClass} />;
}

function Check({ name, on }: { name: string; on: boolean }) {
  return <input name={name} type="checkbox" defaultChecked={on} className="size-3.5 accent-brand" />;
}

export function WorkspaceSettingsForm({
  config,
  people,
  canEdit,
}: {
  config: PathConfig;
  people: PersonRow[];
  canEdit: boolean;
}) {
  const [state, action] = useActionState(savePathSettings, {});
  const manifest = JSON.stringify({
    phases: config.phases.map((row) => row.key),
    statuses: config.statuses.map((row) => row.key),
    slipCauses: config.slipCauses.map((row) => row.key),
    roles: config.roles.map((row) => ({ kind: row.kind, key: row.key })),
    people: people.map((row) => row.id),
    serviceLines: config.serviceLines.map((row) => row.key),
    templates: config.templates.map((row) => row.key),
    dock: config.dockAllowlist.map((row) => row.acronym),
    customFields: config.customFields.map((row) => row.id),
  });

  return (
    <form action={action} className="space-y-5" autoComplete="off">
      <FormError error={state.error} />
      {state.ok ? (
        <p className="rounded-lg bg-green-soft px-3 py-2 text-[12.5px] text-green">Settings saved.</p>
      ) : null}
      <fieldset disabled={!canEdit} className="min-w-0 space-y-5 border-0 p-0">
        <input type="hidden" name="manifest" value={manifest} />

        <Card>
          <CardHeader title="Load model" subtitle="Even spread is the default. Phase curve uses the weights below." />
          <div className="p-4">
            <select name="loadModel" defaultValue={config.loadModel} className={`${inputClass} max-w-xs`}>
              <option value="even">Even spread</option>
              <option value="phase">Phase curve</option>
            </select>
          </div>
        </Card>

        <Card>
          <CardHeader title="Phases" subtitle="Hours weight. 1 keeps every phase even." />
          <div className="overflow-x-auto p-4">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="text-ink-3">
                  <th className="pb-2 font-medium">Phase</th>
                  <th className="pb-2 font-medium">Weight</th>
                </tr>
              </thead>
              <tbody>
                {config.phases.map((row) => (
                  <tr key={row.key} className="border-t border-border">
                    <td className="py-1.5 pr-3">
                      <Text name={`phaseLabel.${row.key}`} value={row.label} />
                    </td>
                    <td className="py-1.5">
                      <Num name={`phaseWeight.${row.key}`} value={row.hoursWeight} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Statuses" subtitle="Counts toward load, and a flat hold in hours per week." />
          <div className="overflow-x-auto p-4">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="text-ink-3">
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Load</th>
                  <th className="pb-2 font-medium">Hold hrs/wk</th>
                </tr>
              </thead>
              <tbody>
                {config.statuses.map((row) => (
                  <tr key={row.key} className="border-t border-border">
                    <td className="py-1.5 pr-3">
                      <Text name={`statusLabel.${row.key}`} value={row.label} />
                    </td>
                    <td className="py-1.5 pr-3">
                      <Check name={`statusLoad.${row.key}`} on={row.countsTowardLoad} />
                    </td>
                    <td className="py-1.5">
                      <input
                        name={`statusHold.${row.key}`}
                        type="number"
                        step="0.1"
                        min="0"
                        defaultValue={row.holdHrsPerWeek ?? ""}
                        placeholder="—"
                        className={`${inputClass} w-24 tabular-nums`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Slip causes" />
          <div className="space-y-2 p-4">
            {config.slipCauses.map((row) => (
              <label key={row.key} className="grid grid-cols-[7rem_1fr] items-center gap-3 text-[12.5px]">
                <span className="text-ink-3">{row.key}</span>
                <Text name={`slipCauseLabel.${row.key}`} value={row.label} />
              </label>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Slip approval"
            subtitle="DIRECTOR uses the director flag. Owners can always approve."
          />
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <label className="block text-[12.5px] text-ink-2">
              Approver role
              <input
                name="slipApproverRole"
                defaultValue={config.slipApproval.approverRole}
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="block text-[12.5px] text-ink-2">
              Threshold days
              <input
                name="slipThresholdDays"
                type="number"
                min="0"
                step="1"
                defaultValue={config.slipApproval.thresholdDays}
                className={`${inputClass} mt-1 w-28`}
              />
            </label>
          </div>
        </Card>

        <Card>
          <CardHeader title="Roles" subtitle="Permissions, comma separated." />
          <div className="overflow-x-auto p-4">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="text-ink-3">
                  <th className="pb-2 font-medium">Role</th>
                  <th className="pb-2 font-medium">Label</th>
                  <th className="pb-2 font-medium">Permissions</th>
                </tr>
              </thead>
              <tbody>
                {config.roles.map((row) => (
                  <tr key={`${row.kind}.${row.key}`} className="border-t border-border">
                    <td className="py-1.5 pr-3 text-ink-3">
                      {row.kind} · {row.key}
                    </td>
                    <td className="py-1.5 pr-3">
                      <Text name={`roleLabel.${row.kind}.${row.key}`} value={row.label} />
                    </td>
                    <td className="py-1.5">
                      <input
                        name={`rolePerm.${row.kind}.${row.key}`}
                        defaultValue={row.permissions.join(", ")}
                        className={inputClass}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="People" subtitle="Lead, exempt, hidden, and hours per week." />
          <div className="overflow-x-auto p-4">
            {people.length === 0 ? (
              <p className="text-[12.5px] text-ink-3">No staff yet.</p>
            ) : (
              <table className="w-full text-left text-[12.5px]">
                <thead>
                  <tr className="text-ink-3">
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Lead</th>
                    <th className="pb-2 font-medium">Exempt</th>
                    <th className="pb-2 font-medium">Hidden</th>
                    <th className="pb-2 font-medium">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="py-1.5 pr-3 text-ink">{row.name}</td>
                      <td className="py-1.5">
                        <Check name={`personLead.${row.id}`} on={row.canLead} />
                      </td>
                      <td className="py-1.5">
                        <Check name={`personExempt.${row.id}`} on={row.capacityExempt} />
                      </td>
                      <td className="py-1.5">
                        <Check name={`personHidden.${row.id}`} on={row.capacityHidden} />
                      </td>
                      <td className="py-1.5">
                        <Num name={`personHours.${row.id}`} value={row.hoursPerWeek} step="1" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Estimator weights"
            subtitle={`Version ${config.estimatorVersion}. A change saves a new version.`}
          />
          <div className="grid gap-2 p-4 sm:grid-cols-2">
            {WEIGHTS.map((row) => (
              <label key={row.name} className="flex items-center justify-between gap-3 text-[12.5px] text-ink-2">
                {row.label}
                <Num name={row.name} value={Number(config.estimator[row.key])} />
              </label>
            ))}
            <label className="flex items-center justify-between gap-3 text-[12.5px] text-ink-2">
              Discovery optimistic days
              <Num name="discovery.OPTIMISTIC" value={config.estimator.discoveryDays.OPTIMISTIC} step="1" />
            </label>
            <label className="flex items-center justify-between gap-3 text-[12.5px] text-ink-2">
              Discovery typical days
              <Num name="discovery.TYPICAL" value={config.estimator.discoveryDays.TYPICAL} step="1" />
            </label>
            <label className="flex items-center justify-between gap-3 text-[12.5px] text-ink-2">
              Discovery pessimistic days
              <Num name="discovery.PESSIMISTIC" value={config.estimator.discoveryDays.PESSIMISTIC} step="1" />
            </label>
          </div>
        </Card>

        <Card>
          <CardHeader title="Service lines" subtitle="Hours, and whether the line is complex clinical." />
          <div className="overflow-x-auto p-4">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="text-ink-3">
                  <th className="pb-2 font-medium">Line</th>
                  <th className="pb-2 font-medium">Hours</th>
                  <th className="pb-2 font-medium">Complex</th>
                </tr>
              </thead>
              <tbody>
                {config.serviceLines.map((row) => (
                  <tr key={row.key} className="border-t border-border">
                    <td className="py-1.5 pr-3">
                      <Text name={`lineLabel.${row.key}`} value={row.label} />
                    </td>
                    <td className="py-1.5 pr-3">
                      <Num name={`lineHours.${row.key}`} value={row.hours} />
                    </td>
                    <td className="py-1.5">
                      <Check name={`lineComplex.${row.key}`} on={row.complexClinical} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Analytics exclusions" subtitle="Codes skipped by primary averages. Commas or spaces." />
          <div className="p-4">
            <textarea
              name="exclusions"
              defaultValue={config.analyticsExclusions.join(", ")}
              rows={2}
              className={inputClass}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Hiring trigger" />
          <div className="grid gap-2 p-4 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-3 text-[12.5px] text-ink-2">
              Lead weeks
              <Num name="hire.leadWeeks" value={config.hiring.leadWeeks} step="1" />
            </label>
            <label className="flex items-center justify-between gap-3 text-[12.5px] text-ink-2">
              Utilization %
              <Num name="hire.utilizationPercent" value={config.hiring.utilizationPercent} step="1" />
            </label>
            <label className="flex items-center justify-between gap-3 text-[12.5px] text-ink-2">
              Near %
              <Num name="hire.nearPercent" value={config.hiring.nearPercent} step="1" />
            </label>
            <label className="flex items-center justify-between gap-3 text-[12.5px] text-ink-2">
              Typical hours / week
              <Num name="hire.typicalHoursPerWeek" value={config.hiring.typicalHoursPerWeek} step="1" />
            </label>
          </div>
        </Card>

        <Card>
          <CardHeader title="Holidays" subtitle="Extra dates, one per line: YYYY-MM-DD and a name." />
          <div className="space-y-3 p-4">
            <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
              <Check name="skipFederal" on={config.skipUsFederalHolidays} />
              Skip US federal holidays
            </label>
            <textarea
              name="holidayDates"
              defaultValue={config.holidayDates.map((row) => `${row.date} ${row.name}`).join("\n")}
              rows={3}
              className={inputClass}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Tags" subtitle="Comma separated. None are hardcoded today." />
          <div className="p-4">
            <textarea name="tags" defaultValue={config.tags.join(", ")} rows={2} className={inputClass} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Custom fields" subtitle="Definitions only. Existing columns stay." />
          <div className="space-y-3 p-4">
            {config.customFields.length === 0 ? (
              <p className="text-[12.5px] text-ink-3">No custom fields yet.</p>
            ) : (
              config.customFields.map((row) => {
                const id = row.id;
                return (
                  <div key={id} className="grid gap-2 sm:grid-cols-4">
                    <Text name={`fieldEntity.${id}`} value={row.entity} />
                    <Text name={`fieldKey.${id}`} value={row.key} />
                    <Text name={`fieldLabel.${id}`} value={row.label} />
                    <select name={`fieldType.${id}`} defaultValue={row.fieldType} className={inputClass}>
                      <option value="text">text</option>
                      <option value="number">number</option>
                      <option value="date">date</option>
                      <option value="boolean">boolean</option>
                    </select>
                  </div>
                );
              })
            )}
            {canEdit ? (
              <div className="grid gap-2 sm:grid-cols-4">
                <input name="customNewEntity" placeholder="entity" className={inputClass} />
                <input name="customNewKey" placeholder="key" className={inputClass} />
                <input name="customNewLabel" placeholder="label" className={inputClass} />
                <select name="customNewType" defaultValue="text" className={inputClass}>
                  <option value="text">text</option>
                  <option value="number">number</option>
                  <option value="date">date</option>
                  <option value="boolean">boolean</option>
                </select>
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Templates" subtitle="Which playbooks are offered." />
          <div className="overflow-x-auto p-4">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="text-ink-3">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Active</th>
                </tr>
              </thead>
              <tbody>
                {config.templates.map((row) => (
                  <tr key={row.key} className="border-t border-border">
                    <td className="py-1.5 pr-3">
                      <Text name={`templateName.${row.key}`} value={row.name} />
                    </td>
                    <td className="py-1.5">
                      <Check name={`templateActive.${row.key}`} on={row.active} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Dock allowlist" subtitle="Included acronyms. Uncheck to leave one out without deleting it." />
          <div className="overflow-x-auto p-4">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="text-ink-3">
                  <th className="pb-2 font-medium">On</th>
                  <th className="pb-2 font-medium">Acronym</th>
                  <th className="pb-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {config.dockAllowlist.map((row) => (
                  <tr key={row.acronym} className="border-t border-border">
                    <td className="py-1.5">
                      <Check name={`dockOn.${row.acronym}`} on={row.included} />
                    </td>
                    <td className="py-1.5 pr-3 font-medium text-ink">{row.acronym}</td>
                    <td className="py-1.5">
                      <Text name={`dockNote.${row.acronym}`} value={row.note} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {canEdit ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-[8rem_1fr]">
                <input name="dockNewAcronym" placeholder="ACRONYM" className={inputClass} />
                <input name="dockNewNote" placeholder="Note" className={inputClass} />
              </div>
            ) : null}
          </div>
        </Card>

        {canEdit ? (
          <div className="flex justify-end">
            <SubmitButton>Save settings</SubmitButton>
          </div>
        ) : (
          <p className="text-[12.5px] text-ink-3">You can read these. An owner or admin can change them.</p>
        )}
      </fieldset>
    </form>
  );
}
