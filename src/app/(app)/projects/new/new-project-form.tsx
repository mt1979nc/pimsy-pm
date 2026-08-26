"use client";

import { useActionState, useMemo, useState } from "react";
import { createProject } from "@/actions/projects";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Field, inputClass, Card, CardHeader, Badge } from "@/components/ui";
import { LinkButton } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import {
  DEFAULT_SCOPE,
  SERVICE_LINE_LABELS,
  forecastImplementation,
  type ImplementationScope,
} from "@/lib/estimator";
import type { ComplexityTier, DiscoveryScenario } from "@/db/schema";

type Option = { id: string; name: string | null };
type Template = {
  id: string;
  name: string;
  description: string | null;
  durationDays: number;
  type: string;
  phaseCount: number;
  taskCount: number;
  customerTaskCount: number;
};

const tierTone: Record<ComplexityTier, "green" | "amber" | "red" | "violet"> = {
  STANDARD: "green",
  MODERATE: "amber",
  HIGH: "red",
  ENTERPRISE: "violet",
};

const SERVICE_LINE_KEYS = Object.keys(SERVICE_LINE_LABELS);

export function NewProjectForm({
  customers,
  staff,
  templates,
  defaultLeadId,
}: {
  customers: Option[];
  staff: Option[];
  templates: Template[];
  defaultLeadId: string;
}) {
  const [state, action] = useActionState(createProject, {});
  const [type, setType] = useState("IMPLEMENTATION");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));

  const [scoped, setScoped] = useState(true);
  const [scope, setScope] = useState<ImplementationScope>(DEFAULT_SCOPE);
  const [scenario, setScenario] = useState<DiscoveryScenario>("TYPICAL");

  const selected = templates.find((t) => t.id === templateId);
  const isInternal = type === "INTERNAL";

  const forecast = useMemo(() => {
    const kickoff = startDate ? new Date(`${startDate}T00:00:00`) : new Date();
    return forecastImplementation(scope, kickoff);
  }, [scope, startDate]);

  const chosen = forecast.scenarios.find((s) => s.scenario === scenario) ?? forecast.scenarios[1];

  function toggleServiceLine(key: string) {
    setScope((s) => ({
      ...s,
      serviceLines: s.serviceLines.includes(key)
        ? s.serviceLines.filter((l) => l !== key)
        : [...s.serviceLines, key],
    }));
  }

  return (
    <form action={action} className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        <Card>
          <CardHeader title="Project details" />
          <div className="space-y-4 p-5">
            <FormError error={state.error} />

            <Field label="Project name" htmlFor="name">
              <input
                id="name"
                name="name"
                required
                autoFocus
                placeholder="Riverbend Counseling — PIMSY implementation"
                className={inputClass}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type" htmlFor="type">
                <select
                  id="type"
                  name="type"
                  className={inputClass}
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="IMPLEMENTATION">Implementation</option>
                  <option value="MIGRATION">Data migration</option>
                  <option value="TRAINING">Training engagement</option>
                  <option value="SUPPORT">Post-live optimization</option>
                  <option value="INTERNAL">Internal project</option>
                </select>
              </Field>

              <Field
                label="Customer"
                htmlFor="customerAccountId"
                hint={isInternal ? "Not needed for internal projects." : undefined}
              >
                <select
                  id="customerAccountId"
                  name="customerAccountId"
                  className={inputClass}
                  disabled={isInternal}
                  required={!isInternal}
                >
                  <option value="">Select a customer…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Implementation lead" htmlFor="leadId">
                <select id="leadId" name="leadId" className={inputClass} defaultValue={defaultLeadId}>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Kickoff date" htmlFor="startDate">
                <input
                  id="startDate"
                  name="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>

            <Field
              label="Target go-live"
              htmlFor="targetGoLiveDate"
              hint={
                scoped
                  ? "Computed from the scope below — see the scenario you pick on the right."
                  : selected
                    ? `Leave blank to use the template's ${selected.durationDays}-day timeline.`
                    : "Optional."
              }
            >
              <input
                id="targetGoLiveDate"
                name="targetGoLiveDate"
                type="date"
                disabled={scoped}
                className={inputClass}
              />
            </Field>

            <Field label="Description" htmlFor="description">
              <textarea
                id="description"
                name="description"
                rows={3}
                placeholder="Scope, special considerations, anything the team should know."
                className={inputClass}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Scope this implementation"
            subtitle="Estimates staff hours and a go-live date from what you know about the practice"
            action={
              <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-2">
                <input
                  type="checkbox"
                  checked={scoped}
                  onChange={(e) => setScoped(e.target.checked)}
                  className="size-4 shrink-0 accent-[var(--color-brand)]"
                />
                Use scoping
              </label>
            }
          />

          {!scoped ? (
            <p className="px-5 py-4 text-[12.5px] text-ink-3">
              Off — this project will use the template&apos;s default timeline (or a manual target
              go-live above) instead of an hours/date estimate.
            </p>
          ) : (
            <div className="space-y-4 p-5">
              <input type="hidden" name="scopeJson" value={JSON.stringify(scope)} />
              <input type="hidden" name="discoveryScenario" value={scenario} />

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Users">
                  <input
                    type="number"
                    min={1}
                    value={scope.userCount}
                    onChange={(e) => setScope((s) => ({ ...s, userCount: Number(e.target.value) || 1 }))}
                    className={inputClass}
                  />
                </Field>
                <Field label="Locations">
                  <input
                    type="number"
                    min={1}
                    value={scope.locationCount}
                    onChange={(e) =>
                      setScope((s) => ({ ...s, locationCount: Number(e.target.value) || 1 }))
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Form pages">
                  <input
                    type="number"
                    min={0}
                    value={scope.formPageCount}
                    onChange={(e) =>
                      setScope((s) => ({ ...s, formPageCount: Number(e.target.value) || 0 }))
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Trainings/week">
                  <select
                    value={scope.trainingsPerWeek}
                    onChange={(e) =>
                      setScope((s) => ({ ...s, trainingsPerWeek: Number(e.target.value) }))
                    }
                    className={inputClass}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}/week
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-2">
                  <input
                    type="checkbox"
                    checked={scope.stateCompliance}
                    onChange={(e) => setScope((s) => ({ ...s, stateCompliance: e.target.checked }))}
                    className="size-4 shrink-0 accent-[var(--color-brand)]"
                  />
                  State compliance (+2h)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-2">
                  <input
                    type="checkbox"
                    checked={scope.minimalOrgStructure}
                    onChange={(e) =>
                      setScope((s) => ({ ...s, minimalOrgStructure: e.target.checked }))
                    }
                    className="size-4 shrink-0 accent-[var(--color-brand)]"
                  />
                  Minimal org structure (+1h/wk)
                </label>
              </div>

              <div>
                <div className="mb-1.5 text-[12.5px] font-medium text-ink-2">Service lines</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
                  {SERVICE_LINE_KEYS.map((key) => (
                    <label
                      key={key}
                      className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-2"
                    >
                      <input
                        type="checkbox"
                        checked={scope.serviceLines.includes(key)}
                        onChange={() => toggleServiceLine(key)}
                        className="size-4 shrink-0 accent-[var(--color-brand)]"
                      />
                      {SERVICE_LINE_LABELS[key]}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
                <span className="text-[12.5px] text-ink-2">Estimated staff time</span>
                <span className="flex items-center gap-2">
                  <span className="text-[13.5px] font-semibold text-ink">
                    {forecast.hours.totalHours}h
                  </span>
                  <Badge tone={tierTone[forecast.complexityTier]}>
                    {forecast.complexityTier.charAt(0) + forecast.complexityTier.slice(1).toLowerCase()}
                  </Badge>
                </span>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-5">
        {scoped ? (
          <Card>
            <CardHeader title="Projected go-live" subtitle="Pick a discovery-responsiveness scenario" />
            <div className="space-y-2 p-4">
              {forecast.scenarios.map((s) => (
                <label
                  key={s.scenario}
                  className={`flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-3 transition-colors ${
                    scenario === s.scenario
                      ? "border-brand bg-brand-soft"
                      : "border-border hover:bg-surface-2"
                  }`}
                >
                  <span className="flex items-start gap-2.5">
                    <input
                      type="radio"
                      name="_scenario"
                      checked={scenario === s.scenario}
                      onChange={() => setScenario(s.scenario)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-[13px] font-medium capitalize text-ink">
                        {s.scenario.toLowerCase()}
                      </span>
                      <span className="block text-[12px] text-ink-3">{s.label}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[13px] font-semibold text-ink">
                      {fmtDate(s.goLiveDate)}
                    </span>
                    <span className="block text-[11.5px] text-ink-3">{s.calendarDays}d</span>
                  </span>
                </label>
              ))}
            </div>
            {chosen ? (
              <div className="border-t border-border px-4 py-3 text-[12px] text-ink-3">
                {chosen.phases.map((p) => p.name).join(" → ")}
              </div>
            ) : null}
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title="Start from a template"
            subtitle="Builds every phase, task and milestone automatically"
          />
          <div className="space-y-2 p-4">
            <label
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                templateId === "" ? "border-brand bg-brand-soft" : "border-border hover:bg-surface-2"
              }`}
            >
              <input
                type="radio"
                name="templateId"
                value=""
                checked={templateId === ""}
                onChange={() => setTemplateId("")}
                className="mt-0.5"
              />
              <span>
                <span className="block text-[13px] font-medium text-ink">Blank project</span>
                <span className="block text-[12px] text-ink-3">
                  Start empty and build the plan yourself.
                </span>
              </span>
            </label>

            {templates.map((t) => (
              <label
                key={t.id}
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                  templateId === t.id
                    ? "border-brand bg-brand-soft"
                    : "border-border hover:bg-surface-2"
                }`}
              >
                <input
                  type="radio"
                  name="templateId"
                  value={t.id}
                  checked={templateId === t.id}
                  onChange={() => setTemplateId(t.id)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-ink">{t.name}</span>
                  {t.description ? (
                    <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">
                      {t.description}
                    </span>
                  ) : null}
                  <span className="mt-1.5 flex flex-wrap gap-1">
                    <Badge>{t.phaseCount} phases</Badge>
                    <Badge>{t.taskCount} tasks</Badge>
                    {t.customerTaskCount > 0 ? (
                      <Badge tone="violet">{t.customerTaskCount} customer</Badge>
                    ) : null}
                    <Badge>
                      {scoped && chosen ? chosen.calendarDays : t.durationDays} days
                    </Badge>
                  </span>
                </span>
              </label>
            ))}

            {templates.length === 0 ? (
              <p className="px-1 py-3 text-[12.5px] text-ink-3">
                No templates yet. An admin can create one under Templates.
              </p>
            ) : null}
          </div>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <LinkButton href="/projects">Cancel</LinkButton>
          <SubmitButton pendingLabel="Creating…">Create project</SubmitButton>
        </div>
      </div>
    </form>
  );
}
