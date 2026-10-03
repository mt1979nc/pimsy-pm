/**
 * Optional HubSpot CRM read for staff About and CEO field fill.
 * Server-only — never import from a client component.
 *
 * READ-ONLY. This module GETs one deal by id. It does not POST, PATCH, PUT,
 * or DELETE, and it does not call the HubSpot search endpoint (that API is a
 * POST). When HUBSPOT_ACCESS_TOKEN is unset, callers store the deal URL and
 * continue. Failures never block project create.
 */
import { env } from "@/lib/env";
import { parseDealLink, type HubSpotDealSummary, type ParsedHubSpotDeal } from "@/lib/hubspot";
import {
  hubspotDealProperties,
  mapHubSpotCeoFields,
  type PulledCeoFields,
} from "@/lib/hubspot-map";

const PULL_TIMEOUT_MS = 4000;

export type HubSpotFetch = (url: string, init: RequestInit) => Promise<Response>;

export type HubSpotDealRead = {
  summary: HubSpotDealSummary;
  ceo: PulledCeoFields;
};

/** GET https://api.hubapi.com/crm/v3/objects/deals/{id}?properties=… */
export function hubspotDealReadRequest(
  dealId: string,
  properties: string[],
): { method: "GET"; url: string } {
  if (!/^\d+$/.test(dealId)) {
    throw new Error("HubSpot deal id must be digits.");
  }
  const url = new URL(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}`);
  url.searchParams.set("properties", properties.join(","));
  return { method: "GET", url: url.toString() };
}

export function hubspotPullConfigured(): boolean {
  return Boolean(env.HUBSPOT_ACCESS_TOKEN);
}

function emptyRead(
  deal: ParsedHubSpotDeal | null,
  error: string | null,
): HubSpotDealRead {
  return {
    summary: {
      pulled: false,
      deal,
      name: null,
      stage: null,
      closeDate: null,
      error,
    },
    ceo: { contractDate: null, expectedArr: null },
  };
}

/**
 * Read one deal. `token` empty → no fetch, no error. Network and HTTP failures
 * return `summary.error` and empty CEO fields. The method is always GET.
 */
export async function pullHubSpotDeal(
  rawUrl: string | null | undefined,
  opts: {
    token?: string | null;
    contractDateProperty?: string | null;
    arrProperty?: string | null;
    fetchImpl?: HubSpotFetch;
  } = {},
): Promise<HubSpotDealRead> {
  const parsed = parseDealLink(rawUrl ?? "");
  if (!parsed.ok) return emptyRead(null, parsed.error);
  const deal = parsed.deal;
  if (!deal) return emptyRead(null, null);
  if (!deal.isHubSpot || !deal.dealId) return emptyRead(deal, null);

  const token = opts.token ?? "";
  if (!token) return emptyRead(deal, null);

  const properties = hubspotDealProperties({
    contractDateProperty: opts.contractDateProperty,
    arrProperty: opts.arrProperty,
  });
  const request = hubspotDealReadRequest(deal.dealId, properties);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PULL_TIMEOUT_MS);
  try {
    const res = await fetchImpl(request.url, {
      method: request.method,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      return emptyRead(
        deal,
        res.status === 404 ? "HubSpot deal not found." : "HubSpot did not return this deal.",
      );
    }
    const body = (await res.json()) as { properties?: Record<string, unknown> };
    const mapped = mapHubSpotCeoFields(body.properties, {
      contractDateProperty: opts.contractDateProperty,
      arrProperty: opts.arrProperty,
    });
    const name = typeof body.properties?.dealname === "string" ? body.properties.dealname.trim() : "";
    const stage = typeof body.properties?.dealstage === "string" ? body.properties.dealstage.trim() : "";
    return {
      summary: {
        pulled: true,
        deal,
        name: name || null,
        stage: stage || null,
        closeDate: mapped.closeDate,
        error: null,
      },
      ceo: { contractDate: mapped.contractDate, expectedArr: mapped.expectedArr },
    };
  } catch {
    return emptyRead(
      deal,
      "Could not reach HubSpot. The deal link below still opens the record.",
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function loadHubSpotDealSummary(
  rawUrl: string | null | undefined,
): Promise<HubSpotDealSummary> {
  const read = await pullHubSpotDeal(rawUrl, {
    token: env.HUBSPOT_ACCESS_TOKEN,
    contractDateProperty: env.HUBSPOT_DEAL_CONTRACT_DATE_PROPERTY,
    arrProperty: env.HUBSPOT_DEAL_ARR_PROPERTY,
  });
  return read.summary;
}

/**
 * CEO fill for create / save. Token unset, a non-deal link, or a failed read
 * returns empty fields and does not throw — callers still store the URL.
 */
export async function readHubSpotCeoFill(
  rawUrl: string | null | undefined,
): Promise<PulledCeoFields> {
  const token = env.HUBSPOT_ACCESS_TOKEN;
  if (!token) return { contractDate: null, expectedArr: null };
  try {
    const read = await pullHubSpotDeal(rawUrl, {
      token,
      contractDateProperty: env.HUBSPOT_DEAL_CONTRACT_DATE_PROPERTY,
      arrProperty: env.HUBSPOT_DEAL_ARR_PROPERTY,
    });
    if (read.summary.error) {
      console.error("HubSpot read skipped", read.summary.error);
    }
    return read.ceo;
  } catch (err) {
    console.error("HubSpot read skipped", err);
    return { contractDate: null, expectedArr: null };
  }
}
