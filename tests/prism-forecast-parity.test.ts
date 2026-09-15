import { describe, expect, it } from "vitest";
import {
  DISCOVERY_DAYS,
  estimateHours,
  FORECAST_WEIGHTS,
  forecastImplementation,
  SERVICE_LINE_HOURS,
  type ImplementationScope,
} from "@/lib/estimator";
import { recommendGoLive } from "@/lib/go-live-recommendation";

function d(iso: string) {
  return new Date(`${iso}T12:00:00.000Z`);
}

/**
 * TEST Implementation from Alexander’s PATH vs Prism Forecast+ screenshot
 * (2026-09-15). Service lines follow Prism’s config breakdown plus eRx /
 * Medication Management. Hours must land on Prism’s 61.2h (±0.5); Typical
 * go-live is 65 calendar days from kickoff 2026-09-15 → Nov 19.
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
};

describe("Prism Forecast+ parity — TEST Implementation", () => {
  it("uses Prism config weights (not the old 5min/user · 15min/page · 1h base)", () => {
    expect(FORECAST_WEIGHTS.orgSetupHours).toBe(2);
    expect(FORECAST_WEIGHTS.billingConfigHours).toBe(3);
    expect(FORECAST_WEIGHTS.otherSettingsHours).toBe(2);
    expect(FORECAST_WEIGHTS.minutesPerUser).toBe(30);
    expect(FORECAST_WEIGHTS.minutesPerFormPage).toBe(25);
    expect(FORECAST_WEIGHTS.stateComplianceHours).toBe(2);
    expect(FORECAST_WEIGHTS.minimalOrgHours).toBe(10);
    expect(FORECAST_WEIGHTS.configDays).toBe(21);
    expect(FORECAST_WEIGHTS.trainingHoursPerSession).toBe(2.5);
    expect(DISCOVERY_DAYS).toEqual({ OPTIMISTIC: 10, TYPICAL: 14, PESSIMISTIC: 21 });
    expect(SERVICE_LINE_HOURS.PSYCH_TESTING).toBe(2);
    expect(SERVICE_LINE_HOURS.LABS).toBe(1.5);
    expect(SERVICE_LINE_HOURS.PAYROLL).toBe(1.5);
  });

  it("matches Prism total staff hours (~61.2) including training", () => {
    const hours = estimateHours(PRISM_TEST_SCOPE);
    expect(hours.trainingSessions).toBe(8);
    expect(hours.trainingHours).toBe(20);
    expect(hours.lineItems.some((l) => l.label === "Org setup" && l.hours === 2)).toBe(true);
    expect(hours.lineItems.some((l) => l.label.startsWith("User setup") && l.hours === 2.5)).toBe(true);
    expect(hours.lineItems.some((l) => l.label === "Billing config" && l.hours === 3)).toBe(true);
    expect(hours.lineItems.some((l) => l.label.startsWith("Forms") && l.hours === 10.4)).toBe(true);
    expect(hours.lineItems.some((l) => l.label === "Minimal Org Structure" && l.hours === 10)).toBe(true);
    expect(hours.lineItems.some((l) => /Training/.test(l.label))).toBe(true);
    // Prism screenshot: 61.2h (config ~41.2 + training 20). Allow 0.5h rounding.
    expect(hours.configHours).toBeCloseTo(41.2, 0);
    expect(hours.totalHours).toBeCloseTo(61.2, 0);
    expect(hours.totalHours).toBe(hours.configHours + hours.trainingHours);
  });

  it("matches Prism typical / optimistic / pessimistic calendar days and go-live", () => {
    const kickoff = d("2026-09-15");
    const result = forecastImplementation(PRISM_TEST_SCOPE, kickoff, { skipUsFederalHolidays: false });
    const [opt, typ, pes] = result.scenarios;
    expect(opt!.calendarDays).toBe(61);
    expect(typ!.calendarDays).toBe(65);
    expect(pes!.calendarDays).toBe(72);
    expect(typ!.phases.map((p) => p.name)).toEqual(["Discovery", "Config", "Training"]);
    expect(typ!.phases.find((p) => p.name === "Config")?.calendarDays).toBe(21);
    expect(typ!.phases.find((p) => p.name === "Training")?.calendarDays).toBe(30);
    expect(typ!.goLiveDate.toISOString().slice(0, 10)).toBe("2026-11-19");
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
    expect(rec.hours.totalHours).toBeCloseTo(61.2, 0);
  });
});
