import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  EngagementRosterTable,
  type EngagementRow,
} from "@/app/(app)/management/_components/engagement-roster-table";
import { formatRosterSlipDays, sumSlipDays } from "@/lib/engagement-roster";

function sampleRow(overrides: Partial<EngagementRow> = {}): EngagementRow {
  return {
    id: "p1",
    acronym: "LECHRIS",
    customerName: "Le Chris Health Systems",
    name: "Le Chris — PIMSY implementation",
    leadName: "Alexander Morse",
    coLeadName: "Danielle Piper",
    ownerSplitPercent: 60,
    userCount: 170,
    locationCount: 1,
    trainingsPerWeek: 2,
    complexityTier: "HIGH",
    displayHours: 45,
    startDate: "2026-03-11",
    initialGoLiveDate: "2026-06-08",
    targetGoLiveDate: "2026-11-02",
    effectivePrismStatus: "active",
    prismNote: null,
    slipDays: 0,
    ...overrides,
  };
}

describe("sumSlipDays", () => {
  it("sums days across events instead of counting them", () => {
    expect(sumSlipDays([{ days: 1 }, { days: 2 }, { days: 4 }, { days: 6 }])).toBe(13);
    expect(sumSlipDays([{ days: 30 }, { days: 30 }, { days: 30 }, { days: 30 }])).toBe(120);
  });

  it("treats empty or missing days as zero", () => {
    expect(sumSlipDays([])).toBe(0);
    expect(sumSlipDays([{ days: 0 }, { days: null }, { days: undefined }])).toBe(0);
  });

  it("keeps a negative net (go-live pulled in)", () => {
    expect(sumSlipDays([{ days: 14 }, { days: -4 }])).toBe(10);
    expect(sumSlipDays([{ days: -7 }])).toBe(-7);
  });
});

describe("formatRosterSlipDays", () => {
  it("dashes when the total is zero", () => {
    expect(formatRosterSlipDays(0)).toBe("—");
    expect(formatRosterSlipDays(-0)).toBe("—");
  });

  it("prints the signed day total otherwise", () => {
    expect(formatRosterSlipDays(13)).toBe("13");
    expect(formatRosterSlipDays(-7)).toBe("-7");
  });
});

describe("EngagementRosterTable", () => {
  it("fills width with a table-fixed grid, no min-width or inner horizontal scroll", () => {
    const html = renderToStaticMarkup(
      createElement(EngagementRosterTable, { rows: [sampleRow({ slipDays: 13 })] }),
    );
    expect(html).toContain("table-fixed");
    expect(html).toContain("w-full");
    expect(html).not.toMatch(/min-w-\[960px\]/);
    expect(html).not.toMatch(/overflow-x-auto/);
    expect(html).toContain("Slip days");
    expect(html).toContain(">13<");
    expect(html).not.toMatch(/>Services</);
    expect(html).not.toMatch(/Outpatient/);
    expect(html).toContain("LECHRIS");
    expect(html).toContain("Edit");
  });

  it("dashes a zero slip-day total", () => {
    const html = renderToStaticMarkup(
      createElement(EngagementRosterTable, { rows: [sampleRow({ slipDays: 0 })] }),
    );
    expect(html).toContain("—");
    expect(html).not.toMatch(/>0</);
  });
});

describe("Engagements roster vs edit form scope", () => {
  it("does not list Services on the roster table source", () => {
    const table = readFileSync(
      resolve(process.cwd(), "src/app/(app)/management/_components/engagement-roster-table.tsx"),
      "utf8",
    );
    expect(table).not.toMatch(/SERVICE_LINE_LABELS/);
    expect(table).not.toMatch(/serviceLines/);
    expect(table).toMatch(/Slip days/);
    expect(table).toMatch(/table-fixed/);
    expect(table).not.toMatch(/overflow-x-auto/);
    expect(table).not.toMatch(/min-w-\[960px\]/);
  });

  it("keeps service-line checkboxes on the engagement edit form", () => {
    const form = readFileSync(
      resolve(process.cwd(), "src/app/(app)/management/_components/engagement-edit-form.tsx"),
      "utf8",
    );
    expect(form).toMatch(/Service lines/);
    expect(form).toMatch(/name="serviceLines"/);
    expect(form).toMatch(/SERVICE_LINE_LABELS/);
  });

  it("lets the engagements page opt out of the 1180px content cap", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(app)/management/engagements/page.tsx"),
      "utf8",
    );
    const layout = readFileSync(resolve(process.cwd(), "src/app/(app)/layout.tsx"), "utf8");
    expect(page).toMatch(/data-page-width="full"/);
    expect(layout).toMatch(/has-\[\[data-page-width=full\]\]:max-w-none/);
  });

  it("loads slip event days (not ids) when listing engagements", () => {
    const actions = readFileSync(resolve(process.cwd(), "src/actions/management-engagements.ts"), "utf8");
    expect(actions).toMatch(/sumSlipDays/);
    expect(actions).toMatch(/slipEvents:\s*\{\s*columns:\s*\{\s*days:\s*true/);
    expect(actions).toMatch(/slipDays:\s*sumSlipDays/);
    expect(actions).not.toMatch(/slipCount/);
  });
});
