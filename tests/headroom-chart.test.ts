import { describe, expect, it } from "vitest";
import {
  HEADROOM_CHART_HEIGHT_PX,
  HEADROOM_CHART_PAD_TOP,
  HEADROOM_CHART_PAD_X,
  HEADROOM_CHART_VIEW_WIDTH,
  buildHeadroomPlot,
  headroomChartScale,
  headroomLoadPx,
  headroomPlotX,
  headroomPlotY,
  headroomWeekTone,
  numericHours,
  weekDayKey,
  worseHeadroomTone,
} from "@/lib/headroom-chart";
import { buildCapacityForecast, memberLoadsFromForecast, type ForecastEngagement } from "@/lib/forecast";

function d(iso: string) {
  return new Date(`${iso}T12:00:00.000Z`);
}

describe("headroom chart scale (v1.11.3 line)", () => {
  it("places a 27h week well below an 80h cap on the shared y-scale", () => {
    const weeks = [
      { weekOf: "2026-09-14", billableHours: 27, headroom: 53 },
      { weekOf: "2026-09-21", billableHours: 27, headroom: 53 },
      { weekOf: "2026-09-28", billableHours: 20, headroom: 60 },
      { weekOf: "2026-10-05", billableHours: 0, headroom: 80 },
    ];
    const { chartMax, capPx, chartHeightPx } = headroomChartScale(weeks, 80);
    expect(chartHeightPx).toBe(HEADROOM_CHART_HEIGHT_PX);
    expect(chartMax).toBe(80 * 1.15);
    expect(capPx).toBeGreaterThan(100);

    const first = headroomLoadPx(27, chartMax);
    expect(first).toBeGreaterThan(40);
    expect(first).toBeLessThan(capPx);
    expect(first).toBeCloseTo((27 / chartMax) * HEADROOM_CHART_HEIGHT_PX, 5);

    const later = headroomLoadPx(20, chartMax);
    expect(later).toBeGreaterThan(30);
    expect(headroomLoadPx(0, chartMax)).toBe(0);

    const plot = buildHeadroomPlot(weeks, 80, "2026-09-14");
    expect(plot.capY).not.toBeNull();
    expect(plot.points[0]!.y).toBeGreaterThan(plot.capY!);
    expect(plot.points[3]!.y).toBe(HEADROOM_CHART_PAD_TOP + HEADROOM_CHART_HEIGHT_PX);
    expect(plot.points[0]!.isPeak).toBe(true);
    expect(plot.points.filter((p) => p.isPeak)).toHaveLength(1);
  });

  it("does not collapse later weeks when only the first week is the peak", () => {
    const weeks = Array.from({ length: 12 }, (_, i) => {
      const weekOf = d("2026-09-14");
      weekOf.setUTCDate(weekOf.getUTCDate() + i * 7);
      return {
        weekOf: weekOf.toISOString().slice(0, 10),
        billableHours: i === 0 ? 27 : 18,
        headroom: 80 - (i === 0 ? 27 : 18),
      };
    });
    const { chartMax } = headroomChartScale(weeks, 80);
    const loads = weeks.map((w) => headroomLoadPx(w.billableHours, chartMax));
    expect(loads.filter((h) => h > 0).length).toBe(12);
    expect(loads[0]!).toBeGreaterThan(loads[1]!);

    const plot = buildHeadroomPlot(weeks, 80, weeks[0]!.weekOf);
    expect(plot.points).toHaveLength(12);
    expect(plot.points[0]!.y).toBeLessThan(plot.points[1]!.y);
    expect(plot.polyline.split(" ").length).toBe(12);
  });

  it("spaces week x positions evenly inside the side pad", () => {
    expect(headroomPlotX(0, 4)).toBe(HEADROOM_CHART_PAD_X);
    expect(headroomPlotX(3, 4)).toBe(HEADROOM_CHART_VIEW_WIDTH - HEADROOM_CHART_PAD_X);
    expect(headroomPlotX(1, 4)).toBeCloseTo(HEADROOM_CHART_PAD_X + (HEADROOM_CHART_VIEW_WIDTH - 2 * HEADROOM_CHART_PAD_X) / 3, 5);
    expect(headroomPlotX(0, 1)).toBe(HEADROOM_CHART_VIEW_WIDTH / 2);
  });

  it("maps plot y downward: higher load is closer to the top (smaller y)", () => {
    const chartMax = 80 * 1.15;
    const y27 = headroomPlotY(27, chartMax);
    const y0 = headroomPlotY(0, chartMax);
    expect(y27).toBeLessThan(y0);
    expect(y0).toBe(HEADROOM_CHART_PAD_TOP + HEADROOM_CHART_HEIGHT_PX);
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
    expect(headroomLoadPx("27", chartMax)).toBeGreaterThan(40);
  });

  it("marks near-cap and over-cap tones for the load line", () => {
    expect(headroomWeekTone(20)).toBe("ok");
    expect(headroomWeekTone(9)).toBe("near");
    expect(headroomWeekTone(-4)).toBe("over");
    expect(worseHeadroomTone("ok", "near")).toBe("near");
    expect(worseHeadroomTone("near", "over")).toBe("over");

    const plot = buildHeadroomPlot(
      [
        { weekOf: "2026-09-14", billableHours: 50, headroom: 30 },
        { weekOf: "2026-09-21", billableHours: 75, headroom: 5 },
        { weekOf: "2026-09-28", billableHours: 90, headroom: -10 },
      ],
      80,
      "2026-09-28",
    );
    expect(plot.points.map((p) => p.tone)).toEqual(["ok", "near", "over"]);
    expect(plot.points[2]!.isPeak).toBe(true);
    expect(plot.capY).not.toBeNull();
    expect(plot.points[2]!.y).toBeLessThan(plot.capY!);
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

    const plot = buildHeadroomPlot(
      forecast.weeks,
      forecast.deptCapacityHours,
      forecast.peakWeek?.weekOf ?? null,
    );
    const drawn = plot.points.filter((p) => p.hours > 0);
    expect(drawn.length).toBeGreaterThan(4);
    expect(plot.points.some((p) => p.isPeak)).toBe(true);
  });
});
