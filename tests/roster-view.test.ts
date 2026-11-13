import { describe, expect, it } from "vitest";

import {
  nextRosterSort,
  parseRosterQuery,
  rosterQueryString,
  viewRosterRows,
  type RosterQuery,
  type RosterViewRow,
} from "@/lib/roster-view";

function row(partial: Partial<RosterViewRow> & Pick<RosterViewRow, "id">): RosterViewRow {
  return {
    acronym: partial.id,
    customerName: partial.id,
    name: partial.id,
    leadId: null,
    coLeadId: null,
    thirdSpecialistId: null,
    leadName: null,
    coLeadName: null,
    thirdSpecialistName: null,
    userCount: null,
    locationCount: null,
    complexityTier: null,
    displayHours: null,
    startDate: null,
    initialGoLiveDate: null,
    targetGoLiveDate: null,
    effectivePrismStatus: "active",
    slipDays: 0,
    ...partial,
  };
}

const base: RosterQuery = { q: "", owner: "", status: "all", sort: null, dir: "asc" };

describe("roster sort and filter", () => {
  const rows = [
    row({
      id: "blank",
      acronym: "BLANK",
      customerName: "Blank Health",
      userCount: null,
      startDate: null,
      slipDays: 0,
    }),
    row({
      id: "early",
      acronym: "EARLY",
      customerName: "Early Care",
      leadId: "jeremy",
      leadName: "Jeremy",
      userCount: 4,
      startDate: "2026-01-02",
      targetGoLiveDate: "2026-06-01",
      slipDays: 3,
      effectivePrismStatus: "active",
    }),
    row({
      id: "late",
      acronym: "LATE",
      customerName: "Late Care",
      coLeadId: "jeremy",
      coLeadName: "Jeremy",
      thirdSpecialistId: "morgan",
      userCount: 12,
      startDate: "2026-03-01",
      targetGoLiveDate: "2026-04-01",
      slipDays: 10,
      effectivePrismStatus: "pipeline",
    }),
  ];

  it("sorts dates and numbers with blanks last, and toggles direction", () => {
    const asc = viewRosterRows(rows, { ...base, sort: "kickoff", dir: "asc" });
    expect(asc.map((item) => item.id)).toEqual(["early", "late", "blank"]);
    const desc = viewRosterRows(rows, { ...base, sort: "users", dir: "desc" });
    expect(desc.map((item) => item.id)).toEqual(["late", "early", "blank"]);
    expect(nextRosterSort(base, "slips")).toMatchObject({ sort: "slips", dir: "asc" });
    expect(nextRosterSort({ ...base, sort: "slips", dir: "asc" }, "slips").dir).toBe("desc");
    const slips = viewRosterRows(rows, { ...base, sort: "slips", dir: "asc" });
    expect(slips.map((item) => item.id)).toEqual(["early", "late", "blank"]);
  });

  it("filters by name or acronym and by a person in any owner role", () => {
    expect(viewRosterRows(rows, { ...base, q: "late" }).map((item) => item.id)).toEqual(["late"]);
    expect(viewRosterRows(rows, { ...base, q: "early" }).map((item) => item.id)).toEqual(["early"]);
    expect(viewRosterRows(rows, { ...base, owner: "jeremy" }).map((item) => item.id).sort()).toEqual(["early", "late"]);
    expect(viewRosterRows(rows, { ...base, owner: "morgan", status: "pipeline" }).map((item) => item.id)).toEqual(["late"]);
  });

  it("keeps sort and filter in the query string", () => {
    const query = parseRosterQuery(new URLSearchParams("q=cedar&owner=jeremy&status=active&sort=goLive&dir=desc"));
    expect(query).toEqual({ q: "cedar", owner: "jeremy", status: "active", sort: "goLive", dir: "desc" });
    expect(rosterQueryString(query)).toBe("?q=cedar&owner=jeremy&status=active&sort=goLive&dir=desc");
    expect(parseRosterQuery(new URLSearchParams("sort=nope")).sort).toBeNull();
  });
});
