/**
 * Columns the customer portal (and Customer view, which mirrors it) may read
 * from `project`. HubSpot deal URLs and CEO pull amounts stay off this list.
 * Staff executive / About use their own queries.
 */
export const portalProjectColumns = {
  id: true,
  name: true,
  code: true,
  status: true,
  targetGoLiveDate: true,
  taskCountDone: true,
  taskCountTotal: true,
  portalWelcomeMessage: true,
  portalEnabled: true,
  customerAccountId: true,
  bookingUrls: true,
  zoomBookingUrl: true,
} as const;

/** Keys that must never appear on a portal project select or About payload. */
export const PORTAL_FORBIDDEN_HUBSPOT_KEYS = [
  "hubspotDealUrl",
  "hubspot",
  "contractDate",
  "expectedArr",
  "crmKey",
  "ceoStatus",
  "ceoComments",
  "dealname",
  "amount",
] as const;

export function portalPayloadHasHubSpotPull(value: unknown): boolean {
  const forbidden = new Set<string>(PORTAL_FORBIDDEN_HUBSPOT_KEYS);
  const seen = new Set<unknown>();
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const [key, child] of Object.entries(cur)) {
      if (forbidden.has(key)) return true;
      if (child && typeof child === "object") stack.push(child);
    }
  }
  return false;
}
