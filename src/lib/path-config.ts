/**
 * Load PATH settings from Postgres, cache them, and fall back to the
 * hardcoded defaults when a table is missing or a section has no rows.
 * Server-only.
 */

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  pathConfigAnalyticsExclusion,
  pathConfigCustomField,
  pathConfigDockAllow,
  pathConfigEstimatorVersion,
  pathConfigHiring,
  pathConfigHoliday,
  pathConfigHolidayDate,
  pathConfigLoad,
  pathConfigPerson,
  pathConfigPhase,
  pathConfigRole,
  pathConfigServiceLine,
  pathConfigSlipApproval,
  pathConfigSlipCause,
  pathConfigStatus,
  pathConfigTag,
  pathConfigTemplate,
  users,
} from "@/db/schema";
import {
  DEFAULT_ESTIMATOR,
  DEFAULT_PATH_CONFIG,
  type ConfigRole,
  type EstimatorWeights,
  type LoadModel,
  type PathConfig,
} from "@/lib/path-config-defaults";
import { applyPathConfig, peekPathConfig, resetPathConfigCache } from "@/lib/path-config-store";

export { resetPathConfigCache };

function asWeights(raw: unknown): EstimatorWeights {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_ESTIMATOR };
  const row = raw as Partial<EstimatorWeights>;
  return {
    ...DEFAULT_ESTIMATOR,
    ...row,
    discoveryDays: { ...DEFAULT_ESTIMATOR.discoveryDays, ...(row.discoveryDays ?? {}) },
    complexClinical: Array.isArray(row.complexClinical) ? row.complexClinical : DEFAULT_ESTIMATOR.complexClinical,
    serviceLineHours: { ...DEFAULT_ESTIMATOR.serviceLineHours, ...(row.serviceLineHours ?? {}) },
    serviceLineLabels: { ...DEFAULT_ESTIMATOR.serviceLineLabels, ...(row.serviceLineLabels ?? {}) },
  };
}

export async function loadPathConfig(): Promise<PathConfig> {
  const cached = peekPathConfig();
  if (cached) return cached;
  try {
    const loaded = await readPathConfig();
    applyPathConfig(loaded);
    return loaded;
  } catch {
    return DEFAULT_PATH_CONFIG;
  }
}

async function readPathConfig(): Promise<PathConfig> {
  const [
    loadRows,
    phases,
    statuses,
    slipCauses,
    slipApproval,
    roles,
    people,
    versions,
    serviceLines,
    exclusions,
    hiringRows,
    holidayRows,
    holidayDates,
    tags,
    customFields,
    templates,
    dock,
  ] = await Promise.all([
    db.select().from(pathConfigLoad),
    db.select().from(pathConfigPhase).orderBy(asc(pathConfigPhase.sortOrder)),
    db.select().from(pathConfigStatus).orderBy(asc(pathConfigStatus.sortOrder)),
    db.select().from(pathConfigSlipCause).orderBy(asc(pathConfigSlipCause.sortOrder)),
    db.select().from(pathConfigSlipApproval).where(eq(pathConfigSlipApproval.id, "singleton")),
    db.select().from(pathConfigRole).orderBy(asc(pathConfigRole.kind), asc(pathConfigRole.sortOrder)),
    db.select().from(pathConfigPerson),
    db.select().from(pathConfigEstimatorVersion).where(eq(pathConfigEstimatorVersion.active, true)),
    db.select().from(pathConfigServiceLine).orderBy(asc(pathConfigServiceLine.sortOrder)),
    db.select().from(pathConfigAnalyticsExclusion),
    db.select().from(pathConfigHiring).where(eq(pathConfigHiring.id, "singleton")),
    db.select().from(pathConfigHoliday).where(eq(pathConfigHoliday.id, "singleton")),
    db.select().from(pathConfigHolidayDate),
    db.select().from(pathConfigTag).orderBy(asc(pathConfigTag.name)),
    db.select().from(pathConfigCustomField),
    db.select().from(pathConfigTemplate).orderBy(asc(pathConfigTemplate.sortOrder)),
    db.select().from(pathConfigDockAllow).orderBy(asc(pathConfigDockAllow.acronym)),
  ]);

  const configured = loadRows.length > 0;
  const model = loadRows[0]?.model === "phase" ? "phase" : configured ? "even" : DEFAULT_PATH_CONFIG.loadModel;
  const active = versions[0];
  let estimator = asWeights(active?.weights);
  if (serviceLines.length > 0) {
    estimator = {
      ...estimator,
      serviceLineHours: Object.fromEntries(serviceLines.map((line) => [line.key, line.hours])),
      serviceLineLabels: Object.fromEntries(serviceLines.map((line) => [line.key, line.label])),
      complexClinical: serviceLines.filter((line) => line.complexClinical).map((line) => line.key),
    };
  }

  const hiring = hiringRows[0];
  const holiday = holidayRows[0];
  const approval = slipApproval[0];

  return {
    loadModel: model as LoadModel,
    phases: phases.length
      ? phases.map((row) => ({
          key: row.key,
          label: row.label,
          sortOrder: row.sortOrder,
          hoursWeight: row.hoursWeight,
        }))
      : DEFAULT_PATH_CONFIG.phases,
    statuses: statuses.length
      ? statuses.map((row) => ({
          key: row.key,
          label: row.label,
          sortOrder: row.sortOrder,
          countsTowardLoad: row.countsTowardLoad,
          holdHrsPerWeek: row.holdHrsPerWeek,
        }))
      : DEFAULT_PATH_CONFIG.statuses,
    slipCauses: slipCauses.length
      ? slipCauses.map((row) => ({ key: row.key, label: row.label, sortOrder: row.sortOrder }))
      : DEFAULT_PATH_CONFIG.slipCauses,
    slipApproval: approval
      ? { approverRole: approval.approverRole, thresholdDays: approval.thresholdDays }
      : DEFAULT_PATH_CONFIG.slipApproval,
    roles: roles.length
      ? roles.map(
          (row): ConfigRole => ({
            key: row.key,
            label: row.label,
            kind: row.kind === "staffing" || row.kind === "project" ? row.kind : "app",
            sortOrder: row.sortOrder,
            permissions: Array.isArray(row.permissions) ? row.permissions : [],
          }),
        )
      : DEFAULT_PATH_CONFIG.roles,
    people: people.map((row) => ({
      userId: row.userId,
      canLead: row.canLead,
      capacityExempt: row.capacityExempt,
      isDirector: row.isDirector,
      capacityHidden: row.capacityHidden,
      hoursPerWeek: row.hoursPerWeek,
    })),
    estimator,
    estimatorVersion: active?.version ?? DEFAULT_PATH_CONFIG.estimatorVersion,
    serviceLines: serviceLines.length
      ? serviceLines.map((row) => ({
          key: row.key,
          label: row.label,
          hours: row.hours,
          sortOrder: row.sortOrder,
          complexClinical: row.complexClinical,
        }))
      : DEFAULT_PATH_CONFIG.serviceLines,
    analyticsExclusions: exclusions.length
      ? exclusions.map((row) => row.code)
      : configured
        ? []
        : DEFAULT_PATH_CONFIG.analyticsExclusions,
    hiring: hiring
      ? {
          leadWeeks: hiring.leadWeeks,
          utilizationPercent: hiring.utilizationPercent,
          nearPercent: hiring.nearPercent,
          typicalHoursPerWeek: hiring.typicalHoursPerWeek,
        }
      : DEFAULT_PATH_CONFIG.hiring,
    skipUsFederalHolidays: holiday ? holiday.skipUsFederal : DEFAULT_PATH_CONFIG.skipUsFederalHolidays,
    holidayDates: holidayDates.map((row) => ({ date: row.observedOn, name: row.name })),
    tags: tags.map((row) => row.name),
    customFields: customFields.map((row) => ({
      id: row.id,
      entity: row.entity,
      key: row.key,
      label: row.label,
      fieldType: row.fieldType,
    })),
    templates: templates.length
      ? templates.map((row) => ({
          key: row.key,
          name: row.name,
          active: row.active,
          sortOrder: row.sortOrder,
        }))
      : DEFAULT_PATH_CONFIG.templates,
    dockAllowlist: dock.length
      ? dock.map((row) => ({ acronym: row.acronym, included: row.included, note: row.note }))
      : DEFAULT_PATH_CONFIG.dockAllowlist,
  };
}

/** People rows for the settings form: config overlay, else the user columns. */
export async function listPeopleForSettings() {
  const config = await loadPathConfig();
  const rows = await db.query.users.findMany({
    where: eq(users.isActive, true),
    columns: {
      id: true,
      name: true,
      email: true,
      role: true,
      canLead: true,
      capacityExempt: true,
      capacityHidden: true,
      capacityHoursPerWeek: true,
      isDirector: true,
    },
    orderBy: [asc(users.name)],
  });
  return rows
    .filter((row) => row.role !== "CUSTOMER")
    .map((row) => {
      const saved = config.people.find((person) => person.userId === row.id);
      return {
        id: row.id,
        name: row.name ?? row.email,
        canLead: saved?.canLead ?? row.canLead,
        capacityExempt: saved?.capacityExempt ?? row.capacityExempt,
        isDirector: saved?.isDirector ?? row.isDirector,
        capacityHidden: saved?.capacityHidden ?? row.capacityHidden,
        hoursPerWeek: saved?.hoursPerWeek ?? row.capacityHoursPerWeek,
      };
    });
}
