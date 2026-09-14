import { describe, expect, it } from "vitest";
import { DEFAULT_SCOPE, forecastImplementation } from "@/lib/estimator";
import {
  chosenScenario,
  HISTORICAL_BAND_MIN_SAMPLE,
  historicalCaption,
  historicalDurationBands,
  interpolatedPercentile,
  kickoffOrToday,
  recommendGoLive,
  resolveCommittedGoLive,
  type DurationSample,
} from "@/lib/go-live-recommendation";
import { DEFAULT_ANALYSIS_EXCLUSION_CODES } from "@/lib/forecast";

function d(iso: string) {
  return new Date(`${iso}T12:00:00.000Z`);
}

const STANDARD_HISTORY: DurationSample[] = [
  { code: "ROH", durationDays: 35, complexityTier: "STANDARD" },
  { code: "SMSS", durationDays: 42, complexityTier: "STANDARD" },
  { code: "RPI", durationDays: 48, complexityTier: "STANDARD" },
  { code: "ABQW", durationDays: 56, complexityTier: "STANDARD" },
  { code: "MPA", durationDays: 60, complexityTier: "STANDARD" },
  { code: "SENSORI", durationDays: 188, complexityTier: "STANDARD" },
  { code: "MHC", durationDays: 240, complexityTier: "HIGH" },
  { code: "LECHRIS", durationDays: 229, complexityTier: "HIGH" },
  { code: "CAPSTONE", durationDays: 77, complexityTier: "MODERATE" },
  { code: "LIFECONN", durationDays: 77, complexityTier: "MODERATE" },
];

describe("interpolatedPercentile", () => {
  it("returns the only value for a singleton", () => {
    expect(interpolatedPercentile([40], 0.25)).toBe(40);
    expect(interpolatedPercentile([40], 0.75)).toBe(40);
  });

  it("interpolates inclusive percentiles", () => {
    const values = [10, 20, 30, 40];
    expect(interpolatedPercentile(values, 0)).toBe(10);
    expect(interpolatedPercentile(values, 1)).toBe(40);
    expect(interpolatedPercentile(values, 0.5)).toBe(25);
  });
});

describe("historicalDurationBands", () => {
  it("defaults to SENSORI / MHC / LECHRIS exclusions", () => {
    expect(DEFAULT_ANALYSIS_EXCLUSION_CODES).toEqual(["SENSORI", "MHC", "LECHRIS"]);
    const bands = historicalDurationBands(STANDARD_HISTORY, { complexityTier: "STANDARD" });
    expect(bands.excludedCodes).toEqual(expect.arrayContaining(["SENSORI", "MHC", "LECHRIS"]));
    expect(bands.excludedCodes).toHaveLength(3);
    expect(bands.n).toBe(5);
    expect(bands.source).toBe("tier");
    expect(bands.optimisticDays).toBeLessThanOrEqual(bands.typicalDays!);
    expect(bands.typicalDays).toBeLessThanOrEqual(bands.pessimisticDays!);
    expect(bands.pessimisticDays).toBeLessThan(188);
  });

  it("falls back to all primary sites when the tier sample is thin", () => {
    const bands = historicalDurationBands(STANDARD_HISTORY, { complexityTier: "HIGH" });
    expect(bands.source).toBe("all");
    expect(bands.n).toBe(7);
  });

  it("returns none when history is below the minimum sample", () => {
    const bands = historicalDurationBands(
      [
        { code: "ROH", durationDays: 35, complexityTier: "STANDARD" },
        { code: "SENSORI", durationDays: 188, complexityTier: "STANDARD" },
      ],
      { complexityTier: "STANDARD" },
    );
    expect(bands.source).toBe("none");
    expect(bands.n).toBeLessThan(HISTORICAL_BAND_MIN_SAMPLE);
    expect(bands.optimisticDays).toBeNull();
  });
});

describe("recommendGoLive", () => {
  const kickoff = d("2026-09-14");

  it("projects three increasing go-live dates from past-site percentiles", () => {
    const rec = recommendGoLive({
      scope: DEFAULT_SCOPE,
      kickoffDate: kickoff,
      samples: STANDARD_HISTORY,
    });
    expect(rec.goLiveSource).toBe("historical-tier");
    expect(rec.scenarios).toHaveLength(3);
    const [opt, typ, pes] = rec.scenarios;
    expect(opt!.scenario).toBe("OPTIMISTIC");
    expect(typ!.scenario).toBe("TYPICAL");
    expect(pes!.scenario).toBe("PESSIMISTIC");
    expect(opt!.calendarDays).toBeLessThan(typ!.calendarDays);
    expect(typ!.calendarDays).toBeLessThanOrEqual(pes!.calendarDays);
    expect(opt!.goLiveDate.getTime()).toBeLessThan(pes!.goLiveDate.getTime());
    expect(historicalCaption(rec.historical)).toMatch(/5 past standard/i);
    expect(historicalCaption(rec.historical)).toMatch(/SENSORI/);
  });

  it("falls back to the Forecast+ discovery model without enough history", () => {
    const rec = recommendGoLive({
      scope: DEFAULT_SCOPE,
      kickoffDate: kickoff,
      samples: [{ code: "ROH", durationDays: 35, complexityTier: "STANDARD" }],
    });
    const model = forecastImplementation(DEFAULT_SCOPE, kickoff);
    expect(rec.goLiveSource).toBe("model");
    expect(rec.scenarios.map((s) => s.calendarDays)).toEqual(model.scenarios.map((s) => s.calendarDays));
    expect(historicalCaption(rec.historical)).toMatch(/Forecast\+ discovery model/);
  });

  it("keeps the formula phase lengths as modelCalendarDays when history wins", () => {
    const rec = recommendGoLive({
      scope: DEFAULT_SCOPE,
      kickoffDate: kickoff,
      samples: STANDARD_HISTORY,
    });
    const model = forecastImplementation(DEFAULT_SCOPE, kickoff);
    expect(rec.scenarios[1]!.modelCalendarDays).toBe(model.scenarios[1]!.calendarDays);
    expect(rec.scenarios[1]!.calendarDays).not.toBe(rec.scenarios[1]!.modelCalendarDays);
  });

  it("lengthens typical weekly hours when custom hrs/wk is set", () => {
    const rec = recommendGoLive({
      scope: DEFAULT_SCOPE,
      kickoffDate: kickoff,
      samples: STANDARD_HISTORY,
      customHoursPerWeek: 3,
    });
    expect(chosenScenario(rec, "TYPICAL").weeklyHours).toBe(3);
  });

  it("drops weekly hours on the pessimistic band vs optimistic (even spread)", () => {
    const rec = recommendGoLive({
      scope: DEFAULT_SCOPE,
      kickoffDate: kickoff,
      samples: STANDARD_HISTORY,
    });
    const opt = chosenScenario(rec, "OPTIMISTIC");
    const pes = chosenScenario(rec, "PESSIMISTIC");
    expect(pes.calendarDays).toBeGreaterThan(opt.calendarDays);
    expect(pes.weeklyHours).toBeLessThanOrEqual(opt.weeklyHours);
  });

  it("uses the selected scenario when the go-live field is blank", () => {
    const rec = recommendGoLive({
      scope: DEFAULT_SCOPE,
      kickoffDate: kickoff,
      samples: STANDARD_HISTORY,
    });
    const typical = resolveCommittedGoLive({ rec, scenario: "TYPICAL", requestedGoLive: null });
    const pessimistic = resolveCommittedGoLive({ rec, scenario: "PESSIMISTIC", requestedGoLive: null });
    expect(typical.getTime()).toBe(chosenScenario(rec, "TYPICAL").goLiveDate.getTime());
    expect(pessimistic.getTime()).toBeGreaterThan(typical.getTime());
  });

  it("keeps an explicit committed date over the recommendation", () => {
    const rec = recommendGoLive({
      scope: DEFAULT_SCOPE,
      kickoffDate: kickoff,
      samples: STANDARD_HISTORY,
    });
    const committed = d("2026-12-01");
    expect(resolveCommittedGoLive({ rec, scenario: "TYPICAL", requestedGoLive: committed })).toBe(committed);
  });
});

describe("kickoffOrToday", () => {
  it("uses UTC noon today when kickoff is missing", () => {
    const now = d("2026-09-14");
    const k = kickoffOrToday(null, now);
    expect(k.toISOString()).toBe("2026-09-14T12:00:00.000Z");
  });
});
