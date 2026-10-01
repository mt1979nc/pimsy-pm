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
  compareCeoBookRows,
  expectedArrInputValue,
  formatAssignedIs,
  formatExpectedArr,
  parseExpectedArr,
  summarizeCeoBook,
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

  it("uses the latest update text and leaves a missing comment empty", () => {
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
    const nav = readFileSync(resolve(process.cwd(), "src/components/prism-nav.tsx"), "utf8");
    const migration = readFileSync(resolve(process.cwd(), "drizzle/0026_ceo_executive.sql"), "utf8");
    const schema = readFileSync(resolve(process.cwd(), "src/db/schema.ts"), "utf8");

    expect(page).toMatch(/listCeoBook/);
    expect(page).toMatch(/\/management\/executive/);
    expect(page).not.toMatch(/from ["']@\/db["']/);
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
    expect(query).toMatch(/statusUpdates/);
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
    expect(schema).not.toMatch(/dockUrl/);
  });
});
