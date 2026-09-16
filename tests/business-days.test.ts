import { describe, expect, it } from "vitest";
import {
  ensureDueOnOrAfterStart,
  isBusinessDay,
  isWeekend,
  snapStartAndDue,
  toBusinessDay,
  utcWeekday,
} from "@/lib/business-days";
import { utcDayKey } from "@/lib/dates";
import { isUsFederalHoliday } from "@/lib/us-federal-holidays";

function d(iso: string) {
  return new Date(`${iso}T12:00:00.000Z`);
}

describe("business-day bumping", () => {
  it("treats Saturday and Sunday as weekend", () => {
    expect(utcWeekday(d("2026-09-18"))).toBe(5); // Friday
    expect(utcWeekday(d("2026-09-19"))).toBe(6); // Saturday
    expect(utcWeekday(d("2026-09-20"))).toBe(0); // Sunday
    expect(utcWeekday(d("2026-09-21"))).toBe(1); // Monday
    expect(isWeekend(d("2026-09-19"))).toBe(true);
    expect(isWeekend(d("2026-09-20"))).toBe(true);
    expect(isWeekend(d("2026-09-18"))).toBe(false);
    expect(isBusinessDay(d("2026-09-18"))).toBe(true);
  });

  it("bumps a Saturday due to Friday and a Saturday start to Monday", () => {
    expect(utcDayKey(toBusinessDay(d("2026-09-19"), { role: "due" }))).toBe("2026-09-18");
    expect(utcDayKey(toBusinessDay(d("2026-09-19"), { role: "start" }))).toBe("2026-09-21");
  });

  it("bumps Sunday to Monday for both start and due", () => {
    expect(utcDayKey(toBusinessDay(d("2026-09-20"), { role: "due" }))).toBe("2026-09-21");
    expect(utcDayKey(toBusinessDay(d("2026-09-20"), { role: "start" }))).toBe("2026-09-21");
  });

  it("leaves a weekday that is not a holiday alone", () => {
    expect(utcDayKey(toBusinessDay(d("2026-09-16"), { role: "due" }))).toBe("2026-09-16");
    expect(utcDayKey(toBusinessDay(d("2026-09-16"), { role: "start" }))).toBe("2026-09-16");
  });

  it("when Saturday due lands on an observed Friday holiday, keeps walking back", () => {
    // 2026-07-04 is Saturday; Independence Day is observed Friday 2026-07-03.
    expect(isUsFederalHoliday(d("2026-07-03"))).toBe(true);
    expect(utcDayKey(toBusinessDay(d("2026-07-04"), { role: "due" }))).toBe("2026-07-02");
  });

  it("when Saturday start would hit a Monday holiday, walks forward", () => {
    // 2027-01-01 is Friday (New Year’s). 2022-01-01 was Saturday → observed Fri 2021-12-31.
    // 2027-07-04 is Sunday → Independence Day observed Monday 2027-07-05.
    expect(isUsFederalHoliday(d("2027-07-05"))).toBe(true);
    // Saturday 2027-07-03 start → Monday 2027-07-05 holiday → Tuesday 2027-07-06
    expect(utcDayKey(toBusinessDay(d("2027-07-03"), { role: "start" }))).toBe("2027-07-06");
  });

  it("weekday federal holiday dues walk forward to the next business day", () => {
    // Thanksgiving 2026-11-26 Thursday
    expect(isUsFederalHoliday(d("2026-11-26"))).toBe(true);
    expect(utcDayKey(toBusinessDay(d("2026-11-26"), { role: "due" }))).toBe("2026-11-27");
  });

  it("does not treat holidays as non-work when the skip toggle is off", () => {
    expect(isBusinessDay(d("2026-11-26"), false)).toBe(true);
    expect(utcDayKey(toBusinessDay(d("2026-11-26"), { skipUsFederalHolidays: false, role: "due" }))).toBe(
      "2026-11-26",
    );
    // Saturday still bumps even with holidays off
    expect(utcDayKey(toBusinessDay(d("2026-09-19"), { skipUsFederalHolidays: false, role: "due" }))).toBe(
      "2026-09-18",
    );
  });

  it("Christmas Friday + Saturday due snaps to Thursday (holiday then weekend)", () => {
    expect(isUsFederalHoliday(d("2026-12-25"))).toBe(true);
    expect(utcDayKey(toBusinessDay(d("2026-12-26"), { role: "due" }))).toBe("2026-12-24");
  });

  it("if due bumps before start, lands on the start business day", () => {
    const start = toBusinessDay(d("2026-09-19"), { role: "start" }); // Monday 21
    const due = toBusinessDay(d("2026-09-19"), { role: "due" }); // Friday 18
    expect(utcDayKey(ensureDueOnOrAfterStart(start, due))).toBe("2026-09-21");
  });

  it("snapStartAndDue keeps a weekend span on the following Monday", () => {
    const { startDate, dueDate } = snapStartAndDue(d("2026-09-19"), d("2026-09-19"));
    expect(utcDayKey(startDate)).toBe("2026-09-21");
    expect(utcDayKey(dueDate)).toBe("2026-09-21");
  });
});
