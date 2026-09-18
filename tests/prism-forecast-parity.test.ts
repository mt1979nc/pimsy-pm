import { describe, expect, it } from "vitest";
import {
  configCalendarDays,
  configHoursPerDay,
  DISCOVERY_DAYS,
  estimateHours,
  FORECAST_WEIGHTS,
  forecastImplementation,
  SERVICE_LINE_HOURS,
  SERVICE_LINE_LABELS,
  type ImplementationScope,
} from "@/lib/estimator";
import { recommendGoLive } from "@/lib/go-live-recommendation";

function d(iso: string) {
  return new Date(`${iso}T12:00:00.000Z`);
}

/**
 * TEST Implementation from Alexander’s PATH vs Prism Forecast+ screenshot
 * (2026-09-15), re-locked to the confirmed PATH Forecast+ weights (not the
 * retired 30 min/user · 21d config · 2.5h/session Prism constants).
 */
const PRISM_TEST_SCOPE: ImplementationScope = {
  userCount: 5,
  locationCount: 1,
  formPageCount: 25,
  trainingsPerWeek: 2,
  serviceLines: [
    "OUTPATIENT_THERAPY",
    "MEDICATION_MANAGEMENT",
    "PSYCH_TESTING",
    "PSR_PSYCHOSOCIAL_REHAB",
    "MESSAGING",
    "EFAX",
    "LABS",
    "EVV",
    "PAYROLL",
    "OTHER_SERVICES",
  ],
  stateCompliance: true,
  minimalOrgStructure: true,
  intakeAssistant: false,
};

describe("Forecast+ lockstep — TEST Implementation", () => {
  it("uses Alexander’s confirmed config weights", () => {
    expect(FORECAST_WEIGHTS.orgSetupHours).toBe(2);
    expect(FORECAST_WEIGHTS.billingConfigHours).toBe(3);
    expect(FORECAST_WEIGHTS.otherSettingsHours).toBe(2);
    expect(FORECAST_WEIGHTS.minutesPerUser).toBe(15);
    expect(FORECAST_WEIGHTS.minutesPerLocation).toBe(30);
    expect(FORECAST_WEIGHTS.minutesPerFormPage).toBe(25);
    expect(FORECAST_WEIGHTS.stateComplianceHours).toBe(2);
    expect(FORECAST_WEIGHTS.minimalOrgHours).toBe(10);
    expect(FORECAST_WEIGHTS.intakeAssistantHours).toBe(2);
    expect(FORECAST_WEIGHTS.configDays).toBe(14);
    expect(FORECAST_WEIGHTS.maxConfigHoursPerDay).toBe(4);
    expect(FORECAST_WEIGHTS.trainingSessionHours).toBe(1);
    expect(FORECAST_WEIGHTS.trainingPrepHours).toBe(0.5);
    expect(FORECAST_WEIGHTS.trainingHoursPerSession).toBe(1.5);
    expect(
      FORECAST_WEIGHTS.trainingSessionHours + FORECAST_WEIGHTS.trainingPrepHours,
    ).toBe(FORECAST_WEIGHTS.trainingHoursPerSession);
    expect(FORECAST_WEIGHTS.payrollTrainingHours).toBe(1);
    expect(DISCOVERY_DAYS).toEqual({ OPTIMISTIC: 10, TYPICAL: 14, PESSIMISTIC: 21 });
    expect(SERVICE_LINE_HOURS.PSYCH_TESTING).toBe(2);
    expect(SERVICE_LINE_HOURS.GROUP_THERAPY).toBe(1);
    expect(SERVICE_LINE_HOURS.INPATIENT_RESIDENTIAL).toBe(5);
    expect(SERVICE_LINE_HOURS.LABS).toBe(2);
    expect(SERVICE_LINE_HOURS.EVV).toBe(2);
    expect(SERVICE_LINE_HOURS.PAYROLL).toBe(2);
    expect(SERVICE_LINE_HOURS.EATING_DISORDER).toBe(2);
    expect(SERVICE_LINE_HOURS.COURT_ORDERED_SERVICES).toBe(1);
    expect(SERVICE_LINE_LABELS.EATING_DISORDER).toBe("Eating Disorder");
    expect(SERVICE_LINE_LABELS.COURT_ORDERED_SERVICES).toBe("Court Ordered Services");
    expect(Object.keys(SERVICE_LINE_HOURS).sort()).toEqual(Object.keys(SERVICE_LINE_LABELS).sort());
  });

  it("matches confirmed staff hours including location, training 1.5h, and payroll +1h", () => {
    const hours = estimateHours(PRISM_TEST_SCOPE);
    expect(hours.trainingSessions).toBe(8);
    expect(hours.trainingHours).toBe(13);
    expect(hours.lineItems.some((l) => l.label === "Org setup" && l.hours === 2)).toBe(true);
    expect(hours.lineItems.some((l) => l.label.startsWith("User setup") && l.hours === 1.3)).toBe(true);
    expect(hours.lineItems.some((l) => l.label.startsWith("Location setup") && l.hours === 0.5)).toBe(true);
    expect(hours.lineItems.some((l) => l.label === "Billing config" && l.hours === 3)).toBe(true);
    expect(hours.lineItems.some((l) => l.label.startsWith("Forms") && l.hours === 10.4)).toBe(true);
    expect(hours.lineItems.some((l) => l.label === "Minimal Org Structure" && l.hours === 10)).toBe(true);
    expect(hours.lineItems.some((l) => l.label === "Labs" && l.hours === 2)).toBe(true);
    expect(hours.lineItems.some((l) => l.label === "EVV" && l.hours === 2)).toBe(true);
    expect(hours.lineItems.some((l) => l.label === "Payroll" && l.hours === 2)).toBe(true);
    expect(hours.lineItems.some((l) => l.label === "Payroll training" && l.hours === 1)).toBe(true);
    expect(hours.lineItems.some((l) => /Training \(8 sessions × 1\.5h\)/.test(l.label))).toBe(true);
    expect(hours.configHours).toBe(42.7);
    expect(hours.totalHours).toBe(55.7);
    expect(hours.totalHours).toBe(hours.configHours + hours.trainingHours);
    expect(configCalendarDays(hours.configHours)).toBe(14);
    expect(configHoursPerDay(hours.configHours)).toBe(3.1);
  });

  it("projects typical / optimistic / pessimistic from 14d config (not 21d)", () => {
    const kickoff = d("2026-09-15");
    const result = forecastImplementation(PRISM_TEST_SCOPE, kickoff, { skipUsFederalHolidays: false });
    const [opt, typ, pes] = result.scenarios;
    expect(opt!.calendarDays).toBe(54);
    expect(typ!.calendarDays).toBe(58);
    expect(pes!.calendarDays).toBe(65);
    expect(typ!.phases.map((p) => p.name)).toEqual(["Discovery", "Config", "Training"]);
    expect(typ!.phases.find((p) => p.name === "Config")?.calendarDays).toBe(14);
    expect(typ!.phases.find((p) => p.name === "Training")?.calendarDays).toBe(30);
    expect(opt!.goLiveDate.toISOString().slice(0, 10)).toBe("2026-11-08");
    expect(typ!.goLiveDate.toISOString().slice(0, 10)).toBe("2026-11-12");
    expect(pes!.goLiveDate.toISOString().slice(0, 10)).toBe("2026-11-19");
    expect(result.hours.totalHours).toBe(opt!.phases.reduce((s, p) => s + p.staffHours, 0));
  });

  it("keeps Add-to-roster recommendation on the Forecast+ dates even when history exists", () => {
    const kickoff = d("2026-09-15");
    const model = forecastImplementation(PRISM_TEST_SCOPE, kickoff, { skipUsFederalHolidays: false });
    const rec = recommendGoLive({
      scope: PRISM_TEST_SCOPE,
      kickoffDate: kickoff,
      samples: [
        { code: "ROH", durationDays: 35, complexityTier: "STANDARD" },
        { code: "SMSS", durationDays: 42, complexityTier: "STANDARD" },
        { code: "RPI", durationDays: 48, complexityTier: "STANDARD" },
        { code: "ABQW", durationDays: 56, complexityTier: "STANDARD" },
        { code: "MPA", durationDays: 60, complexityTier: "STANDARD" },
      ],
      skipUsFederalHolidays: false,
    });
    expect(rec.scenarios.map((s) => s.calendarDays)).toEqual(model.scenarios.map((s) => s.calendarDays));
    expect(rec.hours.totalHours).toBe(model.hours.totalHours);
    expect(rec.hours.totalHours).toBe(55.7);
  });
});
