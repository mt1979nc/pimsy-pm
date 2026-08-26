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
 * The constants below (minutes per form page, hours per service line, days
 * per phase) are carried over from PRISM's model. They are estimates, not
 * measurements — exactly like this project's own template phase durations
 * (see src/db/template-implementation.ts, which says as much). As real
 * projects complete with a recorded ProjectScope, actual vs. estimated
 * duration becomes visible on /reports/analysis — that's the feedback loop
 * meant to tune these numbers over time. Don't treat them as precise.
 */

import { addDays } from "@/lib/dates";
import type { ComplexityTier, DiscoveryScenario } from "@/db/schema";

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
  GROUP_THERAPY: 0,
  INPATIENT_RESIDENTIAL: 1,
  PSYCH_TESTING: 2,
  PSR_PSYCHOSOCIAL_REHAB: 0.5,
  PRP_PSYCHIATRIC_REHAB: 0.5,
  MESSAGING: 0.5,
  EFAX: 0.5,
  LABS: 1.5,
  EVV: 1,
  PAYROLL: 1.5,
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
};

export const DEFAULT_SCOPE: ImplementationScope = {
  userCount: 3,
  locationCount: 1,
  formPageCount: 25,
  trainingsPerWeek: 2,
  serviceLines: ["OUTPATIENT_THERAPY"],
  stateCompliance: false,
  minimalOrgStructure: false,
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

/** One-time config-hour adders from service lines + compliance — the "how
 *  fiddly is the setup" component of the complexity score, as distinct from
 *  the base per-user/per-form work every implementation has. */
function serviceLineConfigHours(scope: ImplementationScope) {
  const lines = scope.serviceLines.reduce((sum, s) => sum + (SERVICE_LINE_HOURS[s] ?? 0), 0);
  return lines + (scope.stateCompliance ? 2 : 0);
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
};

const ORG_SETUP_HOURS = 1;
const BILLING_CONFIG_HOURS = 1;
const OTHER_SETTINGS_HOURS = 1;
const MINUTES_PER_USER = 5;
const MINUTES_PER_FORM_PAGE = 15;
const CORE_TRAINING_SESSIONS = 7;

export function estimateHours(scope: ImplementationScope, estimatedWeeks: number): HourEstimate {
  const lineItems: HourLineItem[] = [
    { label: "Org setup", hours: ORG_SETUP_HOURS },
    { label: `User setup (${scope.userCount} × ${MINUTES_PER_USER}min)`, hours: round1((scope.userCount * MINUTES_PER_USER) / 60) },
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
  if (scope.stateCompliance) lineItems.push({ label: "State compliance", hours: 2 });

  if (scope.minimalOrgStructure) {
    const structureHours = round1(estimatedWeeks * 1);
    lineItems.push({
      label: `Minimal Org Structure (+1h/wk × ${estimatedWeeks} est. weeks)`,
      hours: structureHours,
    });
  }

  const trainingSessions =
    CORE_TRAINING_SESSIONS + (scope.serviceLines.some((l) => COMPLEX_CLINICAL_TRIGGERS.has(l)) ? 1 : 0);

  const totalHours = round1(lineItems.reduce((sum, l) => sum + l.hours, 0));

  return { totalHours, lineItems, trainingSessions };
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
  calendarDays: number;
  goLiveDate: Date;
  phases: PhaseProjection[];
};

export type ForecastResult = {
  scope: ImplementationScope;
  complexityTier: ComplexityTier;
  hours: HourEstimate;
  scenarios: ScenarioProjection[];
};

const KICKOFF_DAYS = 1;
const CONFIG_OVERHANG_DAYS = 7;
const SCHEDULING_BUFFER_DAYS = 2;

const DISCOVERY_DAYS: Record<DiscoveryScenario, number> = {
  OPTIMISTIC: 7,
  TYPICAL: 14,
  PESSIMISTIC: 21,
};

const SCENARIO_LABELS: Record<DiscoveryScenario, string> = {
  OPTIMISTIC: "Optimistic · continuous discovery submissions",
  TYPICAL: "Typical · mid-discovery submissions",
  PESSIMISTIC: "Pessimistic · day-7 batch submit",
};

function trainingDays(sessions: number, perWeek: number) {
  return Math.ceil(sessions / Math.max(1, perWeek)) * 7;
}

/**
 * Builds the full estimate: hours, complexity tier, and a projected go-live
 * under each of the three discovery-responsiveness scenarios, anchored to a
 * kickoff date.
 */
export function forecastImplementation(
  scope: ImplementationScope,
  kickoffDate: Date,
): ForecastResult {
  const tier = complexityTier(scope);

  const scenarios: ScenarioProjection[] = (["OPTIMISTIC", "TYPICAL", "PESSIMISTIC"] as const).map(
    (scenario) => {
      const discoveryDays = DISCOVERY_DAYS[scenario];
      const trainDays = trainingDays(
        estimateHours(scope, 1).trainingSessions,
        scope.trainingsPerWeek,
      );
      const calendarDays =
        KICKOFF_DAYS + discoveryDays + CONFIG_OVERHANG_DAYS + SCHEDULING_BUFFER_DAYS + trainDays;
      const estimatedWeeks = Math.max(1, Math.round(calendarDays / 7));
      const hours = estimateHours(scope, estimatedWeeks);

      const phases: PhaseProjection[] = [
        { name: "Kickoff", calendarDays: KICKOFF_DAYS, staffHours: 0.5, notes: "Kickoff call + schedule touchpoints" },
        {
          name: "Discovery",
          calendarDays: discoveryDays,
          staffHours: 1.5,
          notes: "Customer-led; config starts as items are submitted",
        },
        {
          name: "Config",
          calendarDays: CONFIG_OVERHANG_DAYS,
          staffHours: round1(hours.totalHours - 1.5 - 0.5),
          notes: "Org, billing, forms, service-line setup — finishes after discovery",
        },
        {
          name: "Scheduling buffer",
          calendarDays: SCHEDULING_BUFFER_DAYS,
          staffHours: 0,
          notes: "Booking rules prevent same-day scheduling",
        },
        {
          name: "Training",
          calendarDays: trainDays,
          staffHours: round1(hours.trainingSessions * 1.25),
          notes: `${hours.trainingSessions} sessions × ${scope.trainingsPerWeek}/week`,
        },
      ];

      return {
        scenario,
        label: SCENARIO_LABELS[scenario],
        discoveryDays,
        calendarDays,
        goLiveDate: addDays(kickoffDate, calendarDays),
        phases,
      };
    },
  );

  const typicalWeeks = Math.max(1, Math.round((scenarios[1]?.calendarDays ?? 42) / 7));

  return {
    scope,
    complexityTier: tier,
    hours: estimateHours(scope, typicalWeeks),
    scenarios,
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
