"use server";

import { revalidatePath } from "next/cache";
import { eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  orgSettings,
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
import type { ActionState } from "@/actions/messages";
import { isAdmin } from "@/lib/authz";
import { parseExclusionCodes } from "@/lib/forecast";
import { requireStaff } from "@/lib/guard";
import { getOrgSettings } from "@/lib/notification-prefs";
import {
  DEFAULT_ESTIMATOR,
  type EstimatorWeights,
} from "@/lib/path-config-defaults";
import { resetPathConfigCache } from "@/lib/path-config";

type Manifest = {
  phases: string[];
  statuses: string[];
  slipCauses: string[];
  roles: { kind: "app" | "staffing" | "project"; key: string }[];
  people: string[];
  serviceLines: string[];
  templates: string[];
  dock: string[];
  customFields: string[];
};

const ROLE_KINDS = new Set(["app", "staffing", "project"]);

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function checked(form: FormData, name: string): boolean {
  return form.get(name) === "on";
}

function num(form: FormData, name: string, fallback: number): number {
  const raw = text(form, name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error("Enter a number in every hours and days field.");
  return value;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function manifestFrom(form: FormData): Manifest {
  const raw = text(form, "manifest");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Settings form is out of date. Reload the page.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Settings form is out of date. Reload the page.");
  }
  const row = parsed as Partial<Manifest>;
  const roles = Array.isArray(row.roles)
    ? row.roles.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const kind = (item as { kind?: unknown }).kind;
        const key = (item as { key?: unknown }).key;
        if (typeof kind !== "string" || typeof key !== "string" || !ROLE_KINDS.has(kind) || !key) {
          return [];
        }
        return [{ kind: kind as Manifest["roles"][number]["kind"], key }];
      })
    : [];
  return {
    phases: strings(row.phases),
    statuses: strings(row.statuses),
    slipCauses: strings(row.slipCauses),
    roles,
    people: strings(row.people),
    serviceLines: strings(row.serviceLines),
    templates: strings(row.templates),
    dock: strings(row.dock),
    customFields: strings(row.customFields),
  };
}

function label(form: FormData, name: string, what: string): string {
  const value = text(form, name);
  if (!value) throw new Error(`Enter a label for ${what}.`);
  return value.slice(0, 120);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(row[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function saveError(err: unknown): string {
  const message = err instanceof Error ? err.message : "Could not save settings.";
  if (/path_config_/i.test(message) && /does not exist|relation/i.test(message)) {
    return "Run migration 0032_path_config before saving settings.";
  }
  return message.length > 240 ? "Could not save settings." : message;
}

export async function savePathSettings(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireStaff();
  if (!isAdmin(actor)) return { error: "Only an owner or admin can change workspace settings." };

  try {
    const manifest = manifestFrom(form);
    const model = text(form, "loadModel") === "phase" ? "phase" : "even";
    const approverRole = (text(form, "slipApproverRole") || "DIRECTOR").slice(0, 40);
    const thresholdDays = Math.max(0, Math.round(num(form, "slipThresholdDays", 0)));
    const skipFederal = checked(form, "skipFederal");

    const serviceLines = manifest.serviceLines.map((key, sortOrder) => ({
      key,
      label: label(form, `lineLabel.${key}`, key),
      hours: Math.max(0, num(form, `lineHours.${key}`, 0)),
      sortOrder,
      complexClinical: checked(form, `lineComplex.${key}`),
    }));

    const estimator: EstimatorWeights = {
      orgSetupHours: num(form, "weight.orgSetupHours", DEFAULT_ESTIMATOR.orgSetupHours),
      billingConfigHours: num(form, "weight.billingConfigHours", DEFAULT_ESTIMATOR.billingConfigHours),
      otherSettingsHours: num(form, "weight.otherSettingsHours", DEFAULT_ESTIMATOR.otherSettingsHours),
      minutesPerUser: num(form, "weight.minutesPerUser", DEFAULT_ESTIMATOR.minutesPerUser),
      minutesPerLocation: num(form, "weight.minutesPerLocation", DEFAULT_ESTIMATOR.minutesPerLocation),
      minutesPerFormPage: num(form, "weight.minutesPerFormPage", DEFAULT_ESTIMATOR.minutesPerFormPage),
      coreTrainingSessions: num(form, "weight.coreTrainingSessions", DEFAULT_ESTIMATOR.coreTrainingSessions),
      stateComplianceHours: num(form, "weight.stateComplianceHours", DEFAULT_ESTIMATOR.stateComplianceHours),
      minimalOrgHours: num(form, "weight.minimalOrgHours", DEFAULT_ESTIMATOR.minimalOrgHours),
      intakeAssistantHours: num(form, "weight.intakeAssistantHours", DEFAULT_ESTIMATOR.intakeAssistantHours),
      configDays: Math.max(1, Math.round(num(form, "weight.configDays", DEFAULT_ESTIMATOR.configDays))),
      maxConfigHoursPerDay: num(form, "weight.maxConfigHoursPerDay", DEFAULT_ESTIMATOR.maxConfigHoursPerDay),
      schedulingBufferDays: num(form, "weight.schedulingBufferDays", DEFAULT_ESTIMATOR.schedulingBufferDays),
      trainingSessionHours: num(form, "weight.trainingSessionHours", DEFAULT_ESTIMATOR.trainingSessionHours),
      trainingPrepHours: num(form, "weight.trainingPrepHours", DEFAULT_ESTIMATOR.trainingPrepHours),
      trainingHoursPerSession: num(form, "weight.trainingHoursPerSession", DEFAULT_ESTIMATOR.trainingHoursPerSession),
      payrollTrainingHours: num(form, "weight.payrollTrainingHours", DEFAULT_ESTIMATOR.payrollTrainingHours),
      discoveryDays: {
        OPTIMISTIC: Math.max(1, Math.round(num(form, "discovery.OPTIMISTIC", DEFAULT_ESTIMATOR.discoveryDays.OPTIMISTIC))),
        TYPICAL: Math.max(1, Math.round(num(form, "discovery.TYPICAL", DEFAULT_ESTIMATOR.discoveryDays.TYPICAL))),
        PESSIMISTIC: Math.max(1, Math.round(num(form, "discovery.PESSIMISTIC", DEFAULT_ESTIMATOR.discoveryDays.PESSIMISTIC))),
      },
      complexClinical: serviceLines.filter((line) => line.complexClinical).map((line) => line.key),
      serviceLineHours: Object.fromEntries(serviceLines.map((line) => [line.key, line.hours])),
      serviceLineLabels: Object.fromEntries(serviceLines.map((line) => [line.key, line.label])),
      skipUsFederalHolidays: skipFederal,
    };

    const exclusionCodes = parseExclusionCodes(
      text(form, "exclusions")
        .split(/[\s,]+/)
        .filter(Boolean),
    );
    const tags = [...new Set(text(form, "tags").split(/[\n,]+/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 100);
    const holidayDates = text(form, "holidayDates")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 100)
      .map((line) => {
        const match = /^(\d{4}-\d{2}-\d{2})\s*(.*)$/.exec(line);
        if (!match) throw new Error("Holiday dates use YYYY-MM-DD and a name.");
        return { date: match[1]!, name: (match[2] || "Holiday").slice(0, 80) };
      });

    const newFieldKey = text(form, "customNewKey");
    const newField =
      newFieldKey || text(form, "customNewLabel") || text(form, "customNewEntity")
        ? {
            id: `cf_${crypto.randomUUID()}`,
            entity: text(form, "customNewEntity").toLowerCase(),
            key: newFieldKey.toLowerCase(),
            label: text(form, "customNewLabel"),
            fieldType: text(form, "customNewType") || "text",
          }
        : null;
    if (newField) {
      if (!/^[a-z][a-z0-9_]{0,40}$/.test(newField.entity) || !/^[a-z][a-z0-9_]{0,40}$/.test(newField.key)) {
        throw new Error("Custom field entity and key use lowercase letters, numbers, and underscores.");
      }
      if (!newField.label) throw new Error("Enter a label for the new custom field.");
      if (!["text", "number", "date", "boolean"].includes(newField.fieldType)) newField.fieldType = "text";
    }

    const newDock = text(form, "dockNewAcronym").toUpperCase();
    if (newDock && !/^[A-Z0-9]{2,16}$/.test(newDock)) {
      throw new Error("Dock acronyms use 2–16 letters or numbers.");
    }

    await getOrgSettings();
    await db.transaction(async (tx) => {
      await tx
        .insert(pathConfigLoad)
        .values({ id: "singleton", model })
        .onConflictDoUpdate({ target: pathConfigLoad.id, set: { model } });

      for (const [sortOrder, key] of manifest.phases.entries()) {
        const hoursWeight = Math.max(0, num(form, `phaseWeight.${key}`, 1));
        const phaseLabel = label(form, `phaseLabel.${key}`, key);
        await tx
          .insert(pathConfigPhase)
          .values({ key, label: phaseLabel, sortOrder, hoursWeight })
          .onConflictDoUpdate({
            target: pathConfigPhase.key,
            set: { label: phaseLabel, sortOrder, hoursWeight },
          });
      }

      for (const [sortOrder, key] of manifest.statuses.entries()) {
        const statusLabel = label(form, `statusLabel.${key}`, key);
        const holdRaw = text(form, `statusHold.${key}`);
        const hold = holdRaw === "" ? null : num(form, `statusHold.${key}`, 0);
        await tx
          .insert(pathConfigStatus)
          .values({
            key,
            label: statusLabel,
            sortOrder,
            countsTowardLoad: checked(form, `statusLoad.${key}`),
            holdHrsPerWeek: hold != null && hold > 0 ? hold : null,
          })
          .onConflictDoUpdate({
            target: pathConfigStatus.key,
            set: {
              label: statusLabel,
              sortOrder,
              countsTowardLoad: checked(form, `statusLoad.${key}`),
              holdHrsPerWeek: hold != null && hold > 0 ? hold : null,
            },
          });
      }

      for (const [sortOrder, key] of manifest.slipCauses.entries()) {
        const causeLabel = label(form, `slipCauseLabel.${key}`, key);
        await tx
          .insert(pathConfigSlipCause)
          .values({ key, label: causeLabel, sortOrder })
          .onConflictDoUpdate({ target: pathConfigSlipCause.key, set: { label: causeLabel, sortOrder } });
      }

      await tx
        .insert(pathConfigSlipApproval)
        .values({ id: "singleton", approverRole, thresholdDays })
        .onConflictDoUpdate({
          target: pathConfigSlipApproval.id,
          set: { approverRole, thresholdDays },
        });

      for (const [sortOrder, role] of manifest.roles.entries()) {
        const roleLabel = label(form, `roleLabel.${role.kind}.${role.key}`, role.key);
        const permissions = [
          ...new Set(
            text(form, `rolePerm.${role.kind}.${role.key}`)
              .split(/[\s,]+/)
              .map((item) => item.trim())
              .filter((item) => /^[a-z_]{2,40}$/.test(item)),
          ),
        ];
        await tx
          .insert(pathConfigRole)
          .values({ kind: role.kind, key: role.key, label: roleLabel, sortOrder, permissions })
          .onConflictDoUpdate({
            target: [pathConfigRole.kind, pathConfigRole.key],
            set: { label: roleLabel, sortOrder, permissions },
          });
      }

      if (manifest.people.length > 0) {
        const staff = await tx
          .select({ id: users.id })
          .from(users)
          .where(ne(users.role, "CUSTOMER"));
        const staffIds = new Set(staff.map((row) => row.id));
        for (const userId of manifest.people) {
          if (!staffIds.has(userId)) continue;
          const hoursPerWeek = Math.min(80, Math.max(1, Math.round(num(form, `personHours.${userId}`, 30))));
          const person = {
            canLead: checked(form, `personLead.${userId}`),
            capacityExempt: checked(form, `personExempt.${userId}`),
            capacityHidden: checked(form, `personHidden.${userId}`),
            hoursPerWeek,
          };
          await tx
            .insert(pathConfigPerson)
            .values({ userId, ...person })
            .onConflictDoUpdate({ target: pathConfigPerson.userId, set: person });
          await tx
            .update(users)
            .set({
              canLead: person.canLead,
              capacityExempt: person.capacityExempt,
              capacityHidden: person.capacityHidden,
              capacityHoursPerWeek: person.hoursPerWeek,
            })
            .where(eq(users.id, userId));
        }
      }

      const active = await tx
        .select({ version: pathConfigEstimatorVersion.version, weights: pathConfigEstimatorVersion.weights })
        .from(pathConfigEstimatorVersion)
        .where(eq(pathConfigEstimatorVersion.active, true));
      const current = active[0];
      const weightsChanged = !current || stable(current.weights) !== stable(estimator);
      if (weightsChanged) {
        const next = (current?.version ?? 0) + 1;
        if (current) {
          await tx
            .update(pathConfigEstimatorVersion)
            .set({ active: false })
            .where(eq(pathConfigEstimatorVersion.active, true));
        }
        await tx.insert(pathConfigEstimatorVersion).values({
          id: `v${next}`,
          version: next,
          active: true,
          weights: estimator as unknown as Record<string, unknown>,
          note: "Saved from Settings",
        });
      }

      for (const line of serviceLines) {
        await tx
          .insert(pathConfigServiceLine)
          .values(line)
          .onConflictDoUpdate({
            target: pathConfigServiceLine.key,
            set: {
              label: line.label,
              hours: line.hours,
              sortOrder: line.sortOrder,
              complexClinical: line.complexClinical,
            },
          });
      }

      await tx.delete(pathConfigAnalyticsExclusion);
      if (exclusionCodes.length > 0) {
        await tx.insert(pathConfigAnalyticsExclusion).values(exclusionCodes.map((code) => ({ code })));
      }
      await tx
        .update(orgSettings)
        .set({ forecastAnalysisExclusions: exclusionCodes, updatedAt: new Date() })
        .where(eq(orgSettings.id, "singleton"));

      await tx
        .insert(pathConfigHiring)
        .values({
          id: "singleton",
          leadWeeks: Math.max(0, Math.round(num(form, "hire.leadWeeks", 8))),
          utilizationPercent: num(form, "hire.utilizationPercent", 100),
          nearPercent: num(form, "hire.nearPercent", 85),
          typicalHoursPerWeek: Math.max(1, Math.round(num(form, "hire.typicalHoursPerWeek", 30))),
        })
        .onConflictDoUpdate({
          target: pathConfigHiring.id,
          set: {
            leadWeeks: Math.max(0, Math.round(num(form, "hire.leadWeeks", 8))),
            utilizationPercent: num(form, "hire.utilizationPercent", 100),
            nearPercent: num(form, "hire.nearPercent", 85),
            typicalHoursPerWeek: Math.max(1, Math.round(num(form, "hire.typicalHoursPerWeek", 30))),
          },
        });

      await tx
        .insert(pathConfigHoliday)
        .values({ id: "singleton", skipUsFederal: skipFederal })
        .onConflictDoUpdate({ target: pathConfigHoliday.id, set: { skipUsFederal: skipFederal } });
      await tx.delete(pathConfigHolidayDate);
      if (holidayDates.length > 0) {
        await tx
          .insert(pathConfigHolidayDate)
          .values(holidayDates.map((row) => ({ observedOn: row.date, name: row.name })));
      }

      await tx.delete(pathConfigTag);
      if (tags.length > 0) {
        await tx.insert(pathConfigTag).values(tags.map((name) => ({ name })));
      }

      for (const id of manifest.customFields) {
        const entity = text(form, `fieldEntity.${id}`).toLowerCase();
        const key = text(form, `fieldKey.${id}`).toLowerCase();
        const fieldLabel = label(form, `fieldLabel.${id}`, key || id);
        const fieldType = ["text", "number", "date", "boolean"].includes(text(form, `fieldType.${id}`))
          ? text(form, `fieldType.${id}`)
          : "text";
        if (!/^[a-z][a-z0-9_]{0,40}$/.test(entity) || !/^[a-z][a-z0-9_]{0,40}$/.test(key)) {
          throw new Error("Custom field entity and key use lowercase letters, numbers, and underscores.");
        }
        await tx
          .update(pathConfigCustomField)
          .set({ entity, key, label: fieldLabel, fieldType })
          .where(eq(pathConfigCustomField.id, id));
      }
      if (newField) {
        await tx.insert(pathConfigCustomField).values(newField);
      }

      for (const [sortOrder, key] of manifest.templates.entries()) {
        const name = label(form, `templateName.${key}`, key);
        const active = checked(form, `templateActive.${key}`);
        await tx
          .insert(pathConfigTemplate)
          .values({ key, name, active, sortOrder })
          .onConflictDoUpdate({
            target: pathConfigTemplate.key,
            set: { name, active, sortOrder },
          });
      }

      for (const acronym of manifest.dock) {
        await tx
          .insert(pathConfigDockAllow)
          .values({
            acronym,
            included: checked(form, `dockOn.${acronym}`),
            note: text(form, `dockNote.${acronym}`).slice(0, 200),
          })
          .onConflictDoUpdate({
            target: pathConfigDockAllow.acronym,
            set: {
              included: checked(form, `dockOn.${acronym}`),
              note: text(form, `dockNote.${acronym}`).slice(0, 200),
            },
          });
      }
      if (newDock && !manifest.dock.includes(newDock)) {
        await tx
          .insert(pathConfigDockAllow)
          .values({ acronym: newDock, included: true, note: text(form, "dockNewNote").slice(0, 200) })
          .onConflictDoNothing();
      }
    });

    resetPathConfigCache();
    revalidatePath("/settings");
    revalidatePath("/management/forecast");
    revalidatePath("/management/capacity");
    revalidatePath("/management/engagements");
    return { ok: true };
  } catch (err) {
    return { error: saveError(err) };
  }
}
