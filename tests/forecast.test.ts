import { describe, expect, it } from "vitest";
import {
  applyPrimaryAverageExclusions,
  buildCapacityForecast,
  countsTowardActiveLoad,
  DEFAULT_ANALYSIS_EXCLUSION_CODES,
  departmentCapacityHours,
  hireNowSignal,
  isExcludedFromPrimaryAverages,
  parseExclusionCodes,
  slipWeeklyImpact,
  splitWeeklyHours,
  summarizeForecastAccuracy,
  weeklyHoursForEngagement,
  weeksInWindow,
  type ForecastEngagement,
  type ForecastStaffMember,
  type WeekAllocation,
} from "@/lib/forecast";
import { complexityTier, estimateHours, FORECAST_WEIGHTS, forecastImplementation } from "@/lib/estimator";

function d(iso: string) {
  return new Date(`${iso}T12:00:00.000Z`);
}

function engagement(partial: Partial<ForecastEngagement> & Pick<ForecastEngagement, "id">): ForecastEngagement {
  return {
    code: partial.code ?? partial.id,
    name: partial.name ?? partial.id,
    acronym: partial.acronym ?? partial.code ?? partial.id,
    prismStatus: partial.prismStatus ?? "active",
    leadId: partial.leadId ?? "alex",
    coLeadId: partial.coLeadId ?? null,
    ownerSplitPercent: partial.ownerSplitPercent ?? 100,
    estimatedHours: partial.estimatedHours ?? 40,
    customHoursPerWeek: partial.customHoursPerWeek ?? null,
    startDate: partial.startDate ?? d("2026-09-14"),
    initialGoLiveDate: partial.initialGoLiveDate ?? d("2026-11-09"),
    targetGoLiveDate: partial.targetGoLiveDate ?? d("2026-11-09"),
    ...partial,
  };
}

const staff: ForecastStaffMember[] = [
  { id: "alex", name: "Alexander", capacityHoursPerWeek: 30, capacityExempt: false, isDirector: true },
  { id: "jeremy", name: "Jeremy", capacityHoursPerWeek: 30, capacityExempt: false },
  { id: "morgan", name: "Morgan", capacityHoursPerWeek: 23, capacityExempt: true },
];

describe("weeks and weekly hours", () => {
  it("counts a 56-day window as 8 weeks", () => {
    expect(weeksInWindow(d("2026-09-14"), d("2026-11-09"))).toBe(8);
  });

  it("spreads estimated hours evenly across the current window", () => {
    expect(
      weeklyHoursForEngagement(
        engagement({
          id: "CEDAR",
          estimatedHours: 40,
          startDate: d("2026-09-14"),
          targetGoLiveDate: d("2026-11-09"),
        }),
      ),
    ).toBe(5);
  });

  it("prefers custom hrs/wk over the even spread", () => {
    expect(
      weeklyHoursForEngagement(
        engagement({
          id: "X",
          estimatedHours: 80,
          customHoursPerWeek: 2,
          startDate: d("2026-09-14"),
          targetGoLiveDate: d("2026-11-09"),
        }),
      ),
    ).toBe(2);
  });

  it("does not guess when dates or hours are missing", () => {
    expect(weeklyHoursForEngagement(engagement({ id: "P", estimatedHours: 40, startDate: null }))).toBe(0);
    expect(weeklyHoursForEngagement(engagement({ id: "Q", estimatedHours: null }))).toBe(0);
  });
});

describe("slip impact", () => {
  it("a later go-live drops weekly hours when using the even-spread model", () => {
    const slip = slipWeeklyImpact(
      engagement({
        id: "LECHRIS",
        estimatedHours: 45,
        startDate: d("2026-03-11"),
        initialGoLiveDate: d("2026-06-08"),
        targetGoLiveDate: d("2026-10-26"),
      }),
    );
    expect(slip).not.toBeNull();
    expect(slip!.slipDays).toBeGreaterThan(0);
    expect(slip!.currentWeekly).toBeLessThan(slip!.initialWeekly);
    expect(slip!.delta).toBeLessThan(0);
  });

  it("custom hrs/wk does not change when the go-live slips", () => {
    const slip = slipWeeklyImpact(
      engagement({
        id: "Y",
        estimatedHours: 45,
        customHoursPerWeek: 3,
        startDate: d("2026-03-11"),
        initialGoLiveDate: d("2026-06-08"),
        targetGoLiveDate: d("2026-10-26"),
      }),
    );
    expect(slip?.delta).toBe(0);
    expect(slip?.currentWeekly).toBe(3);
  });
});

describe("owner split and load gates", () => {
  it("splits weekly hours across lead and co-lead", () => {
    expect(splitWeeklyHours(10, 60, true)).toEqual({ lead: 6, coLead: 4 });
    expect(splitWeeklyHours(10, 100, false)).toEqual({ lead: 10, coLead: 0 });
  });

  it("counts active and pre-kickoff toward load, not pipeline", () => {
    expect(countsTowardActiveLoad("active")).toBe(true);
    expect(countsTowardActiveLoad("pre-kickoff")).toBe(true);
    expect(countsTowardActiveLoad("pipeline")).toBe(false);
  });

  it("excludes capacity-exempt hours from department capacity", () => {
    expect(departmentCapacityHours(staff)).toBe(60);
  });
});

describe("peak week, headroom, hire-now", () => {
  it("builds a weekly table, finds the peak, and fires hire-now when over cap", () => {
    const forecast = buildCapacityForecast({
      asOf: d("2026-09-14"),
      weeksAhead: 8,
      staff,
      engagements: [
        engagement({
          id: "A",
          leadId: "alex",
          estimatedHours: 240,
          startDate: d("2026-09-14"),
          targetGoLiveDate: d("2026-10-12"),
        }),
        engagement({
          id: "B",
          leadId: "jeremy",
          estimatedHours: 240,
          startDate: d("2026-09-14"),
          targetGoLiveDate: d("2026-10-12"),
        }),
        engagement({
          id: "PIPE",
          prismStatus: "pipeline",
          leadId: "alex",
          estimatedHours: 400,
          startDate: d("2026-09-14"),
          targetGoLiveDate: d("2026-10-12"),
        }),
      ],
    });

    expect(forecast.deptCapacityHours).toBe(60);
    expect(forecast.engagements.find((e) => e.id === "PIPE")?.countsTowardLoad).toBe(false);
    expect(forecast.peakWeek).not.toBeNull();
    expect(forecast.peakWeek!.billableHours).toBeGreaterThan(60);
    expect(forecast.hire.hireNow).toBe(true);
    expect(forecast.hire.hoursShort).toBeGreaterThan(0);
    expect(forecast.peakHeadroom).toBeLessThan(0);
  });

  it("keeps exempt personal hours off department billable totals", () => {
    const forecast = buildCapacityForecast({
      asOf: d("2026-09-14"),
      weeksAhead: 4,
      staff,
      engagements: [
        engagement({
          id: "M",
          leadId: "morgan",
          estimatedHours: 46,
          startDate: d("2026-09-14"),
          targetGoLiveDate: d("2026-10-12"),
        }),
      ],
    });
    expect(forecast.thisWeek?.totalHours).toBeGreaterThan(0);
    expect(forecast.thisWeek?.billableHours).toBe(0);
    expect(forecast.hire.hireNow).toBe(false);
    expect(forecast.thisWeekHeadroom).toBe(60);
  });

  it("hireNowSignal uses the 100% threshold", () => {
    const week = (billable: number, cap: number): WeekAllocation => ({
      weekOf: d("2026-09-14"),
      byPerson: [],
      billableHours: billable,
      totalHours: billable,
      headroom: cap - billable,
      utilization: cap > 0 ? billable / cap : 0,
    });
    expect(hireNowSignal(week(59, 60), 60).hireNow).toBe(false);
    expect(hireNowSignal(week(51, 60), 60).nearCapacity).toBe(true);
    expect(hireNowSignal(week(60, 60), 60).hireNow).toBe(true);
    expect(hireNowSignal(week(90, 60), 60).fteHint).toBe(1);
  });
});

describe("Analysis primary-average exclusions", () => {
  it("defaults to SENSORI, MHC, LECHRIS", () => {
    expect(DEFAULT_ANALYSIS_EXCLUSION_CODES).toEqual(["SENSORI", "MHC", "LECHRIS"]);
    expect(isExcludedFromPrimaryAverages("sensori")).toBe(true);
    expect(isExcludedFromPrimaryAverages("CEDAR")).toBe(false);
    expect(parseExclusionCodes(null)).toEqual(["SENSORI", "MHC", "LECHRIS"]);
    expect(parseExclusionCodes([])).toEqual([]);
  });

  it("drops excluded codes from primary accuracy", () => {
    const rows = [
      { code: "ROH", variance: 0, durationDays: 56 },
      { code: "SENSORI", variance: 140, durationDays: 188 },
      { code: "SMSS", variance: -10, durationDays: 42 },
    ];
    const { primary, excluded } = applyPrimaryAverageExclusions(rows);
    expect(excluded.map((r) => r.code)).toEqual(["SENSORI"]);
    const primarySummary = summarizeForecastAccuracy(primary);
    const all = summarizeForecastAccuracy(rows);
    expect(primarySummary.completed).toBe(2);
    expect(primarySummary.onTimeRate).toBe(100);
    expect(all.lateCount).toBe(1);
    expect(all.avgVariance).toBeGreaterThan(primarySummary.avgVariance ?? 0);
  });
});

describe("Forecast+ weights (estimator)", () => {
  it("keeps the Prism service-line and minute weights", () => {
    expect(FORECAST_WEIGHTS.minutesPerUser).toBe(5);
    expect(FORECAST_WEIGHTS.minutesPerFormPage).toBe(15);
    expect(FORECAST_WEIGHTS.stateComplianceHours).toBe(2);
  });

  it("scores a small outpatient site as Standard", () => {
    expect(
      complexityTier({
        userCount: 3,
        locationCount: 1,
        formPageCount: 25,
        trainingsPerWeek: 2,
        serviceLines: ["OUTPATIENT_THERAPY"],
        stateCompliance: false,
        minimalOrgStructure: false,
      }),
    ).toBe("STANDARD");
  });

  it("adds service-line and compliance hours into the estimate", () => {
    const hours = estimateHours(
      {
        userCount: 6,
        locationCount: 1,
        formPageCount: 20,
        trainingsPerWeek: 2,
        serviceLines: ["OUTPATIENT_THERAPY", "MEDICATION_MANAGEMENT"],
        stateCompliance: true,
        minimalOrgStructure: false,
      },
      8,
    );
    expect(hours.totalHours).toBeGreaterThan(10);
    expect(hours.lineItems.some((l) => l.label === "Medication Management")).toBe(true);
    expect(hours.lineItems.some((l) => l.label === "State compliance")).toBe(true);
  });

  it("projects three discovery scenarios from a kickoff date", () => {
    const result = forecastImplementation(
      {
        userCount: 3,
        locationCount: 1,
        formPageCount: 25,
        trainingsPerWeek: 2,
        serviceLines: ["OUTPATIENT_THERAPY"],
        stateCompliance: false,
        minimalOrgStructure: false,
      },
      d("2026-09-14"),
    );
    expect(result.scenarios).toHaveLength(3);
    expect(result.scenarios[0]!.calendarDays).toBeLessThan(result.scenarios[2]!.calendarDays);
    expect(result.hours.totalHours).toBeGreaterThan(0);
  });
});
