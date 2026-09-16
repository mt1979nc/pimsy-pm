import { describe, expect, it } from "vitest";
import {
  ZENDESK_ORIGIN,
  ZENDESK_SUBDOMAIN,
  isPimsyStaffEmail,
  practiceContactEmails,
  practiceEmailDomains,
  zendeskAgentSearchUrl,
  zendeskOrgSetupSearchUrl,
  zendeskSetupLinks,
  zendeskUserEmailSearchUrl,
} from "@/lib/zendesk";

describe("Zendesk agent search deep-links", () => {
  it("uses the documented pimsyemr Help Desk host — not a guessed subdomain or token", () => {
    expect(ZENDESK_SUBDOMAIN).toBe("pimsyemr");
    expect(ZENDESK_ORIGIN).toBe("https://pimsyemr.zendesk.com");
    expect(zendeskAgentSearchUrl()).toBe("https://pimsyemr.zendesk.com/agent/search/1");
  });

  it("encodes org name and email domain into agent search", () => {
    const url = zendeskOrgSetupSearchUrl({
      orgName: "CEDAR Health",
      emailDomains: ["cedarhealth.example"],
    });
    expect(url.startsWith("https://pimsyemr.zendesk.com/agent/search/1?q=")).toBe(true);
    const q = decodeURIComponent(url.split("q=")[1] ?? "");
    expect(q).toContain('type:organization "CEDAR Health"');
    expect(q).toContain("domain:cedarhealth.example");
  });

  it("searches users by practice email and skips staff domains", () => {
    const emails = practiceContactEmails(
      ["jane@clinic.example", "alexander@pimsyehr.com", "jane@clinic.example"],
      ["pimsyehr.com"],
    );
    expect(emails).toEqual(["jane@clinic.example"]);
    expect(practiceEmailDomains(emails)).toEqual(["clinic.example"]);
    expect(isPimsyStaffEmail("kori@pimsyehr.com")).toBe(true);

    const url = zendeskUserEmailSearchUrl({ emails });
    expect(decodeURIComponent(url.split("q=")[1] ?? "")).toBe("email:jane@clinic.example");
  });

  it("does not invent Zendesk credentials or private API hosts", () => {
    const links = zendeskSetupLinks({
      orgName: "Triangle Health Services",
      emails: ["front@ths.example"],
    });
    expect(links.hasOrgQuery).toBe(true);
    expect(links.hasEmailQuery).toBe(true);
    expect(JSON.stringify(links)).not.toMatch(/token|password|api_key|ZENDESK_API/i);
    expect(links.orgSetupUrl).toContain("pimsyemr.zendesk.com");
    expect(links.userEmailUrl).toContain("pimsyemr.zendesk.com");
  });
});
