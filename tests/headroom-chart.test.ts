import { describe, expect, it } from "vitest";
import {
  HEADROOM_CHART_HEIGHT_PX,
  headroomBarHeightPx,
  headroomChartScale,
  numericHours,
  weekDayKey,
} from "@/lib/headroom-chart";
import { buildCapacityForecast, memberLoadsFromForecast, type ForecastEngagement } from "@/lib/forecast";

function d(iso: string) {
  return new Date(`${iso}T12:00:00.000Z`);
}

describe("headroom chart scale (v1.11.2)", () => {
  it("gives a 27h week vs 80h cap a meaningful pixel height, not a 2px stub", () => {
    const weeks = [
      { billableHours: 27 },
      { billableHours: 27 },
      { billableHours: 20 },
      { billableHours: 0 },
    ];
    const { chartMax, capPx, chartHeightPx } = headroomChartScale(weeks, 80);
    expect(chartHeightPx).toBe(HEADROOM_CHART_HEIGHT_PX);
    expect(chartMax).toBe(80 * 1.15);
    expect(capPx).toBeGreaterThan(100);

    const first = headroomBarHeightPx(27, chartMax);
    expect(first).toBeGreaterThan(40);
    expect(first).toBeLessThan(capPx);
    expect(first).toBeCloseTo((27 / chartMax) * HEADROOM_CHART_HEIGHT_PX, 5);

    const later = headroomBarHeightPx(20, chartMax);
    expect(later).toBeGreaterThan(30);
    expect(headroomBarHeightPx(0, chartMax)).toBe(0);
  });

  it("does not collapse later weeks when only the first week is the peak", () => {
    const weeks = Array.from({ length: 12 }, (_, i) => ({ billableHours: i === 0 ? 27 : 18 }));
    const { chartMax } = headroomChartScale(weeks, 80);
    const heights = weeks.map((w) => headroomBarHeightPx(w.billableHours, chartMax));
    expect(heights.filter((h) => h >= 4).length).toBe(12);
    expect(heights[0]!).toBeGreaterThan(heights[1]!);
  });

  it("parses snapshot date-only week keys the same as Date weekOf", () => {
    expect(weekDayKey("2026-09-14")).toBe("2026-09-14");
    expect(weekDayKey(d("2026-09-14"))).toBe("2026-09-14");
    expect(weekDayKey("2026-09-14T00:00:00.000Z")).toBe("2026-09-14");
  });

  it("coerces string hours from JSON snapshots", () => {
    expect(numericHours("27")).toBe(27);
    expect(numericHours(undefined)).toBe(0);
    const { chartMax } = headroomChartScale([{ billableHours: "27" as unknown as number }], 80);
    expect(headroomBarHeightPx("27", chartMax)).toBeGreaterThan(40);
  });
});

describe("memberLoadsFromForecast", () => {
  it("shows this-week and peak hours for every rostered person", () => {
    const staff = [
      { id: "alex", name: "Alexander", email: "a@x", capacityHoursPerWeek: 30, capacityExempt: false, isDirector: true },
      { id: "jeremy", name: "Jeremy", email: "j@x", capacityHoursPerWeek: 30, capacityExempt: false },
      { id: "morgan", name: "Morgan", email: "m@x", capacityHoursPerWeek: 20, capacityExempt: true },
    ];
    const engagement = (partial: Partial<ForecastEngagement> & { id: string }): ForecastEngagement => ({
      code: partial.id,
      name: partial.id,
      acronym: partial.id,
      prismStatus: "active",
      leadId: "alex",
      coLeadId: null,
      ownerSplitPercent: 100,
      estimatedHours: 80,
      customHoursPerWeek: 10,
      startDate: d("2026-09-14"),
      initialGoLiveDate: d("2026-11-09"),
      targetGoLiveDate: d("2026-11-09"),
      ...partial,
    });
    const forecast = buildCapacityForecast({
      asOf: d("2026-09-14"),
      weeksAhead: 12,
      staff,
      engagements: [
        engagement({ id: "A", leadId: "alex", customHoursPerWeek: 12 }),
        engagement({ id: "B", leadId: "jeremy", customHoursPerWeek: 15 }),
      ],
    });

    expect(forecast.thisWeek?.billableHours).toBe(27);
    expect(forecast.deptCapacityHours).toBe(60);

    const members = memberLoadsFromForecast(forecast);
    expect(members).toHaveLength(3);
    expect(members.map((m) => m.id)).toEqual(["alex", "jeremy", "morgan"]);
    expect(members.find((m) => m.id === "alex")?.thisWeekHours).toBe(12);
    expect(members.find((m) => m.id === "jeremy")?.thisWeekHours).toBe(15);
    expect(members.find((m) => m.id === "morgan")?.thisWeekHours).toBe(0);
    expect(members.reduce((sum, m) => sum + (m.capacityExempt ? 0 : m.thisWeekHours), 0)).toBe(27);

    for (const m of members.filter((p) => !p.capacityExempt)) {
      expect(m.peakHours).toBeGreaterThan(0);
      expect(m.peakHours).toBeGreaterThanOrEqual(m.thisWeekHours);
    }

    const { chartMax } = headroomChartScale(forecast.weeks, forecast.deptCapacityHours);
    const drawn = forecast.weeks.filter((w) => headroomBarHeightPx(w.billableHours, chartMax) >= 4);
    expect(drawn.length).toBeGreaterThan(4);
  });
});
