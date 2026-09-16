import { describe, expect, it } from "vitest";
import { extractHubSpotDealId, extractHubSpotPortalId, hubSpotOpenLabel, parseDealLink } from "@/lib/hubspot";
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

describe("optional http urls", () => {
  it("allows clearing Zoom/booking", () => {
    expect(parseOptionalHttpUrl("")).toEqual({ ok: true, href: null });
    const parsed = parseOptionalHttpUrl("https://book.example.com/kickoff");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("expected href");
    expect(parsed.href).toBe("https://book.example.com/kickoff");
  });
});
