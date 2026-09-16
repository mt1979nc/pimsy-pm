import { describe, expect, it } from "vitest";
import {
  customerContactCards,
  customFieldsAsLines,
  extraCustomFields,
  implementationTeamCards,
  isKickoffPhaseName,
  isReservedCustomFieldKey,
  parseCustomFieldLines,
  portalAboutHasContent,
  portalCustomerContactCards,
  portalKickoffItems,
  toPortalAbout,
  type KickoffSnapshot,
} from "@/lib/about-profile";

const kickoff: KickoffSnapshot = {
  phaseName: "Kickoff",
  phaseVisibility: "SHARED",
  items: [
    { id: "1", title: "Dock Overview & Threads", status: "TODO", dueDate: null, visibility: "SHARED" },
    { id: "2", title: "Zendesk Company Setup", status: "DONE", dueDate: null, visibility: "INTERNAL" },
  ],
};

describe("custom fields", () => {
  it("drops reserved keys that duplicate first-class About columns", () => {
    expect(isReservedCustomFieldKey("HubSpot Deal URL")).toBe(true);
    expect(isReservedCustomFieldKey("crm_key")).toBe(true);
    expect(isReservedCustomFieldKey("zoomBookingUrl")).toBe(true);
    expect(isReservedCustomFieldKey("timezone")).toBe(false);
    const parsed = parseCustomFieldLines(
      "hubspot=https://app.hubspot.com/x\ntimezone=America/Chicago\ncrmKey=secret\npreferredContact=Jane\nempty=\n",
    );
    expect(parsed).toEqual({ timezone: "America/Chicago", preferredContact: "Jane" });
    expect(extraCustomFields({ HubSpot: "x", timezone: "America/Chicago", notes: "nope" })).toEqual([
      { key: "timezone", value: "America/Chicago" },
    ]);
    expect(customFieldsAsLines({ timezone: "America/Chicago", hubspot: "x" })).toBe(
      "timezone=America/Chicago",
    );
  });
});

describe("kickoff phase matching", () => {
  it("recognizes Kickoff and RCM Kickoff", () => {
    expect(isKickoffPhaseName("Kickoff")).toBe(true);
    expect(isKickoffPhaseName("RCM Kickoff")).toBe(true);
    expect(isKickoffPhaseName("Discovery")).toBe(false);
  });

  it("hides INTERNAL kickoff rows from the portal snapshot", () => {
    expect(portalKickoffItems(kickoff.items).map((i) => i.title)).toEqual(["Dock Overview & Threads"]);
  });
});

describe("contact cards", () => {
  it("builds the impl team from playbook staffing roles and kickoff assignees", () => {
    const cards = implementationTeamCards([
      {
        id: "lead",
        name: "Sam Specialist",
        email: "sam@pimsyehr.com",
        memberRole: "LEAD",
        userRole: "SPECIALIST",
      },
      {
        id: "t1",
        name: "Anna Billing",
        email: "anna@pimsyehr.com",
        memberRole: "T1_BILLING_SUPPORT",
        staffingRole: "T1_BILLING_SUPPORT",
        userRole: "MEMBER",
      },
      {
        id: "t1",
        name: "Anna Billing",
        email: "anna@pimsyehr.com",
        memberRole: "CONTRIBUTOR",
        userRole: "MEMBER",
      },
      {
        id: "cust",
        name: "Avery",
        email: "avery@practice.example.com",
        userRole: "CUSTOMER",
        memberRole: "CUSTOMER_CONTACT",
      },
    ]);
    expect(cards.map((c) => c.id)).toEqual(["lead", "t1"]);
    expect(cards[0]?.roleLabel).toBe("Lead");
    expect(cards[1]?.roleLabel).toBe("T1 Billing Support");
  });

  it("syncs customer cards from the live user row", () => {
    const before = customerContactCards([
      {
        id: "c1",
        name: "Avery Acme",
        email: "avery@acme.example.com",
        title: "Admin",
        phone: null,
        userRole: "CUSTOMER",
        onProject: true,
        isActive: true,
      },
    ]);
    expect(before[0]?.name).toBe("Avery Acme");
    const after = customerContactCards([
      {
        id: "c1",
        name: "Avery Updated",
        email: "avery@acme.example.com",
        title: "Office manager",
        phone: "555-0100",
        userRole: "CUSTOMER",
        onProject: true,
        isActive: true,
      },
    ]);
    expect(after[0]?.name).toBe("Avery Updated");
    expect(after[0]?.title).toBe("Office manager");
    expect(after[0]?.phone).toBe("555-0100");
  });

  it("keeps revoked and account-only contacts off the portal cards", () => {
    const portal = portalCustomerContactCards([
      {
        id: "on",
        name: "On project",
        email: "on@acme.example.com",
        userRole: "CUSTOMER",
        onProject: true,
        isActive: true,
      },
      {
        id: "off",
        name: "Account only",
        email: "off@acme.example.com",
        userRole: "CUSTOMER",
        onProject: false,
        isActive: true,
      },
      {
        id: "revoked",
        name: "Revoked",
        email: "revoked@acme.example.com",
        userRole: "CUSTOMER",
        onProject: true,
        isActive: false,
      },
    ]);
    expect(portal.map((c) => c.id)).toEqual(["on"]);
  });
});

describe("portal About payload", () => {
  it("omits HubSpot / CRM key / extras and INTERNAL kickoff rows", () => {
    const payload = toPortalAbout({
      projectName: "Acme implementation",
      customerName: "Acme Behavioral",
      crmAcronym: "ACME",
      kickoffDate: "2026-09-15T12:00:00.000Z",
      goLiveDate: "2026-11-19T12:00:00.000Z",
      zoomBookingUrl: "https://book.example.com/kickoff",
      aboutNotes: "Welcome to PATH.",
      kickoff,
      implementationTeam: [
        {
          id: "lead",
          name: "Sam",
          email: "sam@pimsyehr.com",
          title: "Implementation Specialist",
          phone: null,
          image: null,
          roleLabel: "Lead",
          kind: "implementation",
          isActive: true,
          onProject: true,
        },
      ],
      customerContacts: [
        {
          id: "c1",
          name: "Avery",
          email: "avery@acme.example.com",
          userRole: "CUSTOMER",
          onProject: true,
          isActive: true,
        },
      ],
    });
    expect(payload.crmAcronym).toBe("ACME");
    expect(payload.kickoff.items.map((i) => i.title)).toEqual(["Dock Overview & Threads"]);
    expect(payload.implementationTeam).toHaveLength(1);
    expect(payload.customerContacts).toHaveLength(1);
    expect(JSON.stringify(payload)).not.toMatch(/hubspot|crmKey|prismClient/i);
    expect(portalAboutHasContent(payload)).toBe(true);
  });

  it("hides kickoff items when the Kickoff tab is still INTERNAL", () => {
    const payload = toPortalAbout({
      projectName: "Hidden kickoff",
      customerName: null,
      crmAcronym: null,
      kickoffDate: null,
      goLiveDate: null,
      zoomBookingUrl: null,
      aboutNotes: null,
      kickoff: { ...kickoff, phaseVisibility: "INTERNAL" },
      implementationTeam: [],
      customerContacts: [],
    });
    expect(payload.kickoff.items).toEqual([]);
    expect(portalAboutHasContent(payload)).toBe(false);
  });
});
