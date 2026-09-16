/**
 * Client-safe HubSpot deal URL helpers. The optional CRM pull lives in
 * `hubspot-deal.ts` (server-only) so Postgres / fetch secrets never enter a
 * client bundle.
 *
 * No PHI — deal name/stage/close date only when a token is configured.
 */
import { parseHttpUrl } from "@/lib/http-url";

export type ParsedHubSpotDeal = {
  href: string;
  hostname: string;
  isHubSpot: boolean;
  dealId: string | null;
  portalId: string | null;
};

const HUBSPOT_HOST = /(^|\.)hubspot\.com$/i;

export function isHubSpotHost(hostname: string): boolean {
  return HUBSPOT_HOST.test(hostname);
}

/**
 * Parse a staff-pasted deal URL. Empty string is a clear (no deal).
 * javascript:/data: never accepted. Non-HubSpot https links still store as a
 * clear outbound link when staff paste a CRM shortcut.
 */
export function parseDealLink(
  raw: string,
): { ok: true; deal: ParsedHubSpotDeal | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, deal: null };
  const parsed = parseHttpUrl(trimmed);
  if (!parsed.ok) return parsed;
  const href = parsed.url.toString();
  const hostname = parsed.url.hostname;
  const isHubSpot = isHubSpotHost(hostname);
  return {
    ok: true,
    deal: {
      href,
      hostname,
      isHubSpot,
      dealId: isHubSpot ? extractHubSpotDealId(parsed.url) : null,
      portalId: isHubSpot ? extractHubSpotPortalId(parsed.url) : null,
    },
  };
}

/** `/deal/{id}` and `/record/0-3/{id}` (HubSpot CRM object type 0-3 = deals). */
export function extractHubSpotDealId(url: URL): string | null {
  const deal = url.pathname.match(/\/deal\/(\d+)/i);
  if (deal?.[1]) return deal[1];
  const record = url.pathname.match(/\/record\/0-3\/(\d+)/i);
  return record?.[1] ?? null;
}

export function extractHubSpotPortalId(url: URL): string | null {
  const m = url.pathname.match(/\/(?:contacts|sales)\/(\d+)\//i);
  return m?.[1] ?? null;
}

export function hubSpotOpenLabel(deal: ParsedHubSpotDeal | null): string {
  if (!deal) return "No HubSpot deal linked";
  if (deal.isHubSpot && deal.dealId) return `Open HubSpot deal ${deal.dealId}`;
  if (deal.isHubSpot) return "Open in HubSpot";
  return "Open deal link";
}

export type HubSpotDealSummary = {
  pulled: boolean;
  deal: ParsedHubSpotDeal | null;
  name: string | null;
  stage: string | null;
  closeDate: string | null;
  error: string | null;
};
