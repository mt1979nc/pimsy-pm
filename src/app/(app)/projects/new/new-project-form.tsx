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
import type { ComplexityTier, DiscoveryScenario, PlaybookPath } from "@/db/schema";
import { PLAYBOOK_PATHS, PLAYBOOK_PATH_META } from "@/lib/playbook";
import { STAFFING_ROLES, STAFFING_ROLE_LABELS, MANAGER_OVERVIEW_ROLES } from "@/lib/staffing";

type Option = { id: string; name: string | null; staffingRole?: string | null };
type ExistingProject = { id: string; name: string; code: string; customerAccountId: string | null };
type OptionalArea = { key: string; label: string; hint: string; taskCount: number };
type Template = {
  id: string;
  name: string;
  description: string | null;
  durationDays: number;
  type: string;
  code: string | null;
  playbookPath: PlaybookPath | null;
  phaseCount: number;
  taskCount: number;
  customerTaskCount: number;
  optionalAreas: OptionalArea[];
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
  existingProjects,
  defaultLeadId,
}: {
  customers: Option[];
  staff: Option[];
  templates: Template[];
  existingProjects: ExistingProject[];
  defaultLeadId: string;
}) {
  const [state, action] = useActionState(createProject, {});
  const [type, setType] = useState("IMPLEMENTATION");
  const defaultPath =
    (templates.find((t) => t.playbookPath === "EHR")?.playbookPath as PlaybookPath | undefined) ??
    (templates[0]?.playbookPath as PlaybookPath | null) ??
    null;
  const [playbookPath, setPlaybookPath] = useState<PlaybookPath | "">((defaultPath ?? "EHR") as PlaybookPath);
  const [templateId, setTemplateId] = useState("");
  const [includedAreas, setIncludedAreas] = useState<Record<string, boolean>>({});
  const [roleAssignments, setRoleAssignments] = useState<Record<string, string>>({});
  const [sourceProjectId, setSourceProjectId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));

  const [scoped, setScoped] = useState(true);
  const [scope, setScope] = useState<ImplementationScope>(DEFAULT_SCOPE);
  const [scenario, setScenario] = useState<DiscoveryScenario>("TYPICAL");

  const pathTemplate = playbookPath
    ? templates.find((t) => t.playbookPath === playbookPath || t.code === PLAYBOOK_PATH_META[playbookPath].code)
    : null;
  const selected = templateId
    ? templates.find((t) => t.id === templateId)
    : pathTemplate ?? templates.find((t) => t.id === templateId);
  const isInternal = type === "INTERNAL";
  const optionalAreas = selected?.optionalAreas ?? [];
  const customerProjects = existingProjects.filter((p) => !customerId || p.customerAccountId === customerId);
  const isPrismPath = playbookPath === "RCM_PRISM";

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
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
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
                  ? "Computed from the scope below — phase/task dates scale to kickoff → go-live."
                  : selected
                    ? `Kickoff + go-live scale the playbook (blank = template's ${selected.durationDays} days).`
                    : "Kickoff + go-live drive the schedule when a template is applied."
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

            <p className="text-[12px] text-ink-3">
              Kickoff and go-live set the implementation window; template phase and task dates
              auto-populate scaled to that span.
            </p>

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
            title="Playbook"
            subtitle="Four paths — pick how this site should start"
          />
          <div className="space-y-2 p-4">
            <input type="hidden" name="playbookPath" value={playbookPath} />
            <input type="hidden" name="templateId" value={playbookPath ? "" : templateId} />

            {PLAYBOOK_PATHS.map((path) => {
              const meta = PLAYBOOK_PATH_META[path];
              const tpl = templates.find((t) => t.playbookPath === path || t.code === meta.code);
              return (
                <label
                  key={path}
                  className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                    playbookPath === path
                      ? "border-brand bg-brand-soft"
                      : "border-border hover:bg-surface-2"
                  }`}
                >
                  <input
                    type="radio"
                    name="_playbookPath"
                    checked={playbookPath === path}
                    onChange={() => {
                      setPlaybookPath(path);
                      setTemplateId("");
                    }}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-ink">{meta.title}</span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">
                      {meta.subtitle}
                    </span>
                    {tpl ? (
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        <Badge>{tpl.phaseCount} phases</Badge>
                        <Badge>{tpl.taskCount} tasks</Badge>
                        {tpl.customerTaskCount > 0 ? (
                          <Badge tone="violet">{tpl.customerTaskCount} customer</Badge>
                        ) : null}
                        <Badge>
                          {scoped && chosen && path === "EHR" ? chosen.calendarDays : tpl.durationDays} days
                        </Badge>
                      </span>
                    ) : (
                      <span className="mt-1.5 block text-[11.5px] text-amber">
                        Seed templates to load this playbook.
                      </span>
                    )}
                  </span>
                </label>
              );
            })}

            <label
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                playbookPath === "" && templateId === ""
                  ? "border-brand bg-brand-soft"
                  : "border-border hover:bg-surface-2"
              }`}
            >
              <input
                type="radio"
                name="_playbookPath"
                checked={playbookPath === "" && templateId === ""}
                onChange={() => {
                  setPlaybookPath("");
                  setTemplateId("");
                }}
                className="mt-0.5"
              />
              <span>
                <span className="block text-[13px] font-medium text-ink">Blank project</span>
                <span className="block text-[12px] text-ink-3">
                  Start empty and build the plan yourself.
                </span>
              </span>
            </label>

            {templates.filter((t) => !t.playbookPath).map((t) => (
              <label
                key={t.id}
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                  playbookPath === "" && templateId === t.id
                    ? "border-brand bg-brand-soft"
                    : "border-border hover:bg-surface-2"
                }`}
              >
                <input
                  type="radio"
                  name="_playbookPath"
                  checked={playbookPath === "" && templateId === t.id}
                  onChange={() => {
                    setPlaybookPath("");
                    setTemplateId(t.id);
                  }}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-ink">{t.name}</span>
                  <span className="mt-1.5 flex flex-wrap gap-1">
                    <Badge>{t.phaseCount} phases</Badge>
                    <Badge>{t.taskCount} tasks</Badge>
                  </span>
                </span>
              </label>
            ))}
          </div>
        </Card>

        {isPrismPath ? (
          <Card>
            <CardHeader
              title="Existing EHR site"
              subtitle="Reactivates that project and adds RCM with separate metrics. EHR dates stay put."
            />
            <div className="p-4">
              <Field label="Attach to project" htmlFor="sourceProjectId">
                <select
                  id="sourceProjectId"
                  name="sourceProjectId"
                  className={inputClass}
                  value={sourceProjectId}
                  onChange={(e) => setSourceProjectId(e.target.value)}
                >
                  <option value="">Create a new RCM-only project…</option>
                  {customerProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="mt-2 text-[12px] text-ink-3">
                Overlapping standard-implementation tasks auto-complete. Pick a site to keep the
                EHR timeline and add an RCM track.
              </p>
            </div>
          </Card>
        ) : null}

        {optionalAreas.length > 0 ? (
          <Card>
            <CardHeader
              title="Optional areas"
              subtitle="Uncheck anything that is not applicable. This only affects the new site, not the template."
            />
            <div className="space-y-2 p-4">
              {optionalAreas.map((area) => {
                const checked = includedAreas[area.key] !== false;
                return (
                  <label key={area.key} className="flex cursor-pointer items-start gap-2.5">
                    <input type="hidden" name="optionalArea" value={area.key} />
                    <input
                      type="checkbox"
                      name="includeArea"
                      value={area.key}
                      checked={checked}
                      onChange={(e) =>
                        setIncludedAreas((prev) => ({ ...prev, [area.key]: e.target.checked }))
                      }
                      className="mt-0.5 size-4 accent-[var(--color-brand)]"
                    />
                    <span>
                      <span className="block text-[13px] font-medium text-ink">{area.label}</span>
                      <span className="block text-[12px] text-ink-3">
                        {area.hint}
                        {area.taskCount ? ` · ${area.taskCount} items` : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title="Staffing"
            subtitle="Tasks auto-assign from these roles. Managers still get a site overview without owning every task."
          />
          <div className="space-y-3 p-4">
            {STAFFING_ROLES.map((role) => {
              const suggested =
                staff.find((s) => s.staffingRole === role)?.id ??
                (role === "IMPLEMENTATION_SPECIALIST" ? defaultLeadId : "");
              return (
                <Field key={role} label={STAFFING_ROLE_LABELS[role]} htmlFor={`role-${role}`}>
                  <select
                    id={`role-${role}`}
                    name={`roleAssignment:${role}`}
                    className={inputClass}
                    value={roleAssignments[role] ?? suggested}
                    onChange={(e) =>
                      setRoleAssignments((prev) => ({ ...prev, [role]: e.target.value }))
                    }
                  >
                    <option value="">— Not assigned —</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.staffingRole === role ? " · usual role" : ""}
                      </option>
                    ))}
                  </select>
                  {MANAGER_OVERVIEW_ROLES.includes(role) ? (
                    <p className="mt-1 text-[11.5px] text-ink-3">
                      Overview card on the dashboard even if they are not on every task.
                    </p>
                  ) : null}
                </Field>
              );
            })}
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
