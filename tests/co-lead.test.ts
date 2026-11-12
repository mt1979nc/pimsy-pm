import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  coLeadChoiceError,
  effectiveCanLead,
  ownerFieldsFromForm,
  ownerSelectState,
  visibleLeadOptions,
} from "@/lib/co-lead";
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

  it("persists a co-lead from Roster edit and re-renders that person instead of None", () => {
    const everwood = { leadId: "jeremy", coLeadId: null, ownerSplitPercent: 80 };
    const posted = ownerFieldsFromForm({
      leadId: "jeremy",
      coLeadId: "alex",
      ownerSplitPercent: "80",
    });
    expect(posted).toEqual({
      fields: { leadId: "jeremy", coLeadId: "alex", ownerSplitPercent: 80 },
    });
    if (!("fields" in posted)) return;

    const people = [
      { id: "jeremy", name: "Jeremy Reals", canLead: true },
      { id: "alex", name: "Alexander", canLead: true },
      { id: "member", name: "Member", canLead: false },
    ];
    const options = visibleLeadOptions(people, [posted.fields.leadId, posted.fields.coLeadId].filter((id) => id != null));
    expect(options.map((person) => person.id)).toEqual(["jeremy", "alex"]);

    const before = ownerSelectState(everwood, ["jeremy"]);
    const after = ownerSelectState(posted.fields, options.map((person) => person.id));
    expect(before.coLeadId).toBe("");
    expect(after.coLeadId).toBe("alex");
    expect(after.key).not.toBe(before.key);

    const kept = visibleLeadOptions(
      [{ id: "alex", name: "Alexander", canLead: false }],
      [posted.fields.coLeadId].filter((id) => id != null),
    );
    expect(ownerSelectState(posted.fields, kept.map((person) => person.id)).coLeadId).toBe("alex");
    expect(ownerSelectState(posted.fields, ["jeremy"]).coLeadId).toBe("");

    const form = readFileSync(
      resolve(process.cwd(), "src/app/(app)/management/_components/engagement-edit-form.tsx"),
      "utf8",
    );
    const action = readFileSync(resolve(process.cwd(), "src/actions/management-engagements.ts"), "utf8");
    expect(form).toMatch(/name="coLeadId"/);
    expect(form).toMatch(/key=\{owners\.key\}/);
    expect(form).toMatch(/defaultValue=\{owners\.coLeadId\}/);
    expect(action).toMatch(/ownerFieldsFromForm/);
    expect(action).toMatch(/coLeadId,/);
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
