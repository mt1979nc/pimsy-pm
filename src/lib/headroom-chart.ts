/**
 * Layout math for the Prism headroom line chart (load vs capacity).
 *
 * The plot uses a shared y-scale: department capacity and weekly load share
 * the same max (+15% head). SVG y grows downward; load sits on a polyline,
 * capacity is a dashed horizontal at capY. Zero load is on the baseline.
 */

export const HEADROOM_CHART_HEIGHT_PX = 160;
export const HEADROOM_CHART_VIEW_WIDTH = 640;
export const HEADROOM_CHART_PAD_X = 24;
export const HEADROOM_CHART_PAD_TOP = 24;
export const HEADROOM_CHART_PAD_BOTTOM = 8;

export function weekDayKey(weekOf: Date | string): string {
  if (typeof weekOf === "string") {
    const trimmed = weekOf.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`;
    }
    return trimmed;
  }
  return `${weekOf.getUTCFullYear()}-${String(weekOf.getUTCMonth() + 1).padStart(2, "0")}-${String(weekOf.getUTCDate()).padStart(2, "0")}`;
}

export function numericHours(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Shared y-scale: capacity and weekly load share the same max (+15% head). */
export function headroomChartScale(
  weeks: { billableHours: unknown }[],
  capacityHours: number,
  chartHeightPx = HEADROOM_CHART_HEIGHT_PX,
): { chartMax: number; capPx: number; chartHeightPx: number } {
  const cap = Math.max(0, numericHours(capacityHours));
  const maxLoad = Math.max(cap, ...weeks.map((w) => numericHours(w.billableHours)), 1);
  const chartMax = maxLoad * 1.15;
  return {
    chartMax,
    capPx: cap > 0 && chartMax > 0 ? (cap / chartMax) * chartHeightPx : 0,
    chartHeightPx,
  };
}

/** Distance up from the plot baseline. Zero load → 0 (no stub). */
export function headroomLoadPx(
  billableHours: unknown,
  chartMax: number,
  chartHeightPx = HEADROOM_CHART_HEIGHT_PX,
): number {
  const hours = numericHours(billableHours);
  if (hours <= 0 || chartMax <= 0 || chartHeightPx <= 0) return 0;
  return (hours / chartMax) * chartHeightPx;
}

/** SVG y (downward) inside the viewBox, including top pad for the peak callout. */
export function headroomPlotY(
  billableHours: unknown,
  chartMax: number,
  chartHeightPx = HEADROOM_CHART_HEIGHT_PX,
  padTop = HEADROOM_CHART_PAD_TOP,
): number {
  return padTop + (chartHeightPx - headroomLoadPx(billableHours, chartMax, chartHeightPx));
}

/** Evenly spaced x for week `index` of `weekCount`, inset by padX. */
export function headroomPlotX(
  index: number,
  weekCount: number,
  viewWidth = HEADROOM_CHART_VIEW_WIDTH,
  padX = HEADROOM_CHART_PAD_X,
): number {
  if (weekCount <= 1) return viewWidth / 2;
  const inner = Math.max(0, viewWidth - padX * 2);
  return padX + (index / (weekCount - 1)) * inner;
}

export type HeadroomWeekTone = "ok" | "near" | "over";

export function headroomWeekTone(headroomHours: unknown): HeadroomWeekTone {
  const h = numericHours(headroomHours);
  if (h < 0) return "over";
  if (h < 10) return "near";
  return "ok";
}

/** Worse of two week tones (over > near > ok) — used to color a line segment. */
export function worseHeadroomTone(a: HeadroomWeekTone, b: HeadroomWeekTone): HeadroomWeekTone {
  if (a === "over" || b === "over") return "over";
  if (a === "near" || b === "near") return "near";
  return "ok";
}

export type HeadroomPlotPoint = {
  key: string;
  x: number;
  y: number;
  hours: number;
  headroom: number;
  tone: HeadroomWeekTone;
  isPeak: boolean;
};

export type HeadroomPlot = {
  chartMax: number;
  capPx: number;
  /** SVG y of the capacity reference, or null when cap is 0. */
  capY: number | null;
  chartHeightPx: number;
  viewWidth: number;
  viewHeight: number;
  padX: number;
  points: HeadroomPlotPoint[];
  polyline: string;
};

export function buildHeadroomPlot(
  weeks: { weekOf: Date | string; billableHours: unknown; headroom?: unknown }[],
  capacityHours: number,
  peakWeekOf?: Date | string | null,
): HeadroomPlot {
  const { chartMax, capPx, chartHeightPx } = headroomChartScale(weeks, capacityHours);
  const viewWidth = HEADROOM_CHART_VIEW_WIDTH;
  const viewHeight = HEADROOM_CHART_PAD_TOP + chartHeightPx + HEADROOM_CHART_PAD_BOTTOM;
  const peakKey = peakWeekOf ? weekDayKey(peakWeekOf) : null;
  const points: HeadroomPlotPoint[] = weeks.map((w, i) => {
    const key = weekDayKey(w.weekOf);
    const hours = numericHours(w.billableHours);
    const headroom = numericHours(w.headroom);
    return {
      key,
      x: headroomPlotX(i, weeks.length, viewWidth),
      y: headroomPlotY(hours, chartMax, chartHeightPx),
      hours,
      headroom,
      tone: headroomWeekTone(headroom),
      isPeak: peakKey === key,
    };
  });
  return {
    chartMax,
    capPx,
    capY: capPx > 0 ? HEADROOM_CHART_PAD_TOP + (chartHeightPx - capPx) : null,
    chartHeightPx,
    viewWidth,
    viewHeight,
    padX: HEADROOM_CHART_PAD_X,
    points,
    polyline: points.map((p) => `${p.x},${p.y}`).join(" "),
  };
}
