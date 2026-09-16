import { describe, expect, it } from "vitest";
import { DEFAULT_SCOPE, complexityTier, forecastImplementation } from "@/lib/estimator";
import { utcDayKey } from "@/lib/dates";
import { isWeekend } from "@/lib/business-days";
import {
  COMPLEXITY_WINDOW_MULTIPLIER,
  forecastBucketForPhase,
  forecastWindowsFromProjection,
  recommendPhaseSchedule,
  resolvePlaybookScale,
  scheduleFromOffsets,
} from "@/lib/project-timeline";

function d(iso: string) {
  return new Date(`${iso}T12:00:00.000Z`);
}

describe("forecast-driven section dates", () => {
  it("maps playbook names onto Forecast+ Discovery / Config / Training buckets", () => {
    expect(forecastBucketForPhase("Kickoff")).toBe("kickoff");
    expect(forecastBucketForPhase("Discovery")).toBe("discovery");
    expect(forecastBucketForPhase("Site Configuration")).toBe("config");
    expect(forecastBucketForPhase("Accessing Pimsy")).toBe("config");
    expect(forecastBucketForPhase("Demographic Import")).toBe("config");
    expect(forecastBucketForPhase("Core (Train the Trainer)")).toBe("training");
    expect(forecastBucketForPhase("Go-Live Checklist")).toBe("training");
    expect(forecastBucketForPhase("Post Go-Live (Tier 2)")).toBe("post");
    expect(forecastBucketForPhase("Post Go-Live Survey")).toBe("post");
  });

  it("places Discovery / Config / Training on the Forecast+ windows from kickoff", () => {
    const kickoff = d("2026-09-16");
    const forecast = forecastImplementation(DEFAULT_SCOPE, kickoff, { skipUsFederalHolidays: false });
    const typical = forecast.scenarios.find((s) => s.scenario === "TYPICAL")!;
    const windows = forecastWindowsFromProjection(kickoff, typical);

    expect(utcDayKey(windows.discovery.start)).toBe("2026-09-16");
    expect(utcDayKey(windows.discovery.end)).toBe(utcDayKey(d("2026-09-30")));
    expect(utcDayKey(windows.config.start)).toBe(utcDayKey(windows.discovery.end));
    expect(utcDayKey(windows.training.end)).toBe(utcDayKey(typical.goLiveDate));

    const dates = recommendPhaseSchedule({
      phases: [
        { name: "Kickoff", offsetDays: 0, durationDays: 7 },
        { name: "Discovery", offsetDays: 5, durationDays: 14 },
        { name: "Site Configuration", offsetDays: 14, durationDays: 28 },
        { name: "Core (Train the Trainer)", offsetDays: 42, durationDays: 21 },
      ],
      kickoff,
      scaleFactor: typical.calendarDays / 90,
      forecast: typical,
      skipUsFederalHolidays: false,
    });

    expect(utcDayKey(dates.get("Discovery")!.startDate)).toBe(utcDayKey(windows.discovery.start));
    expect(utcDayKey(dates.get("Discovery")!.dueDate)).toBe(utcDayKey(windows.discovery.end));
    expect(utcDayKey(dates.get("Site Configuration")!.startDate)).toBe(utcDayKey(windows.config.start));
    expect(utcDayKey(dates.get("Core (Train the Trainer)")!.dueDate)).toBe(
      utcDayKey(windows.training.end),
    );
    for (const row of dates.values()) {
      expect(isWeekend(row.startDate)).toBe(false);
      expect(isWeekend(row.dueDate)).toBe(false);
    }
  });

  it("more service lines (complex clinical) push projected go-live later", () => {
    const kickoff = d("2026-09-16");
    // One extra complex-clinical session only lengthens the calendar when
    // it crosses a training-week boundary (1/week: 7 sessions → 8).
    const light = forecastImplementation(
      { ...DEFAULT_SCOPE, trainingsPerWeek: 1 },
      kickoff,
      { skipUsFederalHolidays: false },
    );
    const heavy = forecastImplementation(
      {
        ...DEFAULT_SCOPE,
        trainingsPerWeek: 1,
        serviceLines: ["OUTPATIENT_THERAPY", "MEDICATION_MANAGEMENT", "MAT"],
      },
      kickoff,
      { skipUsFederalHolidays: false },
    );
    const lightTypical = light.scenarios.find((s) => s.scenario === "TYPICAL")!;
    const heavyTypical = heavy.scenarios.find((s) => s.scenario === "TYPICAL")!;
    expect(heavy.hours.trainingSessions).toBeGreaterThan(light.hours.trainingSessions);
    expect(heavyTypical.calendarDays).toBeGreaterThan(lightTypical.calendarDays);
    expect(heavyTypical.goLiveDate.getTime()).toBeGreaterThan(lightTypical.goLiveDate.getTime());

    const lightDates = recommendPhaseSchedule({
      phases: [{ name: "Core (Train the Trainer)", offsetDays: 42, durationDays: 21 }],
      kickoff,
      scaleFactor: lightTypical.calendarDays / 90,
      forecast: lightTypical,
      skipUsFederalHolidays: false,
    });
    const heavyDates = recommendPhaseSchedule({
      phases: [{ name: "Core (Train the Trainer)", offsetDays: 42, durationDays: 21 }],
      kickoff,
      scaleFactor: heavyTypical.calendarDays / 90,
      forecast: heavyTypical,
      skipUsFederalHolidays: false,
    });
    expect(heavyDates.get("Core (Train the Trainer)")!.dueDate.getTime()).toBeGreaterThan(
      lightDates.get("Core (Train the Trainer)")!.dueDate.getTime(),
    );
  });
});

describe("task due recommendations", () => {
  it("snaps recommended dues off Saturday onto Friday", () => {
    const { startDate, dueDate } = scheduleFromOffsets({
      anchor: d("2026-09-18"), // Friday
      offsetDays: 0,
      durationDays: 1,
      scaleFactor: 1,
    });
    expect(utcDayKey(startDate)).toBe("2026-09-18");
    expect(utcDayKey(dueDate)).toBe("2026-09-18"); // Saturday → Friday
    expect(isWeekend(dueDate)).toBe(false);
  });

  it("can keep raw calendar days when businessDays is false", () => {
    const { dueDate } = scheduleFromOffsets({
      anchor: d("2026-09-18"),
      offsetDays: 0,
      durationDays: 1,
      scaleFactor: 1,
      businessDays: false,
    });
    expect(utcDayKey(dueDate)).toBe("2026-09-19");
    expect(isWeekend(dueDate)).toBe(true);
  });

  it("stretches the unscoped template window by complexity tier", () => {
    const kickoff = d("2026-09-16");
    const standard = resolvePlaybookScale({
      kickoff,
      templateDurationDays: 90,
      complexityTier: "STANDARD",
    });
    const enterprise = resolvePlaybookScale({
      kickoff,
      templateDurationDays: 90,
      complexityTier: "ENTERPRISE",
    });
    expect(standard.calendarDays).toBe(90);
    expect(enterprise.calendarDays).toBe(Math.round(90 * COMPLEXITY_WINDOW_MULTIPLIER.ENTERPRISE));
    expect(enterprise.scaleFactor).toBeGreaterThan(standard.scaleFactor);
    expect(complexityTier({ ...DEFAULT_SCOPE, userCount: 200, locationCount: 20 })).toBe("ENTERPRISE");
  });

  it("prefers Forecast+ calendar days over the complexity stretch", () => {
    const kickoff = d("2026-09-16");
    const scaled = resolvePlaybookScale({
      kickoff,
      templateDurationDays: 90,
      forecastCalendarDays: 65,
      complexityTier: "ENTERPRISE",
    });
    expect(scaled.source).toBe("forecast");
    expect(scaled.calendarDays).toBe(65);
  });
});
