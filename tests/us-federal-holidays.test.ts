import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCOPE,
  DEFAULT_SKIP_US_FEDERAL_HOLIDAYS,
  forecastImplementation,
  parseSkipUsFederalHolidays,
} from "@/lib/estimator";
import { chosenScenario, recommendGoLive } from "@/lib/go-live-recommendation";
import { weeksInWindow, weeklyHoursForEngagement, round1 } from "@/lib/forecast";
import {
  addDaysSkippingUsFederalHolidays,
  isUsFederalHoliday,
  usFederalHolidaysForYear,
  usFederalHolidaysInWindow,
} from "@/lib/us-federal-holidays";

function d(iso: string) {
  return new Date(`${iso}T12:00:00.000Z`);
}

describe("US federal holidays (observed)", () => {
  it("lists the standard federal set for 2026 on observed dates", () => {
    const holidays = usFederalHolidaysForYear(2026);
    expect(holidays.map((h) => `${h.date} ${h.name}`)).toEqual([
      "2026-01-01 New Year’s Day",
      "2026-01-19 Birthday of Martin Luther King, Jr.",
      "2026-02-16 Washington’s Birthday",
      "2026-05-25 Memorial Day",
      "2026-06-19 Juneteenth National Independence Day",
      "2026-07-03 Independence Day",
      "2026-09-07 Labor Day",
      "2026-10-12 Columbus Day / Indigenous Peoples’ Day",
      "2026-11-11 Veterans Day",
      "2026-11-26 Thanksgiving Day",
      "2026-12-25 Christmas Day",
    ]);
    expect(isUsFederalHoliday(d("2026-07-03"))).toBe(true);
    expect(isUsFederalHoliday(d("2026-07-04"))).toBe(false);
    expect(isUsFederalHoliday(d("2026-11-27"))).toBe(false);
  });

  it("observes New Year’s Day on Friday when January 1 is a Saturday", () => {
    // 2022-01-01 was Saturday → Friday 2021-12-31
    expect(usFederalHolidaysForYear(2021).some((h) => h.date === "2021-12-31" && /New Year/.test(h.name))).toBe(
      true,
    );
    expect(isUsFederalHoliday(d("2021-12-31"))).toBe(true);
    expect(isUsFederalHoliday(d("2022-01-01"))).toBe(false);
  });

  it("observes Independence Day on Monday when July 4 is a Sunday", () => {
    // 2027-07-04 is Sunday → Monday 2027-07-05
    expect(usFederalHolidaysForYear(2027).some((h) => h.date === "2027-07-05" && h.name === "Independence Day")).toBe(
      true,
    );
    expect(isUsFederalHoliday(d("2027-07-04"))).toBe(false);
    expect(isUsFederalHoliday(d("2027-07-05"))).toBe(true);
  });
});

describe("holiday-aware Forecast+ go-live", () => {
  const thanksgivingWindowKickoff = d("2026-11-02");

  it("defaults the toggle on and treats missing form values as on", () => {
    expect(DEFAULT_SKIP_US_FEDERAL_HOLIDAYS).toBe(true);
    expect(parseSkipUsFederalHolidays(undefined)).toBe(true);
    expect(parseSkipUsFederalHolidays("")).toBe(true);
    expect(parseSkipUsFederalHolidays("0")).toBe(false);
    expect(parseSkipUsFederalHolidays("false")).toBe(false);
    expect(parseSkipUsFederalHolidays("1")).toBe(true);
  });

  it("pushes typical go-live later across Thanksgiving / Christmas / New Year’s when ON", () => {
    const off = forecastImplementation(DEFAULT_SCOPE, thanksgivingWindowKickoff, {
      skipUsFederalHolidays: false,
    });
    const on = forecastImplementation(DEFAULT_SCOPE, thanksgivingWindowKickoff, {
      skipUsFederalHolidays: true,
    });
    const typicalOff = off.scenarios.find((s) => s.scenario === "TYPICAL")!;
    const typicalOn = on.scenarios.find((s) => s.scenario === "TYPICAL")!;

    expect(typicalOff.holidayDays).toBe(0);
    expect(typicalOff.calendarDays).toBe(typicalOff.modelCalendarDays);
    expect(typicalOn.modelCalendarDays).toBe(typicalOff.modelCalendarDays);

    const names = typicalOn.holidaysSkipped.map((h) => h.name);
    expect(names).toEqual(
      expect.arrayContaining(["Veterans Day", "Thanksgiving Day", "Christmas Day", "New Year’s Day"]),
    );
    expect(typicalOn.holidayDays).toBeGreaterThanOrEqual(4);
    expect(typicalOn.goLiveDate.getTime()).toBeGreaterThan(typicalOff.goLiveDate.getTime());
    expect(typicalOn.calendarDays).toBe(typicalOff.calendarDays + typicalOn.holidayDays);
    expect(typicalOn.goLiveDate.toISOString().slice(0, 10)).toBe(
      addDaysSkippingUsFederalHolidays(thanksgivingWindowKickoff, typicalOn.modelCalendarDays)
        .toISOString()
        .slice(0, 10),
    );
    expect(isUsFederalHoliday(typicalOn.goLiveDate)).toBe(false);
    expect(usFederalHolidaysInWindow(thanksgivingWindowKickoff, typicalOn.goLiveDate)).toHaveLength(
      typicalOn.holidayDays,
    );
  });

  it("keeps Prism-parity dates when the toggle is OFF", () => {
    const off = forecastImplementation(DEFAULT_SCOPE, thanksgivingWindowKickoff, {
      skipUsFederalHolidays: false,
    });
    const typical = off.scenarios.find((s) => s.scenario === "TYPICAL")!;
    expect(typical.calendarDays).toBe(14 + 21 + (4 * 7 + 2));
    expect(typical.goLiveDate.toISOString().slice(0, 10)).toBe("2027-01-06");
  });

  it("cascades when a pushed go-live lands on another federal holiday", () => {
    // 65d from 2026-11-10 is 2027-01-14. Veterans / Thanksgiving / Christmas /
    // New Year’s push onto MLK Day (2027-01-18), which is then skipped too.
    const kickoff = d("2026-11-10");
    const off = forecastImplementation(DEFAULT_SCOPE, kickoff, { skipUsFederalHolidays: false });
    const on = forecastImplementation(DEFAULT_SCOPE, kickoff, { skipUsFederalHolidays: true });
    const typicalOff = off.scenarios.find((s) => s.scenario === "TYPICAL")!;
    const typicalOn = on.scenarios.find((s) => s.scenario === "TYPICAL")!;
    expect(typicalOff.goLiveDate.toISOString().slice(0, 10)).toBe("2027-01-14");
    expect(typicalOn.holidaysSkipped.map((h) => h.date)).toEqual(
      expect.arrayContaining(["2026-11-11", "2026-11-26", "2026-12-25", "2027-01-01", "2027-01-18"]),
    );
    expect(typicalOn.goLiveDate.toISOString().slice(0, 10)).toBe("2027-01-19");
    expect(typicalOn.holidayDays).toBe(typicalOn.calendarDays - typicalOn.modelCalendarDays);
  });

  it("uses the holiday-adjusted window for even-spread hrs/wk when ON", () => {
    const recOff = recommendGoLive({
      scope: DEFAULT_SCOPE,
      kickoffDate: thanksgivingWindowKickoff,
      samples: [],
      skipUsFederalHolidays: false,
    });
    const recOn = recommendGoLive({
      scope: DEFAULT_SCOPE,
      kickoffDate: thanksgivingWindowKickoff,
      samples: [],
      skipUsFederalHolidays: true,
    });
    const optOff = chosenScenario(recOff, "OPTIMISTIC");
    const optOn = chosenScenario(recOn, "OPTIMISTIC");
    const pesOn = chosenScenario(recOn, "PESSIMISTIC");

    expect(optOn.calendarDays).toBeGreaterThan(optOff.calendarDays);
    expect(optOn.goLiveDate.getTime()).toBeGreaterThan(optOff.goLiveDate.getTime());

    const hours = optOn.estimatedHours;
    const weeksOff = weeksInWindow(thanksgivingWindowKickoff, optOff.goLiveDate);
    const weeksOn = weeksInWindow(thanksgivingWindowKickoff, optOn.goLiveDate);
    expect(weeksOn).toBeGreaterThan(weeksOff);
    expect(optOff.weeklyHours).toBe(round1(hours / weeksOff));
    expect(optOn.weeklyHours).toBe(round1(hours / weeksOn));
    expect(optOn.weeklyHours).toBeLessThan(optOff.weeklyHours);
    expect(
      weeklyHoursForEngagement({
        id: "_",
        code: "_",
        name: "_",
        acronym: "_",
        prismStatus: "active",
        leadId: null,
        coLeadId: null,
        ownerSplitPercent: 100,
        estimatedHours: hours,
        customHoursPerWeek: null,
        startDate: thanksgivingWindowKickoff,
        initialGoLiveDate: optOn.goLiveDate,
        targetGoLiveDate: optOn.goLiveDate,
      }),
    ).toBe(optOn.weeklyHours);

    expect(pesOn.calendarDays).toBeGreaterThan(optOn.calendarDays);
    expect(pesOn.weeklyHours).toBeLessThanOrEqual(optOn.weeklyHours);
  });
});
