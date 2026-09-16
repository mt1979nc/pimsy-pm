/**
 * PATH-native Exclude from analytics flag.
 *
 * Staff mark a customer and/or project so E2E / stress-test data stays off
 * Prism Forecast, portfolio, capacity, and go-live metrics — without
 * archiving. Delivery UI (projects list, task hub, portal) still shows it.
 *
 * Setting name: `excludeFromAnalytics` (Postgres `exclude_from_analytics`).
 * A project is excluded when its own flag is true OR its customer account is.
 * Default false.
 */

export const ANALYTICS_EXCLUDE_FIELD = "excludeFromAnalytics";
export const ANALYTICS_EXCLUDE_COLUMN = "exclude_from_analytics";
export const ANALYTICS_EXCLUDE_LABEL =
  "Exclude from Prism / portfolio / capacity analytics";
export const ANALYTICS_EXCLUDE_HINT =
  "Keeps this site in projects, tasks, and the customer portal so day-to-day and E2E work still work. Prism Forecast, portfolio counts, team capacity, weekly hours, roster load, and go-live metrics skip it — same as archived, without archiving.";

export type AnalyticsExcludeFields = {
  excludeFromAnalytics?: boolean | null;
  customerAccount?: { excludeFromAnalytics?: boolean | null } | null;
};

export function isExcludedFromAnalytics(
  row: AnalyticsExcludeFields | null | undefined,
): boolean {
  return Boolean(row?.excludeFromAnalytics || row?.customerAccount?.excludeFromAnalytics);
}

export function keepAnalyticsRows<T extends AnalyticsExcludeFields>(rows: T[]): T[] {
  return rows.filter((row) => !isExcludedFromAnalytics(row));
}

export function keepAnalyticsByProject<
  T extends { project?: AnalyticsExcludeFields | null },
>(rows: T[]): T[] {
  return rows.filter((row) => !isExcludedFromAnalytics(row.project));
}

/** Checkbox `name="excludeFromAnalytics"` — missing means unchecked on create. */
export function parseExcludeFromAnalytics(formData: FormData): boolean {
  return formData.get("excludeFromAnalytics") === "on";
}

/**
 * For edit forms that include the shared toggle (hidden `excludeFromAnalyticsPresent`).
 * Undefined when the field was not on the form, so unrelated saves do not clear it.
 */
export function parseExcludeFromAnalyticsIfPresent(formData: FormData): boolean | undefined {
  if (!formData.has("excludeFromAnalyticsPresent")) return undefined;
  return formData.get("excludeFromAnalytics") === "on";
}
