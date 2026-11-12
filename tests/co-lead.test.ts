import { describe, expect, it } from "vitest";

import { coLeadChoiceError, effectiveCanLead } from "@/lib/co-lead";
import { isArchivedRequestPath } from "@/lib/archived-modules";

const specialist = { role: "SPECIALIST", isActive: true, canLead: true };

describe("co-lead choice", () => {
  it("uses the Settings flag when a path-config row exists", () => {
    expect(effectiveCanLead("u1", false, [{ userId: "u1", canLead: true }])).toBe(true);
    expect(effectiveCanLead("u1", true, [{ userId: "u1", canLead: false }])).toBe(false);
    expect(effectiveCanLead("u2", true, [])).toBe(true);
  });

  it("rejects the lead, an inactive person, a customer, and someone who cannot lead", () => {
    expect(
      coLeadChoiceError({ leadId: "lead", coLeadId: "lead", coLead: specialist }),
    ).toMatch(/different person/);
    expect(
      coLeadChoiceError({
        leadId: "lead",
        coLeadId: "co",
        coLead: { ...specialist, isActive: false },
      }),
    ).toMatch(/inactive/);
    expect(
      coLeadChoiceError({
        leadId: "lead",
        coLeadId: "co",
        coLead: { ...specialist, role: "CUSTOMER" },
      }),
    ).toMatch(/teammate/);
    expect(
      coLeadChoiceError({
        leadId: "lead",
        coLeadId: "co",
        coLead: { ...specialist, canLead: false },
      }),
    ).toMatch(/Can lead/);
    expect(coLeadChoiceError({ leadId: "lead", coLeadId: null, coLead: null })).toBeNull();
    expect(coLeadChoiceError({ leadId: "lead", coLeadId: "co", coLead: specialist })).toBeNull();
  });

  it("keeps a co-lead who was already saved if Can lead was later turned off", () => {
    expect(
      coLeadChoiceError({
        leadId: "lead",
        coLeadId: "co",
        existingCoLeadId: "co",
        coLead: { ...specialist, canLead: false },
      }),
    ).toBeNull();
  });

  it("leaves the Prism profile page reachable and the project settings page archived", () => {
    expect(isArchivedRequestPath("/projects/site-1")).toBe(false);
    expect(isArchivedRequestPath("/projects/site-1/settings")).toBe(true);
    expect(isArchivedRequestPath("/management/engagements/site-1")).toBe(false);
    expect(isArchivedRequestPath("/customers")).toBe(true);
    expect(isArchivedRequestPath("/management/executive")).toBe(true);
    expect(isArchivedRequestPath("/management/weekly")).toBe(true);
  });
});
