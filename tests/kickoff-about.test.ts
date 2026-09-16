import { describe, expect, it } from "vitest";
import {
  hasKickoffAboutContent,
  kickoffFacts,
  portalSafeCustomFacts,
} from "@/lib/kickoff-about";

function d(iso: string) {
  return new Date(`${iso}T12:00:00.000Z`);
}

describe("kickoff About facts", () => {
  it("surfaces existing non-HubSpot kickoff fields and skips empty ones", () => {
    const facts = kickoffFacts(
      {
        startDate: d("2026-09-15"),
        targetGoLiveDate: d("2026-11-19"),
        zoomBookingUrl: "https://zoom.us/book/kickoff",
        crmAcronym: "CEDAR",
        leadName: "Alexander Morse",
        leadTitle: "Implementation Specialist",
        aboutNotes: "Import confirmed.",
      },
      "portal",
    );
    expect(facts.map((f) => f.key)).toEqual(["acronym", "kickoff", "golive", "specialist", "booking"]);
    expect(facts.find((f) => f.key === "booking")?.href).toMatch(/^https:\/\/zoom\.us\//);
    expect(facts.every((f) => !/hubspot/i.test(f.label) && !/hubspot/i.test(f.value))).toBe(true);
  });

  it("shows portal-safe custom fields and kickoff recordings; hides HubSpot-ish keys", () => {
    const custom = portalSafeCustomFacts({
      timezone: "America/Chicago",
      preferredContact: "Jane Doe",
      meetingLink: "https://zoom.us/j/123",
      hubspotDealUrl: "https://app.hubspot.com/contacts/1",
      crmKey: "secret",
      prismClientId: "abc",
    });
    expect(custom.map((f) => f.label).sort()).toEqual([
      "Kickoff meeting link",
      "Preferred contact",
      "Timezone",
    ]);
    expect(custom.find((f) => f.label === "Kickoff meeting link")?.href).toMatch(/^https:\/\/zoom\.us\//);

    const facts = kickoffFacts(
      {
        recordings: [
          { name: "Kickoff recording", url: "https://zoom.us/rec/kickoff", visibility: "SHARED" },
          { name: "Internal kickoff notes", url: "https://zoom.us/rec/internal", visibility: "INTERNAL" },
          { name: "Training 1", url: "https://zoom.us/rec/t1", visibility: "SHARED" },
        ],
      },
      "portal",
    );
    expect(facts.map((f) => f.label)).toEqual(["Kickoff recording"]);

    const staff = kickoffFacts(
      {
        recordings: [
          { name: "Kickoff recording", url: "https://zoom.us/rec/kickoff", visibility: "INTERNAL" },
        ],
      },
      "staff",
    );
    expect(staff.map((f) => f.label)).toEqual(["Kickoff recording"]);
  });

  it("treats notes or any kickoff fact as About content", () => {
    expect(hasKickoffAboutContent({}, "portal")).toBe(false);
    expect(hasKickoffAboutContent({ aboutNotes: "  " }, "portal")).toBe(false);
    expect(hasKickoffAboutContent({ aboutNotes: "Hello" }, "portal")).toBe(true);
    expect(hasKickoffAboutContent({ startDate: d("2026-09-15") }, "portal")).toBe(true);
    expect(hasKickoffAboutContent({ zoomBookingUrl: "javascript:alert(1)" }, "portal")).toBe(false);
  });
});
