/**
 * Layout math for the Prism headroom bar chart.
 *
 * Bars MUST use pixel heights against a fixed track. Percentage heights inside
 * a flex row with `items-end` collapse to 0 (parent height is content-sized),
 * which is what made live Forecast look empty except for the peak-week ring.
 */

export const HEADROOM_CHART_HEIGHT_PX = 160;

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

/** Pixel bar height. Zero load → 0px (no stub). Positive load is at least 4px. */
export function headroomBarHeightPx(
  billableHours: unknown,
  chartMax: number,
  chartHeightPx = HEADROOM_CHART_HEIGHT_PX,
): number {
  const hours = numericHours(billableHours);
  if (hours <= 0 || chartMax <= 0 || chartHeightPx <= 0) return 0;
  return Math.max(4, (hours / chartMax) * chartHeightPx);
}
