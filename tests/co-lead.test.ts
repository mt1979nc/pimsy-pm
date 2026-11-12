import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PERCENT_TOTAL_ERROR,
  allocateOwnerHours,
  backfillOwnerShares,
  coLeadChoiceError,
  effectiveCanLead,
  ownerFieldsFromForm,
  ownerSelectState,
  prismPercentWrite,
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
    const everwood = {
      leadId: "jeremy",
      coLeadId: null,
      thirdSpecialistId: null,
      leadSplitPercent: 100,
      coLeadSplitPercent: 0,
      thirdSplitPercent: 0,
    };
    const posted = ownerFieldsFromForm({
      leadId: "jeremy",
      coLeadId: "alex",
      thirdSpecialistId: "",
      leadSplitPercent: "80",
      coLeadSplitPercent: "20",
      thirdSplitPercent: "",
    });
    expect(posted).toMatchObject({
      fields: { leadId: "jeremy", coLeadId: "alex", thirdSpecialistId: null, leadSplitPercent: 80, coLeadSplitPercent: 20 },
    });
    if (!("fields" in posted)) return;

    const people = [
      { id: "jeremy", name: "Jeremy Reals", canLead: true },
      { id: "alex", name: "Alexander", canLead: true },
      { id: "member", name: "Member", canLead: false },
    ];
    const options = visibleLeadOptions(
      people,
      [posted.fields.leadId, posted.fields.coLeadId, posted.fields.thirdSpecialistId].filter((id) => id != null),
    );
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

    const fields = readFileSync(
      resolve(process.cwd(), "src/app/(app)/management/_components/engagement-owners-fields.tsx"),
      "utf8",
    );
    const form = readFileSync(
      resolve(process.cwd(), "src/app/(app)/management/_components/engagement-edit-form.tsx"),
      "utf8",
    );
    expect(fields).toMatch(/name="coLeadId"/);
    expect(fields).toMatch(/name="thirdSpecialistId"/);
    expect(form).toMatch(/remountKey=\{owners\.key\}/);
    expect(form).toMatch(/ownerFormError/);
  });

  it("requires assigned percents to total 100 and refuses the same person twice", () => {
    expect(
      ownerFieldsFromForm({
        leadId: "jeremy",
        coLeadId: "alex",
        thirdSpecialistId: "morgan",
        leadSplitPercent: "50",
        coLeadSplitPercent: "30",
        thirdSplitPercent: "20",
      }),
    ).toMatchObject({
      fields: { leadSplitPercent: 50, coLeadSplitPercent: 30, thirdSplitPercent: 20, thirdSpecialistId: "morgan" },
    });
    expect(
      ownerFieldsFromForm({
        leadId: "jeremy",
        coLeadId: "alex",
        thirdSpecialistId: "",
        leadSplitPercent: "50",
        coLeadSplitPercent: "30",
        thirdSplitPercent: "",
      }),
    ).toEqual({ error: PERCENT_TOTAL_ERROR });
    const duplicate = ownerFieldsFromForm({
      leadId: "jeremy",
      coLeadId: "jeremy",
      thirdSpecialistId: "",
      leadSplitPercent: "60",
      coLeadSplitPercent: "40",
      thirdSplitPercent: "",
    });
    expect("error" in duplicate && duplicate.error).toMatch(/once/);
    expect(
      ownerFieldsFromForm({
        leadId: "jeremy",
        coLeadId: "",
        thirdSpecialistId: "",
        leadSplitPercent: "80",
        coLeadSplitPercent: "",
        thirdSplitPercent: "",
      }),
    ).toEqual({ error: PERCENT_TOTAL_ERROR });
  });

  it("backfills lead and co-lead percents and leaves the 3rd specialist empty", () => {
    expect(backfillOwnerShares({ coLeadId: "alex", ownerSplitPercent: 80 })).toEqual({
      leadSplitPercent: 80,
      coLeadSplitPercent: 20,
      thirdSplitPercent: 0,
      thirdSpecialistId: null,
    });
    expect(backfillOwnerShares({ coLeadId: null, ownerSplitPercent: 80 })).toEqual({
      leadSplitPercent: 100,
      coLeadSplitPercent: 0,
      thirdSplitPercent: 0,
      thirdSpecialistId: null,
    });
    const sql = readFileSync(resolve(process.cwd(), "drizzle/0037_third_specialist.sql"), "utf8");
    expect(sql).toMatch(/third_specialist_id/);
    expect(sql).toMatch(/WHEN "co_lead_id" IS NOT NULL THEN "owner_split_percent" ELSE 100/);
    expect(sql).toMatch(/100 - "owner_split_percent"/);
    expect(prismPercentWrite(true, 60, "alex")).toEqual({});
    expect(prismPercentWrite(false, 60, "alex")).toMatchObject({
      leadSplitPercent: 60,
      coLeadSplitPercent: 40,
      thirdSplitPercent: 0,
      thirdSpecialistId: null,
    });
  });

  it("counts the 3rd specialist's share of the weekly hours", () => {
    expect(
      allocateOwnerHours(10, {
        leadId: "jeremy",
        coLeadId: "alex",
        thirdSpecialistId: "morgan",
        leadSplitPercent: 50,
        coLeadSplitPercent: 30,
        thirdSplitPercent: 20,
      }),
    ).toEqual({ lead: 5, coLead: 3, third: 2 });
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
