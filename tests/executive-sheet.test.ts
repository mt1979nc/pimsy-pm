import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  EMPTY_EXECUTIVE_STORED,
  dedupeExecutiveSheetRows,
  executiveUpdateValues,
  isOnExecutiveBook,
  mapSheetCeoStatus,
  parseExecutiveSheetCsv,
  parseSheetDate,
  pickExecutiveProject,
  planExecutiveSheetUpdate,
  type ExecutiveMatchCandidate,
  type ExecutiveSheetRow,
  type ExecutiveStored,
} from "@/lib/executive-sheet";

const KNOWN_ACRONYMS = [
  "APS",
  "BDMH",
  "BHC",
  "CAPSTONE",
  "CCCCARE",
  "CEDAR",
  "DYM",
  "EBHKY",
  "EHW",
  "FBH",
  "FFCS",
  "GHW",
  "LBH",
  "LECHRIS",
  "LIFECONN",
  "MHC",
  "MMHSS",
  "OCE",
  "PHR",
  "PWMI",
  "RBH",
  "RENWICK",
  "RMC",
  "ROH",
  "RPI",
  "SENSORI",
  "SMSS",
  "SWMCCC",
  "TANC",
  "THS",
] as const;

function candidate(partial: Partial<ExecutiveMatchCandidate> & Pick<ExecutiveMatchCandidate, "code">): ExecutiveMatchCandidate {
  return {
    id: partial.id ?? partial.code,
    name: partial.name ?? partial.code,
    customerName: partial.customerName ?? null,
    crmAcronym: partial.crmAcronym ?? null,
    prismClientId: partial.prismClientId ?? null,
    type: partial.type ?? "IMPLEMENTATION",
    status: partial.status ?? "IN_PROGRESS",
    archivedAt: partial.archivedAt ?? null,
    prismStatus: partial.prismStatus ?? "active",
    excludeFromAnalytics: partial.excludeFromAnalytics ?? false,
    customerExcluded: partial.customerExcluded ?? false,
    stored: partial.stored ?? EMPTY_EXECUTIVE_STORED,
    ...partial,
  };
}

describe("executive sheet sync", () => {
  it("maps sheet status labels and leaves anything else unchanged", () => {
    expect(mapSheetCeoStatus("Live")).toEqual({ kind: "status", status: "LIVE" });
    expect(mapSheetCeoStatus("Paused")).toEqual({ kind: "status", status: "PAUSED" });
    expect(mapSheetCeoStatus("In Process - On track")).toEqual({
      kind: "status",
      status: "IN_PROCESS_ON_TRACK",
    });
    expect(mapSheetCeoStatus("In Process - Off track")).toEqual({
      kind: "status",
      status: "IN_PROCESS_OFF_TRACK",
    });
    expect(mapSheetCeoStatus("  ")).toEqual({ kind: "empty" });
    expect(mapSheetCeoStatus("Going great")).toEqual({ kind: "unknown", raw: "Going great" });
  });

  it("parses ISO dates and the doubled-slash go-live, and rejects TBD", () => {
    const iso = parseSheetDate("2026-04-24");
    expect(iso).toMatchObject({ kind: "date", iso: "2026-04-24" });
    if (iso.kind === "date") expect(iso.date.toISOString()).toBe("2026-04-24T12:00:00.000Z");

    const normalized = parseSheetDate("11/2//2026");
    expect(normalized).toMatchObject({ kind: "date", iso: "2026-11-02", normalizedFrom: "11/2//2026" });
    if (normalized.kind === "date") expect(normalized.date.toISOString()).toBe("2026-11-02T12:00:00.000Z");

    expect(parseSheetDate("")).toEqual({ kind: "empty" });
    expect(parseSheetDate("TBD")).toMatchObject({ kind: "invalid", raw: "TBD" });
    expect(parseSheetDate("2026-02-31")).toMatchObject({ kind: "invalid" });
    expect(parseSheetDate("07/28/2026")).toMatchObject({ kind: "invalid" });
  });

  it("does not clear PATH when the sheet cell is empty or invalid", () => {
    const row: ExecutiveSheetRow = {
      rowNumber: 2,
      name: "Elevate",
      abbreviation: "EHW",
      contractDateRaw: "",
      expectedArrRaw: "",
      initialGoLiveRaw: "",
      currentGoLiveRaw: "TBD",
      actualGoLiveRaw: "",
      statusRaw: "Mystery",
      commentsRaw: "   ",
    };
    const stored: ExecutiveStored = {
      ...EMPTY_EXECUTIVE_STORED,
      contractDate: new Date("2026-01-15T12:00:00.000Z"),
      expectedArr: "50000.00",
      targetGoLiveDate: new Date("2026-06-01T12:00:00.000Z"),
      ceoStatus: "LIVE",
      ceoComments: "Keep this note",
    };
    const plan = planExecutiveSheetUpdate(row, stored);
    expect(plan.find((item) => item.field === "contractDate")).toMatchObject({ action: "skip-empty" });
    expect(plan.find((item) => item.field === "expectedArr")).toMatchObject({ action: "skip-empty" });
    expect(plan.find((item) => item.field === "targetGoLiveDate")).toMatchObject({
      action: "skip-invalid",
      raw: "TBD",
    });
    expect(plan.find((item) => item.field === "ceoStatus")).toMatchObject({ action: "skip-invalid" });
    expect(plan.find((item) => item.field === "ceoComments")).toMatchObject({ action: "skip-empty" });
    expect(executiveUpdateValues(plan)).toBeNull();
  });

  it("writes a non-empty comment and leaves an equal value unchanged", () => {
    const row: ExecutiveSheetRow = {
      rowNumber: 3,
      name: "Capstone",
      abbreviation: "CAPSTONE",
      contractDateRaw: "2026-04-24",
      expectedArrRaw: "32400",
      initialGoLiveRaw: "2026-07-13",
      currentGoLiveRaw: "2026-07-28",
      actualGoLiveRaw: "2026-07-28",
      statusRaw: "Live",
      commentsRaw: "Support Handoff",
    };
    const plan = planExecutiveSheetUpdate(row, EMPTY_EXECUTIVE_STORED);
    expect(plan.find((item) => item.field === "ceoComments")).toMatchObject({
      action: "update",
      to: "Support Handoff",
    });
    expect(plan.find((item) => item.field === "ceoStatus")).toMatchObject({ action: "update", to: "LIVE" });
    const values = executiveUpdateValues(plan);
    expect(values?.ceoComments).toBe("Support Handoff");
    expect(values?.contractDate?.toISOString()).toBe("2026-04-24T12:00:00.000Z");
    expect(values?.expectedArr).toBe("32400.00");
    expect(values).not.toHaveProperty("leadId");

    const again = planExecutiveSheetUpdate(row, {
      ...EMPTY_EXECUTIVE_STORED,
      contractDate: values!.contractDate!,
      expectedArr: "32400.00",
      initialGoLiveDate: values!.initialGoLiveDate!,
      targetGoLiveDate: values!.targetGoLiveDate!,
      actualGoLiveDate: values!.actualGoLiveDate!,
      ceoStatus: "LIVE",
      ceoComments: "Support Handoff",
    });
    expect(again.every((item) => item.action === "unchanged")).toBe(true);
    expect(executiveUpdateValues(again)).toBeNull();
  });

  it("prefers the executive-book project and skips a tie", () => {
    const book = candidate({ code: "IMP-1", crmAcronym: "CEDAR", name: "CEDAR Health" });
    const archived = candidate({
      code: "IMP-OLD",
      crmAcronym: "CEDAR",
      archivedAt: new Date("2026-01-01T00:00:00.000Z"),
      status: "COMPLETED",
    });
    const picked = pickExecutiveProject("cedar", [archived, book]);
    expect(picked.kind).toBe("match");
    if (picked.kind === "match") {
      expect(picked.project.code).toBe("IMP-1");
      expect(picked.tier).toBe("executive-book");
      expect(picked.alternates.map((item) => item.code)).toEqual(["IMP-OLD"]);
    }

    const otherBook = candidate({ code: "IMP-2", crmAcronym: "CEDAR" });
    const tied = pickExecutiveProject("CEDAR", [book, otherBook]);
    expect(tied).toMatchObject({ kind: "ambiguous", tier: "executive-book" });

    const byCode = candidate({ code: "APS", crmAcronym: null });
    const byCrm = candidate({ code: "IMP-9", crmAcronym: "APS" });
    const preferred = pickExecutiveProject("APS", [byCode, byCrm]);
    expect(preferred.kind).toBe("match");
    if (preferred.kind === "match") expect(preferred.project.code).toBe("IMP-9");

    const pipeline = candidate({ code: "IMP-P", crmAcronym: "DYM", prismStatus: "pipeline" });
    expect(isOnExecutiveBook(pipeline)).toBe(false);
    const offBook = pickExecutiveProject("DYM", [pipeline]);
    expect(offBook.kind).toBe("match");
    if (offBook.kind === "match") expect(offBook.tier).toBe("implementation");

    const cancelled = candidate({ code: "IMP-X", crmAcronym: "OLD", status: "CANCELLED" });
    expect(pickExecutiveProject("OLD", [cancelled]).kind).toBe("ineligible");
    expect(pickExecutiveProject("MISSING", [book]).kind).toBe("unmatched");
  });

  it("reads the cleaned 30-row sheet without inventing acronyms", () => {
    const text = readFileSync(resolve(process.cwd(), "data/executive-contract-dates.csv"), "utf8");
    const rows = parseExecutiveSheetCsv(text);
    expect(dedupeExecutiveSheetRows(rows).duplicates).toEqual([]);
    expect(rows.map((row) => row.abbreviation).sort()).toEqual([...KNOWN_ACRONYMS].sort());

    const lechris = rows.find((row) => row.abbreviation === "LECHRIS")!;
    const lechrisPlan = planExecutiveSheetUpdate(lechris, EMPTY_EXECUTIVE_STORED);
    expect(lechrisPlan.find((item) => item.field === "targetGoLiveDate")).toMatchObject({
      action: "update",
      to: "2026-11-02",
      note: "normalized 11/2//2026",
    });

    const rmc = rows.find((row) => row.abbreviation === "RMC")!;
    const rmcPlan = planExecutiveSheetUpdate(rmc, EMPTY_EXECUTIVE_STORED);
    expect(rmcPlan.find((item) => item.field === "targetGoLiveDate")).toMatchObject({
      action: "skip-invalid",
      raw: "TBD",
    });
    expect(rmcPlan.find((item) => item.field === "actualGoLiveDate")).toMatchObject({
      action: "skip-invalid",
      raw: "TBD",
    });
    expect(rmcPlan.find((item) => item.field === "ceoStatus")).toMatchObject({ action: "update", to: "PAUSED" });

    for (const abbreviation of ["EHW", "PHR", "APS", "EBHKY"]) {
      const row = rows.find((item) => item.abbreviation === abbreviation)!;
      expect(planExecutiveSheetUpdate(row, EMPTY_EXECUTIVE_STORED).find((item) => item.field === "contractDate")).toMatchObject({
        action: "skip-empty",
      });
    }

    const capstone = rows.find((row) => row.abbreviation === "CAPSTONE")!;
    const capstonePlan = planExecutiveSheetUpdate(capstone, EMPTY_EXECUTIVE_STORED);
    expect(capstonePlan.find((item) => item.field === "ceoComments")?.action).toBe("update");
    expect(planExecutiveSheetUpdate(rows.find((row) => row.abbreviation === "SMSS")!, EMPTY_EXECUTIVE_STORED).find(
      (item) => item.field === "ceoComments",
    )).toMatchObject({ action: "skip-empty" });

    const quoted = parseExecutiveSheetCsv(
      'Name,Abbreviation,Product,Contract Date,Expected ARR,Initial Go Live Target,Current Go Live Target,Actual Go Live,Assigned IS,Status,Comments,Link to Dock\n' +
        'Rae,"ROH",EHR,2026-04-21,5760,2026-06-01,2026-06-22,2026-06-22,"Danielle  Piper",Live,"Said ""live"" today",https://example.test\n',
    );
    expect(quoted[0]?.commentsRaw).toBe('Said "live" today');
    expect(quoted[0]?.abbreviation).toBe("ROH");
  });
});
