/**
 * Prism Engagements roster helpers. The list view shows total slip *days*
 * (sum across events), not the number of slip events.
 */

export function sumSlipDays(
  events: ReadonlyArray<{ days: number | null | undefined }>,
): number {
  return events.reduce((sum, e) => {
    const n = e.days;
    return sum + (typeof n === "number" && Number.isFinite(n) ? n : 0);
  }, 0);
}

/** Dash when there are no net slip days; otherwise the signed total. */
export function formatRosterSlipDays(total: number): string {
  if (!total) return "—";
  return String(total);
}
