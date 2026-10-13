/**
 * Optional HubSpot CRM pull for staff About. Server-only — never import from a
 * client component. When HUBSPOT_ACCESS_TOKEN is unset, callers show the
 * stored deal URL as a clear outbound link instead.
 */
import { env } from "@/lib/env";
import { parseDealLink, type HubSpotDealSummary } from "@/lib/hubspot";

const PULL_TIMEOUT_MS = 4000;

export async function loadHubSpotDealSummary(rawUrl: string | null | undefined): Promise<HubSpotDealSummary> {
  const parsed = parseDealLink(rawUrl ?? "");
  if (!parsed.ok) {
    return { pulled: false, deal: null, name: null, stage: null, closeDate: null, error: parsed.error };
  }
  const deal = parsed.deal;
  if (!deal) {
    return { pulled: false, deal: null, name: null, stage: null, closeDate: null, error: null };
  }
  if (!deal.isHubSpot || !deal.dealId) {
    return { pulled: false, deal, name: null, stage: null, closeDate: null, error: null };
  }
  const token = env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    return { pulled: false, deal, name: null, stage: null, closeDate: null, error: null };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PULL_TIMEOUT_MS);
  try {
    const url = new URL(`https://api.hubapi.com/crm/v3/objects/deals/${deal.dealId}`);
    url.searchParams.set("properties", "dealname,dealstage,closedate");
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        pulled: false,
        deal,
        name: null,
        stage: null,
        closeDate: null,
        error: res.status === 404 ? "HubSpot deal not found." : "HubSpot did not return this deal.",
      };
    }
    const body = (await res.json()) as {
      properties?: { dealname?: string; dealstage?: string; closedate?: string };
    };
    const props = body.properties ?? {};
    return {
      pulled: true,
      deal,
      name: props.dealname?.trim() || null,
      stage: props.dealstage?.trim() || null,
      closeDate: props.closedate?.trim() || null,
      error: null,
    };
  } catch {
    return {
      pulled: false,
      deal,
      name: null,
      stage: null,
      closeDate: null,
      error: "Could not reach HubSpot. The deal link below still opens the record.",
    };
  } finally {
    clearTimeout(timer);
  }
}
