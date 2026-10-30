import { describe, expect, it } from "vitest";
import { parseNewTeamMember, preserveExistingStaff } from "@/lib/team-member";

describe("add team member", () => {
  it("accepts a specialist with lead on", () => {
    const parsed = parseNewTeamMember({
      name: "  Sam   Balaz ",
      email: "Sam.Balaz@PimsyEHR.com",
      role: "SPECIALIST",
      canLead: true,
      capacityExempt: false,
      isDirector: false,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toMatchObject({
      name: "Sam Balaz",
      email: "sam.balaz@pimsyehr.com",
      role: "SPECIALIST",
      title: "Implementation Specialist",
      canLead: true,
    });
  });

  it("rejects a customer role and a bad email", () => {
    expect(
      parseNewTeamMember({
        name: "Sam Balaz",
        email: "sam@pimsyehr.com",
        role: "CUSTOMER",
        canLead: true,
        capacityExempt: false,
        isDirector: false,
      }).ok,
    ).toBe(false);
    expect(
      parseNewTeamMember({
        name: "Sam",
        email: "not-an-email",
        role: "SPECIALIST",
        canLead: true,
        capacityExempt: false,
        isDirector: false,
      }).ok,
    ).toBe(false);
  });

  it("skips people added in PATH and keeps flags on everyone already here", () => {
    const incoming = {
      name: "Morgan Davis",
      canLead: false,
      capacityExempt: true,
      isDirector: false,
      hours: 23,
    };
    expect(preserveExistingStaff(incoming, null)).toEqual(incoming);
    expect(preserveExistingStaff(incoming, { pathManaged: true })).toBe("skip");
    expect(preserveExistingStaff(incoming, { pathManaged: false })).toEqual({
      name: "Morgan Davis",
      hours: 23,
    });
  });
});