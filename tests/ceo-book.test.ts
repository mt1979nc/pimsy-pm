import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ceoStatusEnum } from "@/db/schema";
import {
  CEO_STATUSES,
  CEO_STATUS_LABELS,
  assignedImplementationSpecialists,
  ceoCommentText,
  ceoProductType,
  combineCeoProductTypes,
  compareCeoBookRows,
  expectedArrInputValue,
  formatAssignedIs,
  formatExpectedArr,
  nextCeoBookColumnSort,
  parseCeoComments,
  parseExpectedArr,
  sortCeoBookRows,
  summarizeCeoBook,
  type CeoBookColumnSortRow,
} from "@/lib/ceo-book";

describe("CEO executive book", () => {
  it("keeps the sheet status list on the ceo_status enum", () => {
    expect([...ceoStatusEnum.enumValues]).toEqual([...CEO_STATUSES]);
    expect(CEO_STATUS_LABELS.NOT_YET_STARTED).toBe("Not yet started");
    expect(CEO_STATUS_LABELS.PAUSED).toBe("Paused");
    expect(CEO_STATUS_LABELS.IN_PROCESS_ON_TRACK).toBe("In Process - On track");
    expect(CEO_STATUS_LABELS.IN_PROCESS_OFF_TRACK).toBe("In Process - Off track");
    expect(CEO_STATUS_LABELS.LIVE).toBe("Live");
  });

  it("derives product type from the playbook and the RCM track", () => {
    expect(ceoProductType({ playbookPath: "EHR", hasRcmTrack: false, ehrTaskCountTotal: 12 })).toBe("EHR");
    expect(ceoProductType({ playbookPath: null, hasRcmTrack: false })).toBe("EHR");
    expect(ceoProductType({ playbookPath: "EHR_RCM", hasRcmTrack: true, ehrTaskCountTotal: 4 })).toBe(
      "EHR+RCM",
    );
    expect(ceoProductType({ playbookPath: "EHR", hasRcmTrack: true, ehrTaskCountTotal: 8 })).toBe("EHR+RCM");
    expect(ceoProductType({ playbookPath: "RCM_PRISM", hasRcmTrack: true, ehrTaskCountTotal: 6 })).toBe(
      "EHR+RCM",
    );
    expect(ceoProductType({ playbookPath: "RCM_LEGACY", hasRcmTrack: true, ehrTaskCountTotal: 0 })).toBe("RCM");
    expect(ceoProductType({ playbookPath: "RCM_PRISM", hasRcmTrack: true, ehrTaskCountTotal: 0 })).toBe("RCM");
    // Add RCM rewrites the path to RCM_PRISM and stamps sourceProjectId. EHR stays.
    expect(
      ceoProductType({
        playbookPath: "RCM_PRISM",
        hasRcmTrack: true,
        ehrTaskCountTotal: 0,
        rcmAddedOntoSite: true,
      }),
    ).toBe("EHR+RCM");
    // EHR tasks added onto an RCM-only path.
    expect(ceoProductType({ playbookPath: "RCM_LEGACY", hasRcmTrack: true, ehrTaskCountTotal: 3 })).toBe(
      "EHR+RCM",
    );
    expect(ceoProductType({ playbookPath: "RCM_PRISM", hasRcmTrack: true, ehrTaskCountTotal: 1 })).toBe(
      "EHR+RCM",
    );
  });

  it("combines product types across a customer's projects", () => {
    expect(combineCeoProductTypes([])).toBeNull();
    expect(combineCeoProductTypes(["EHR", "EHR"])).toBe("EHR");
    expect(combineCeoProductTypes(["RCM"])).toBe("RCM");
    expect(combineCeoProductTypes(["EHR", "RCM"])).toBe("EHR+RCM");
    expect(combineCeoProductTypes(["EHR+RCM", "EHR"])).toBe("EHR+RCM");
  });

  it("wires Assigned IS from the project lead and IS-role members", () => {
    const names = assignedImplementationSpecialists({
      lead: { id: "lead", name: "Alex Morse", email: "alex@pimsyehr.com", role: "SPECIALIST" },
      members: [
        {
          role: "IMPLEMENTATION_SPECIALIST",
          user: { id: "lead", name: "Alex Morse", email: "alex@pimsyehr.com", role: "SPECIALIST" },
        },
        {
          role: "SPECIALIST",
          user: { id: "morgan", name: "Morgan Davis", email: "morgan@pimsyehr.com", role: "SPECIALIST" },
        },
        {
          role: "RCM_IMPLEMENTATION_SPECIALIST",
          user: { id: "mindy", name: "Mindy Douglas", email: "mindy@pimsyehr.com", role: "MEMBER" },
        },
        {
          role: "CUSTOMER_PROJECT_LEAD",
          user: { id: "cust", name: "Avery Acme", email: "avery@acme.example", role: "CUSTOMER" },
        },
        {
          role: "T1_BILLING_SUPPORT",
          user: { id: "bill", name: "Casey Billing", email: "casey@pimsyehr.com", role: "MEMBER" },
        },
      ],
    });
    expect(names).toEqual(["Alex Morse", "Morgan Davis"]);
    expect(formatAssignedIs(names)).toBe("Alex Morse, Morgan Davis");
    expect(formatAssignedIs([])).toBe("—");
  });

  it("formats a stored CEO comment and leaves a blank one empty", () => {
    expect(parseCeoComments(null)).toBeNull();
    expect(parseCeoComments("  ")).toBeNull();
    expect(parseCeoComments("  Go live pushed.\nStill on track.  ")).toBe("Go live pushed.\nStill on track.");
    expect(ceoCommentText(null)).toEqual({ preview: null, full: null });
    expect(ceoCommentText("   ")).toEqual({ preview: null, full: null });
    const text = ceoCommentText("08/14: Import is done.\nAsk @[Morgan](user:abc) about auths.");
    expect(text.full).toBe("08/14: Import is done. Ask @Morgan about auths.");
    expect(text.preview).toBe(text.full);
    const long = ceoCommentText("word ".repeat(80));
    expect(long.preview?.endsWith("…")).toBe(true);
    expect((long.preview ?? "").length).toBeLessThanOrEqual(160);
    expect((long.full ?? "").length).toBeGreaterThan(160);
  });

  it("parses expected ARR and leaves blanks empty", () => {
    expect(parseExpectedArr("")).toEqual({ ok: true, value: null });
    expect(parseExpectedArr("—")).toEqual({ ok: true, value: null });
    expect(parseExpectedArr("$32,400")).toEqual({ ok: true, value: "32400.00" });
    expect(parseExpectedArr("6973.46")).toEqual({ ok: true, value: "6973.46" });
    expect(parseExpectedArr("12.345").ok).toBe(false);
    expect(parseExpectedArr("nope").ok).toBe(false);
    expect(expectedArrInputValue("32400.00")).toBe("32400");
    expect(expectedArrInputValue("6973.46")).toBe("6973.46");
    expect(formatExpectedArr(null)).toBe("—");
    expect(formatExpectedArr("32400.00")).toBe("$32,400");
    expect(formatExpectedArr("6973.46")).toBe("$6,973.46");
  });

  it("sorts off track ahead of live and puts an empty go-live last in the group", () => {
    const rows = [
      { ceoStatus: "LIVE" as const, currentGoLiveSort: "2026-06-01", abbreviation: "CAPSTONE" },
      { ceoStatus: "IN_PROCESS_OFF_TRACK" as const, currentGoLiveSort: "2026-11-01", abbreviation: "SWMCCC" },
      { ceoStatus: "IN_PROCESS_ON_TRACK" as const, currentGoLiveSort: null, abbreviation: "BHC" },
      { ceoStatus: "IN_PROCESS_ON_TRACK" as const, currentGoLiveSort: "2026-10-01", abbreviation: "MMHSS" },
      { ceoStatus: null, currentGoLiveSort: "2026-09-01", abbreviation: "NEW" },
    ];
    const ordered = [...rows].sort(compareCeoBookRows).map((row) => row.abbreviation);
    expect(ordered).toEqual(["SWMCCC", "MMHSS", "BHC", "NEW", "CAPSTONE"]);
    expect(summarizeCeoBook(rows)).toContain("In Process - Off track 1");
    expect(summarizeCeoBook(rows)).toContain("Not set 1");
  });

  it("ships /management/executive from existing go-live columns plus the three gaps", () => {
    const page = readFileSync(resolve(process.cwd(), "src/app/(app)/management/executive/page.tsx"), "utf8");
    const table = readFileSync(
      resolve(process.cwd(), "src/app/(app)/management/_components/executive-book-table.tsx"),
      "utf8",
    );
    const query = readFileSync(resolve(process.cwd(), "src/lib/ceo-book-query.ts"), "utf8");
    const layout = readFileSync(resolve(process.cwd(), "src/app/(app)/management/layout.tsx"), "utf8");
    const nav = readFileSync(resolve(process.cwd(), "src/lib/area-nav.ts"), "utf8");
    const migration = readFileSync(resolve(process.cwd(), "drizzle/0026_ceo_executive.sql"), "utf8");
    const commentsMigration = readFileSync(resolve(process.cwd(), "drizzle/0028_ceo_comments.sql"), "utf8");
    const action = readFileSync(resolve(process.cwd(), "src/actions/management-executive.ts"), "utf8");
    const schema = readFileSync(resolve(process.cwd(), "src/db/schema.ts"), "utf8");

    expect(page).toMatch(/listCeoBook/);
    expect(page).toMatch(/\/management\/executive/);
    expect(page).not.toMatch(/from ["']@\/db["']/);
    expect(table).toMatch(/sortCeoBookRows/);
    expect(table).toMatch(/aria-sort/);
    expect(table).toMatch(/nextCeoBookColumnSort/);
    expect(table).toMatch(/Contract Date/);
    expect(table).toMatch(/Expected ARR/);
    expect(table).toMatch(/Initial Go Live Target/);
    expect(table).toMatch(/Current Go Live Target/);
    expect(table).toMatch(/Actual Go Live/);
    expect(table).toMatch(/Assigned IS/);
    expect(table).toMatch(/updateCeoBookFields/);
    expect(table).not.toMatch(/from ["']@\/db["']/);
    expect(table).not.toMatch(/ceo-book-query/);
    expect(table).not.toMatch(/dockUrl|dock_url/i);
    expect(query).toMatch(/initialGoLiveDate/);
    expect(query).toMatch(/targetGoLiveDate/);
    expect(query).toMatch(/actualGoLiveDate/);
    expect(query).toMatch(/projectHasRcmTrack/);
    expect(query).toMatch(/sourceProjectId/);
    expect(query).toMatch(/rcmAddedOntoSite/);
    expect(query).toMatch(/ceoComments/);
    expect(query).not.toMatch(/statusUpdates/);
    expect(query).toMatch(/crmAcronym/);
    expect(layout).toMatch(/PrismNav/);
    expect(nav).toMatch(/\/management\/executive/);
    expect(nav).toMatch(/Executive/);
    expect(migration).toMatch(/contract_date/);
    expect(migration).toMatch(/expected_arr/);
    expect(migration).toMatch(/ceo_status/);
    expect(migration).not.toMatch(/dock_url/);
    expect(migration).not.toMatch(/initial_go_live_target/);
    expect(migration).not.toMatch(/current_go_live/);
    expect(schema).toMatch(/contractDate/);
    expect(schema).toMatch(/expectedArr/);
    expect(schema).toMatch(/ceoStatus/);
    expect(schema).toMatch(/ceoComments/);
    expect(schema).not.toMatch(/dockUrl/);
    expect(commentsMigration).toMatch(/ceo_comments/);
    expect(action).toMatch(/parseCeoComments/);
    expect(action).toMatch(/ceoComments/);
    expect(table).toMatch(/name="ceoComments"/);
    expect(table).toMatch(/<textarea/);
    expect(table).toMatch(/QuietBlank label="No comment"/);
    expect(page).not.toMatch(/latest project update/);
    expect(page).toMatch(/comments are saved on the project/);
  });

  function bookRow(
    partial: Partial<CeoBookColumnSortRow> & Pick<CeoBookColumnSortRow, "abbreviation">,
  ): CeoBookColumnSortRow {
    return {
      name: partial.abbreviation,
      productType: "EHR",
      contractDateInput: "",
      expectedArrInput: "",
      initialGoLive: "—",
      currentGoLive: "—",
      actualGoLive: "—",
      assignedIs: "—",
      ceoStatus: null,
      commentPreview: null,
      commentFull: null,
      ...partial,
    };
  }

  it("keeps the CEO sheet order until a column is chosen, then toggles direction", () => {
    const rows = [bookRow({ abbreviation: "B" }), bookRow({ abbreviation: "A" })];
    expect(sortCeoBookRows(rows, null).map((row) => row.abbreviation)).toEqual(["B", "A"]);
    expect(nextCeoBookColumnSort(null, "name")).toEqual({ column: "name", direction: "asc" });
    expect(nextCeoBookColumnSort({ column: "name", direction: "asc" }, "name")).toEqual({
      column: "name",
      direction: "desc",
    });
    expect(nextCeoBookColumnSort({ column: "name", direction: "desc" }, "abbreviation")).toEqual({
      column: "abbreviation",
      direction: "asc",
    });
  });

  it("sorts names and puts an empty name last in both directions", () => {
    const rows = [
      bookRow({ abbreviation: "MID", name: "Cedar" }),
      bookRow({ abbreviation: "EMPTY", name: "—" }),
      bookRow({ abbreviation: "FIRST", name: "acme" }),
    ];
    expect(sortCeoBookRows(rows, { column: "name", direction: "asc" }).map((row) => row.abbreviation)).toEqual([
      "FIRST",
      "MID",
      "EMPTY",
    ]);
    expect(sortCeoBookRows(rows, { column: "name", direction: "desc" }).map((row) => row.abbreviation)).toEqual([
      "MID",
      "FIRST",
      "EMPTY",
    ]);
  });

  it("sorts go-live and contract dates chronologically, with — last", () => {
    const rows = [
      bookRow({
        abbreviation: "LATE",
        currentGoLive: "Jan 2, 2026",
        contractDateInput: "2026-03-01",
        initialGoLive: "—",
        actualGoLive: "Mar 1, 2026",
      }),
      bookRow({
        abbreviation: "NONE",
        currentGoLive: "—",
        contractDateInput: "",
        actualGoLive: "—",
      }),
      bookRow({
        abbreviation: "EARLY",
        currentGoLive: "Dec 1, 2025",
        contractDateInput: "2025-11-15",
        initialGoLive: "Oct 1, 2025",
        actualGoLive: "Jan 9, 2026",
      }),
    ];
    expect(
      sortCeoBookRows(rows, { column: "currentGoLive", direction: "asc" }).map((row) => row.abbreviation),
    ).toEqual(["EARLY", "LATE", "NONE"]);
    expect(
      sortCeoBookRows(rows, { column: "currentGoLive", direction: "desc" }).map((row) => row.abbreviation),
    ).toEqual(["LATE", "EARLY", "NONE"]);
    expect(
      sortCeoBookRows(rows, { column: "contractDate", direction: "asc" }).map((row) => row.abbreviation),
    ).toEqual(["EARLY", "LATE", "NONE"]);
    expect(
      sortCeoBookRows(rows, { column: "actualGoLive", direction: "desc" }).map((row) => row.abbreviation),
    ).toEqual(["LATE", "EARLY", "NONE"]);
  });

  it("sorts expected ARR as a number and status by its label, empty last", () => {
    const rows = [
      bookRow({ abbreviation: "BIG", expectedArrInput: "1000", ceoStatus: "LIVE", commentPreview: "Zebra" }),
      bookRow({ abbreviation: "BLANK", expectedArrInput: "", ceoStatus: null, commentPreview: null }),
      bookRow({
        abbreviation: "SMALL",
        expectedArrInput: "900",
        ceoStatus: "PAUSED",
        commentPreview: "alpha",
        commentFull: "alpha note",
      }),
      bookRow({ abbreviation: "OFF", expectedArrInput: "0", ceoStatus: "IN_PROCESS_OFF_TRACK" }),
    ];
    expect(
      sortCeoBookRows(rows, { column: "expectedArr", direction: "asc" }).map((row) => row.abbreviation),
    ).toEqual(["OFF", "SMALL", "BIG", "BLANK"]);
    expect(
      sortCeoBookRows(rows, { column: "expectedArr", direction: "desc" }).map((row) => row.abbreviation),
    ).toEqual(["BIG", "SMALL", "OFF", "BLANK"]);
    expect(sortCeoBookRows(rows, { column: "status", direction: "asc" }).map((row) => row.abbreviation)).toEqual([
      "OFF",
      "BIG",
      "SMALL",
      "BLANK",
    ]);
    expect(sortCeoBookRows(rows, { column: "status", direction: "desc" }).map((row) => row.abbreviation)).toEqual([
      "SMALL",
      "BIG",
      "OFF",
      "BLANK",
    ]);
    expect(
      sortCeoBookRows(rows, { column: "comments", direction: "asc" }).map((row) => row.abbreviation),
    ).toEqual(["SMALL", "BIG", "BLANK", "OFF"]);
  });

  it("treats an em dash assigned IS as empty and keeps ties in the incoming order", () => {
    const rows = [
      bookRow({ abbreviation: "B", assignedIs: "Morgan", productType: "RCM" }),
      bookRow({ abbreviation: "A", assignedIs: "—", productType: "EHR" }),
      bookRow({ abbreviation: "C", assignedIs: "Morgan", productType: "EHR+RCM" }),
    ];
    expect(
      sortCeoBookRows(rows, { column: "assignedIs", direction: "asc" }).map((row) => row.abbreviation),
    ).toEqual(["B", "C", "A"]);
    expect(
      sortCeoBookRows(rows, { column: "productType", direction: "asc" }).map((row) => row.abbreviation),
    ).toEqual(["A", "C", "B"]);
  });
});
