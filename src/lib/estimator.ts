/**
 * Implementation scoping & forecasting — ported from PRISM's Forecast+.
 * ---------------------------------------------------------------------------
 * PRISM used to be a separate, hand-maintained tool where a specialist scoped
 * a deal by hand and then re-entered everything here to actually start the
 * project. This module is that scoping logic, brought in-house: given what's
 * known about an implementation, it estimates staff hours, a complexity
 * tier, and a projected go-live under three discovery-responsiveness
 * scenarios.
 *
 * Weights and phase lengths are Alexander’s confirmed Forecast+ model
 * (PATH-native). New project / Add to roster / Forecast use these constants.
 * Stored project_scope snapshots are not bulk re-estimated — hours refresh
 * on the next save. Training hours are part of the total. Playbook template
 * duration is a separate schedule scale and is not this estimate.
 */

import { addDays, utcCalendarDaysBetween } from "@/lib/dates";
import type { ComplexityTier, DiscoveryScenario } from "@/db/schema";
import {
  addDaysSkippingUsFederalHolidays,
  usFederalHolidaysInWindow,
  type UsFederalHoliday,
} from "@/lib/us-federal-holidays";

// ---------------------------------------------------------------------------
// Service lines
// ---------------------------------------------------------------------------

/** Extra one-time configuration hours each service line adds, beyond the base. */
export const SERVICE_LINE_HOURS: Record<string, number> = {
  OUTPATIENT_THERAPY: 0,
  MEDICATION_MANAGEMENT: 1.5,
  MAT: 1,
  IOP: 1,
  PHP: 1,
  GROUP_THERAPY: 1,
  INPATIENT_RESIDENTIAL: 5,
  PSYCH_TESTING: 2,
  PSR_PSYCHOSOCIAL_REHAB: 0.5,
  PRP_PSYCHIATRIC_REHAB: 0.5,
  MESSAGING: 0.5,
  EFAX: 0.5,
  LABS: 2,
  EVV: 2,
  PAYROLL: 2,
  EATING_DISORDER: 2,
  COURT_ORDERED_SERVICES: 1,
  OTHER_SERVICES: 0.5,
};

export const SERVICE_LINE_LABELS: Record<string, string> = {
  OUTPATIENT_THERAPY: "Outpatient Therapy",
  MEDICATION_MANAGEMENT: "Medication Management",
  MAT: "MAT",
  IOP: "IOP",
  PHP: "PHP",
  GROUP_THERAPY: "Group Therapy",
  INPATIENT_RESIDENTIAL: "Inpatient / Residential",
  PSYCH_TESTING: "Psych Testing",
  PSR_PSYCHOSOCIAL_REHAB: "PSR / Psychosocial Rehab",
  PRP_PSYCHIATRIC_REHAB: "PRP / Psychiatric Rehab",
  MESSAGING: "Messaging",
  EFAX: "eFax",
  LABS: "Labs",
  EVV: "EVV",
  PAYROLL: "Payroll",
  EATING_DISORDER: "Eating Disorder",
  COURT_ORDERED_SERVICES: "Court Ordered Services",
  OTHER_SERVICES: "Other Services",
};

/** Service lines that pull in the optional advanced-clinical training. */
const COMPLEX_CLINICAL_TRIGGERS = new Set(["MEDICATION_MANAGEMENT", "MAT", "PSYCH_TESTING"]);

// ---------------------------------------------------------------------------
// Input shape
// ---------------------------------------------------------------------------

export type ImplementationScope = {
  userCount: number;
  locationCount: number;
  formPageCount: number;
  trainingsPerWeek: number;
  serviceLines: string[];
  stateCompliance: boolean;
  minimalOrgStructure: boolean;
  /** Add-on flag (not a service line). 2h config, like state compliance. */
  intakeAssistant: boolean;
};

export const DEFAULT_SCOPE: ImplementationScope = {
  userCount: 3,
  locationCount: 1,
  formPageCount: 25,
  trainingsPerWeek: 2,
  serviceLines: ["OUTPATIENT_THERAPY"],
  stateCompliance: false,
  minimalOrgStructure: false,
  intakeAssistant: false,
};

// ---------------------------------------------------------------------------
// Complexity tier
// ---------------------------------------------------------------------------

function bandUsers(n: number) {
  if (n > 150) return 3;
  if (n > 50) return 2;
  if (n > 10) return 1;
  return 0;
}
function bandLocations(n: number) {
  if (n > 15) return 3;
  if (n > 5) return 2;
  if (n > 1) return 1;
  return 0;
}
function bandConfigHours(hrs: number) {
  if (hrs > 5) return 2;
  if (hrs >= 3) return 1;
  return 0;
}

/** One-time config-hour adders from service lines + flags — the "how
 *  fiddly is the setup" component of the complexity score, as distinct from
 *  the base per-user/per-location/per-form work every implementation has. */
function serviceLineConfigHours(scope: ImplementationScope) {
  const lines = scope.serviceLines.reduce((sum, s) => sum + (SERVICE_LINE_HOURS[s] ?? 0), 0);
  return (
    lines +
    (scope.stateCompliance ? FORECAST_WEIGHTS.stateComplianceHours : 0) +
    (scope.intakeAssistant ? FORECAST_WEIGHTS.intakeAssistantHours : 0)
  );
}

/**
 * Standard → Enterprise, from users/locations/config-hour bands. Ported from
 * PRISM v5's scoring model.
 */
export function complexityTier(scope: ImplementationScope): ComplexityTier {
  const score =
    bandUsers(scope.userCount) +
    bandLocations(scope.locationCount) +
    bandConfigHours(serviceLineConfigHours(scope));
  if (score >= 6) return "ENTERPRISE";
  if (score >= 4) return "HIGH";
  if (score >= 2) return "MODERATE";
  return "STANDARD";
}

// ---------------------------------------------------------------------------
// Staff-hour estimate
// ---------------------------------------------------------------------------

export type HourLineItem = { label: string; hours: number };

export type HourEstimate = {
  totalHours: number;
  lineItems: HourLineItem[];
  /** Training sessions the curriculum calls for, before /week is applied. */
  trainingSessions: number;
  /** Sessions × (session + prep) plus payroll training allotment — included in totalHours. */
  trainingHours: number;
  /** totalHours minus training. */
  configHours: number;
};

/**
 * Forecast+ weights — Alexander’s confirmed PATH model.
 * Shown on Management → Forecast. Existing project_scope snapshots stay as
 * stored until the next save; these constants apply to new scopes / Forecast.
 */
export const FORECAST_WEIGHTS = {
  orgSetupHours: 2,
  billingConfigHours: 3,
  otherSettingsHours: 2,
  minutesPerUser: 15,
  /** Location count now adds hours, not only complexity banding. */
  minutesPerLocation: 30,
  minutesPerFormPage: 25,
  coreTrainingSessions: 7,
  stateComplianceHours: 2,
  /** Flat add-on when the practice has no org structure to copy. */
  minimalOrgHours: 10,
  /** Intake Assistant add-on (checkbox, not a service line). */
  intakeAssistantHours: 2,
  /**
   * Base config calendar days after discovery. Display load is
   * configHours / configDays. If that would exceed maxConfigHoursPerDay,
   * configCalendarDays() extends the window (never shorter than this base).
   */
  configDays: 14,
  /** Cap used to extend config days: days = max(14, ceil(configHours / 4)). */
  maxConfigHoursPerDay: 4,
  /** Folded into the training span (8 sessions @ 2/wk → 30d, not 28). */
  schedulingBufferDays: 2,
  /** Live training session length. */
  trainingSessionHours: 1,
  /** Prep folded into each curriculum session. */
  trainingPrepHours: 0.5,
  /** Session + prep. 1.0 + 0.5 = 1.5h per core/advanced-clinical session. */
  trainingHoursPerSession: 1.5,
  /**
   * Extra training allotment when PAYROLL is selected — not an extra core
   * session (COMPLEX_CLINICAL_TRIGGERS unchanged).
   */
  payrollTrainingHours: 1,
} as const;

const ORG_SETUP_HOURS = FORECAST_WEIGHTS.orgSetupHours;
const BILLING_CONFIG_HOURS = FORECAST_WEIGHTS.billingConfigHours;
const OTHER_SETTINGS_HOURS = FORECAST_WEIGHTS.otherSettingsHours;
const MINUTES_PER_USER = FORECAST_WEIGHTS.minutesPerUser;
const MINUTES_PER_LOCATION = FORECAST_WEIGHTS.minutesPerLocation;
const MINUTES_PER_FORM_PAGE = FORECAST_WEIGHTS.minutesPerFormPage;
const CORE_TRAINING_SESSIONS = FORECAST_WEIGHTS.coreTrainingSessions;

export function trainingSessionCount(scope: ImplementationScope): number {
  return CORE_TRAINING_SESSIONS + (scope.serviceLines.some((l) => COMPLEX_CLINICAL_TRIGGERS.has(l)) ? 1 : 0);
}

function hasPayroll(scope: ImplementationScope) {
  return scope.serviceLines.includes("PAYROLL");
}

/**
 * Config calendar days after discovery.
 *
 * Base window is `FORECAST_WEIGHTS.configDays` (14). Display load is
 * `configHours / 14`. If that would exceed `maxConfigHoursPerDay` (4h),
 * extend: `days = max(14, ceil(configHours / 4))`. Never shorter than 14.
 */
export function configCalendarDays(configHours: number): number {
  const base = FORECAST_WEIGHTS.configDays;
  const cap = FORECAST_WEIGHTS.maxConfigHoursPerDay;
  if (!(configHours > 0) || !(cap > 0)) return base;
  return Math.max(base, Math.ceil(configHours / cap));
}

/** Display hrs/day against the 14-day base window (not the possibly extended span). */
export function configHoursPerDay(configHours: number): number {
  return round1(configHours / FORECAST_WEIGHTS.configDays);
}

export function estimateHours(scope: ImplementationScope, _estimatedWeeks?: number): HourEstimate {
  const lineItems: HourLineItem[] = [
    { label: "Org setup", hours: ORG_SETUP_HOURS },
    { label: `User setup (${scope.userCount} × ${MINUTES_PER_USER}min)`, hours: round1((scope.userCount * MINUTES_PER_USER) / 60) },
    {
      label: `Location setup (${scope.locationCount} × ${MINUTES_PER_LOCATION}min)`,
      hours: round1((scope.locationCount * MINUTES_PER_LOCATION) / 60),
    },
    { label: "Billing config", hours: BILLING_CONFIG_HOURS },
    {
      label: `Forms (${scope.formPageCount}p × ${MINUTES_PER_FORM_PAGE}min)`,
      hours: round1((scope.formPageCount * MINUTES_PER_FORM_PAGE) / 60),
    },
    { label: "Other / settings", hours: OTHER_SETTINGS_HOURS },
  ];

  for (const line of scope.serviceLines) {
    const hrs = SERVICE_LINE_HOURS[line];
    if (hrs) lineItems.push({ label: SERVICE_LINE_LABELS[line] ?? line, hours: hrs });
  }
  if (scope.stateCompliance) {
    lineItems.push({ label: "State compliance", hours: FORECAST_WEIGHTS.stateComplianceHours });
  }

  if (scope.minimalOrgStructure) {
    lineItems.push({
      label: "Minimal Org Structure",
      hours: FORECAST_WEIGHTS.minimalOrgHours,
    });
  }

  if (scope.intakeAssistant) {
    lineItems.push({ label: "Intake Assistant", hours: FORECAST_WEIGHTS.intakeAssistantHours });
  }

  const trainingSessions = trainingSessionCount(scope);
  const sessionTrainingHours = round1(trainingSessions * FORECAST_WEIGHTS.trainingHoursPerSession);
  const payrollTrainingHours = hasPayroll(scope) ? FORECAST_WEIGHTS.payrollTrainingHours : 0;
  const trainingHours = round1(sessionTrainingHours + payrollTrainingHours);
  lineItems.push({
    label: `Training (${trainingSessions} sessions × ${FORECAST_WEIGHTS.trainingHoursPerSession}h)`,
    hours: sessionTrainingHours,
  });
  if (payrollTrainingHours) {
    lineItems.push({ label: "Payroll training", hours: payrollTrainingHours });
  }

  const totalHours = round1(lineItems.reduce((sum, l) => sum + l.hours, 0));
  const configHours = round1(totalHours - trainingHours);

  return { totalHours, lineItems, trainingSessions, trainingHours, configHours };
}

// ---------------------------------------------------------------------------
// Timeline scenarios
// ---------------------------------------------------------------------------

export type PhaseProjection = {
  name: string;
  calendarDays: number;
  staffHours: number;
  notes: string;
};

export type ScenarioProjection = {
  scenario: DiscoveryScenario;
  label: string;
  discoveryDays: number;
  /** Formula days (discovery + configCalendarDays + training), before holiday skips. */
  modelCalendarDays: number;
  /** Kickoff → go-live elapsed calendar days (includes skipped holidays when the toggle is on). */
  calendarDays: number;
  holidayDays: number;
  holidaysSkipped: UsFederalHoliday[];
  goLiveDate: Date;
  phases: PhaseProjection[];
};

export type ForecastResult = {
  scope: ImplementationScope;
  complexityTier: ComplexityTier;
  hours: HourEstimate;
  scenarios: ScenarioProjection[];
};

const SCHEDULING_BUFFER_DAYS = FORECAST_WEIGHTS.schedulingBufferDays;

export const DISCOVERY_SCENARIOS = ["OPTIMISTIC", "TYPICAL", "PESSIMISTIC"] as const satisfies readonly DiscoveryScenario[];

/** Prism Forecast+ discovery-responsiveness bands (not historical percentiles). */
export const DISCOVERY_DAYS: Record<DiscoveryScenario, number> = {
  OPTIMISTIC: 10,
  TYPICAL: 14,
  PESSIMISTIC: 21,
};

export const SCENARIO_LABELS: Record<DiscoveryScenario, string> = {
  OPTIMISTIC: "Optimistic · continuous discovery submissions",
  TYPICAL: "Typical · mid-discovery submissions",
  PESSIMISTIC: "Pessimistic · day-7 batch submit",
};

export function parseDiscoveryScenario(raw: unknown): DiscoveryScenario {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "OPTIMISTIC" || s === "TYPICAL" || s === "PESSIMISTIC") return s;
  return "TYPICAL";
}

/** Product default: account for US federal holidays when projecting go-live. */
export const DEFAULT_SKIP_US_FEDERAL_HOLIDAYS = true;

export function parseSkipUsFederalHolidays(raw: unknown): boolean {
  if (raw == null || String(raw).trim() === "") return DEFAULT_SKIP_US_FEDERAL_HOLIDAYS;
  const s = String(raw).trim().toLowerCase();
  if (s === "0" || s === "false" || s === "off" || s === "no") return false;
  if (s === "1" || s === "true" || s === "on" || s === "yes") return true;
  return DEFAULT_SKIP_US_FEDERAL_HOLIDAYS;
}

export type ForecastOptions = {
  /** When true (default), skip observed US federal holidays in the kickoff → go-live window. */
  skipUsFederalHolidays?: boolean;
};

function addProjectedDays(start: Date, days: number, skipHolidays: boolean): Date {
  return skipHolidays ? addDaysSkippingUsFederalHolidays(start, days) : addDays(start, days);
}

/** Training span: whole weeks of sessions plus Prism's 2-day scheduling buffer. */
export function trainingDays(sessions: number, perWeek: number) {
  const weeks = Math.ceil(sessions / Math.max(1, perWeek));
  return weeks * 7 + SCHEDULING_BUFFER_DAYS;
}

/**
 * Builds the full estimate: hours, complexity tier, and a projected go-live
 * under each of the three discovery-responsiveness scenarios, anchored to a
 * kickoff date. Calendar = discovery + config days (14d base, extended when
 * config hours would exceed 4h/day) + training. When `skipUsFederalHolidays`
 * is on (default), those formula days are walked on the calendar with observed
 * US federal holidays skipped, so go-live moves later instead of treating
 * Thanksgiving / Christmas / etc. as work days.
 */
export function forecastImplementation(
  scope: ImplementationScope,
  kickoffDate: Date,
  opts?: ForecastOptions,
): ForecastResult {
  const tier = complexityTier(scope);
  const hours = estimateHours(scope);
  const skipHolidays = opts?.skipUsFederalHolidays ?? DEFAULT_SKIP_US_FEDERAL_HOLIDAYS;
  const configDays = configCalendarDays(hours.configHours);

  const scenarios: ScenarioProjection[] = DISCOVERY_SCENARIOS.map(
    (scenario) => {
      const discoveryDays = DISCOVERY_DAYS[scenario];
      const trainDays = trainingDays(hours.trainingSessions, scope.trainingsPerWeek);
      const modelCalendarDays = discoveryDays + configDays + trainDays;

      const discoveryEnd = addProjectedDays(kickoffDate, discoveryDays, skipHolidays);
      const configEnd = addProjectedDays(discoveryEnd, configDays, skipHolidays);
      const goLiveDate = addProjectedDays(configEnd, trainDays, skipHolidays);
      const calendarDays = skipHolidays
        ? utcCalendarDaysBetween(kickoffDate, goLiveDate)
        : modelCalendarDays;
      const holidaysSkipped = skipHolidays ? usFederalHolidaysInWindow(kickoffDate, goLiveDate) : [];

      const phases: PhaseProjection[] = [
        {
          name: "Discovery",
          calendarDays: skipHolidays ? utcCalendarDaysBetween(kickoffDate, discoveryEnd) : discoveryDays,
          staffHours: 0,
          notes: "Customer-led; config starts as items are submitted",
        },
        {
          name: "Config",
          calendarDays: skipHolidays ? utcCalendarDaysBetween(discoveryEnd, configEnd) : configDays,
          staffHours: hours.configHours,
          notes: "Org, billing, forms, service-line setup — finishes after discovery",
        },
        {
          name: "Training",
          calendarDays: skipHolidays ? utcCalendarDaysBetween(configEnd, goLiveDate) : trainDays,
          staffHours: hours.trainingHours,
          notes: `${hours.trainingSessions} sessions × ${scope.trainingsPerWeek}/week`,
        },
      ];

      return {
        scenario,
        label: SCENARIO_LABELS[scenario],
        discoveryDays,
        modelCalendarDays,
        calendarDays,
        holidayDays: holidaysSkipped.length,
        holidaysSkipped,
        goLiveDate,
        phases,
      };
    },
  );

  return {
    scope,
    complexityTier: tier,
    hours,
    scenarios,
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
