import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { extractHubSpotDealId, extractHubSpotPortalId, hubSpotOpenLabel, parseDealLink } from "@/lib/hubspot";
import { pullHubSpotDeal, hubspotDealReadRequest } from "@/lib/hubspot-deal";
import {
  ceoFieldsForDealSave,
  fillEmptyCeoFields,
  formatHubSpotDateLabel,
  hubspotDealProperties,
  mapHubSpotCeoFields,
  resolveHubSpotPropertyName,
} from "@/lib/hubspot-map";
import { toPortalAbout, type KickoffSnapshot } from "@/lib/about-profile";
import { portalPayloadHasHubSpotPull, portalProjectColumns, PORTAL_FORBIDDEN_HUBSPOT_KEYS } from "@/lib/portal-fields";
import { parseOptionalHttpUrl } from "@/lib/http-url";

describe("HubSpot deal URLs", () => {
  it("extracts deal and portal ids from HubSpot record links", () => {
    const parsed = parseDealLink(
      "https://app.hubspot.com/contacts/12345678/record/0-3/9876543210",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || !parsed.deal) throw new Error("expected deal");
    expect(parsed.deal.isHubSpot).toBe(true);
    expect(parsed.deal.dealId).toBe("9876543210");
    expect(parsed.deal.portalId).toBe("12345678");
    expect(hubSpotOpenLabel(parsed.deal)).toMatch(/9876543210/);
  });

  it("extracts ids from classic /deal/ paths", () => {
    const url = new URL("https://app-na2.hubspot.com/contacts/99/deal/42");
    expect(extractHubSpotDealId(url)).toBe("42");
    expect(extractHubSpotPortalId(url)).toBe("99");
  });

  it("clears an empty URL and rejects javascript:", () => {
    expect(parseDealLink("")).toEqual({ ok: true, deal: null });
    const bad = parseDealLink("javascript:alert(1)");
    expect(bad.ok).toBe(false);
  });

  it("still stores a clear non-HubSpot https link", () => {
    const parsed = parseDealLink("crm.example.com/deals/win");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || !parsed.deal) throw new Error("expected link");
    expect(parsed.deal.isHubSpot).toBe(false);
    expect(parsed.deal.href).toMatch(/^https:\/\/crm\.example\.com\/deals\/win/);
    expect(hubSpotOpenLabel(parsed.deal)).toBe("Open deal link");
  });
});

const MARCH_1 = String(Date.UTC(2026, 2, 1));
const JUNE_15 = String(Date.UTC(2026, 5, 15));

describe("HubSpot property mapping", () => {
  it("maps closedate and amount onto empty CEO fields", () => {
    const mapped = mapHubSpotCeoFields({
      dealname: "Acme",
      dealstage: "closedwon",
      closedate: MARCH_1,
      amount: "32400",
    });
    expect(mapped.contractDateIso).toBe("2026-03-01");
    expect(mapped.contractDate?.toISOString()).toBe("2026-03-01T12:00:00.000Z");
    expect(mapped.expectedArr).toBe("32400.00");
    expect(formatHubSpotDateLabel(MARCH_1)).toBe("Mar 1, 2026");
    expect(hubspotDealProperties()).toEqual(["dealname", "dealstage", "closedate", "amount"]);
  });

  it("prefers a custom property and falls back when that value is empty", () => {
    const custom = mapHubSpotCeoFields(
      {
        closedate: MARCH_1,
        hs_contract_date: JUNE_15,
        amount: "100.00",
        annual_recurring_revenue: "90000.5",
      },
      { contractDateProperty: "hs_contract_date", arrProperty: "annual_recurring_revenue" },
    );
    expect(custom.contractDateIso).toBe("2026-06-15");
    expect(custom.expectedArr).toBe("90000.50");

    const fallback = mapHubSpotCeoFields(
      { closedate: MARCH_1, hs_contract_date: "", amount: "1500", annual_recurring_revenue: "" },
      { contractDateProperty: "hs_contract_date", arrProperty: "annual_recurring_revenue" },
    );
    expect(fallback.contractDateIso).toBe("2026-03-01");
    expect(fallback.expectedArr).toBe("1500.00");
    expect(resolveHubSpotPropertyName("close date", "closedate")).toBe("closedate");
    expect(resolveHubSpotPropertyName("amount;drop", "amount")).toBe("amount");
  });

  it("fills empty CEO fields and does not overwrite staff values", () => {
    const pulled = {
      contractDate: new Date("2026-03-01T12:00:00.000Z"),
      expectedArr: "32400.00",
    };
    expect(fillEmptyCeoFields({ contractDate: null, expectedArr: null }, pulled)).toEqual(pulled);
    expect(fillEmptyCeoFields({ contractDate: "", expectedArr: "  " }, pulled)).toEqual(pulled);
    expect(
      fillEmptyCeoFields(
        { contractDate: new Date("2025-01-15T12:00:00.000Z"), expectedArr: "0.00" },
        pulled,
      ),
    ).toEqual({});
    expect(
      fillEmptyCeoFields({ contractDate: new Date("2025-01-15T12:00:00.000Z"), expectedArr: null }, pulled),
    ).toEqual({ expectedArr: "32400.00" });
  });

  it("keeps CEO fields when the deal URL is cleared or the token did not pull", () => {
    const existing = {
      contractDate: new Date("2025-11-15T12:00:00.000Z"),
      expectedArr: "6973.46",
    };
    const cleared = ceoFieldsForDealSave({ nextUrl: null, existing, pulled: null });
    expect(cleared).toEqual({ hubspotDealUrl: null });
    expect(cleared).not.toHaveProperty("contractDate");
    expect(cleared).not.toHaveProperty("expectedArr");

    const storedOnly = ceoFieldsForDealSave({
      nextUrl: "https://app.hubspot.com/contacts/1/record/0-3/42",
      existing,
      pulled: null,
    });
    expect(storedOnly).toEqual({
      hubspotDealUrl: "https://app.hubspot.com/contacts/1/record/0-3/42",
    });
  });
});

describe("HubSpot read", () => {
  it("builds a GET for one deal and nothing else", () => {
    const request = hubspotDealReadRequest("9876543210", ["dealname", "closedate", "amount"]);
    expect(request.method).toBe("GET");
    expect(request.url).toBe(
      "https://api.hubapi.com/crm/v3/objects/deals/9876543210?properties=dealname%2Cclosedate%2Camount",
    );
    const src = readFileSync(resolve(process.cwd(), "src/lib/hubspot-deal.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\b(POST|PUT|PATCH|DELETE)\b/);
    expect(code).toMatch(/method: request\.method/);
  });

  it("stores nothing from HubSpot when the token is unset and does not fetch", async () => {
    let calls = 0;
    const read = await pullHubSpotDeal(
      "https://app.hubspot.com/contacts/12345678/record/0-3/9876543210",
      {
        token: "",
        fetchImpl: async () => {
          calls += 1;
          throw new Error("fetch should not run");
        },
      },
    );
    expect(calls).toBe(0);
    expect(read.summary.pulled).toBe(false);
    expect(read.summary.error).toBeNull();
    expect(read.summary.deal?.dealId).toBe("9876543210");
    expect(read.ceo).toEqual({ contractDate: null, expectedArr: null });
  });

  it("reads deal name, close date, and amount on GET", async () => {
    let method = "";
    let auth = "";
    const read = await pullHubSpotDeal("https://app.hubspot.com/contacts/9/deal/42", {
      token: "test-token",
      fetchImpl: async (url, init) => {
        method = init.method ?? "";
        auth = new Headers(init.headers).get("authorization") ?? "";
        expect(url).toContain("/crm/v3/objects/deals/42");
        expect(init.body).toBeUndefined();
        return new Response(
          JSON.stringify({
            properties: {
              dealname: "Acme win",
              dealstage: "closedwon",
              closedate: MARCH_1,
              amount: "12000",
            },
          }),
          { status: 200 },
        );
      },
    });
    expect(method).toBe("GET");
    expect(auth).toBe("Bearer test-token");
    expect(read.summary.pulled).toBe(true);
    expect(read.summary.name).toBe("Acme win");
    expect(read.summary.stage).toBe("closedwon");
    expect(read.summary.closeDate).toBe(MARCH_1);
    expect(read.ceo.expectedArr).toBe("12000.00");
    expect(read.ceo.contractDate?.toISOString()).toBe("2026-03-01T12:00:00.000Z");
  });
});

describe("portal does not leak HubSpot pull data", () => {
  const kickoff: KickoffSnapshot = {
    phaseName: "Kickoff",
    phaseVisibility: "SHARED",
    items: [],
  };

  it("omits deal URL, contract date, and expected ARR from portal About and project columns", () => {
    const payload = toPortalAbout({
      projectName: "Acme implementation",
      customerName: "Acme",
      crmAcronym: "ACME",
      kickoffDate: "2026-03-01T12:00:00.000Z",
      goLiveDate: null,
      zoomBookingUrl: null,
      aboutNotes: "Welcome.",
      kickoff,
      implementationTeam: [],
      customerContacts: [],
    });
    expect(portalPayloadHasHubSpotPull(payload)).toBe(false);
    expect(JSON.stringify(payload)).not.toMatch(/hubspot|contractDate|expectedArr|32400|crmKey/i);
    expect(portalPayloadHasHubSpotPull({ expectedArr: "32400.00", nested: { hubspotDealUrl: "x" } })).toBe(
      true,
    );

    for (const key of PORTAL_FORBIDDEN_HUBSPOT_KEYS) {
      expect(portalProjectColumns).not.toHaveProperty(key);
    }
    const portalSrc = readFileSync(resolve(process.cwd(), "src/lib/portal.ts"), "utf8");
    const previewSrc = readFileSync(resolve(process.cwd(), "src/lib/portal-preview.ts"), "utf8");
    expect(portalSrc).toMatch(/columns: portalProjectColumns/);
    expect(previewSrc).toMatch(/columns: portalProjectColumns/);
  });
});

describe("optional http urls", () => {
  it("allows clearing Zoom/booking", () => {
    expect(parseOptionalHttpUrl("")).toEqual({ ok: true, href: null });
    const parsed = parseOptionalHttpUrl("https://book.example.com/kickoff");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("expected href");
    expect(parsed.href).toBe("https://book.example.com/kickoff");
  });
});
