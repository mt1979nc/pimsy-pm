import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { formatRosterSlipDays, sumSlipDays } from "@/lib/engagement-roster";

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
    expect(table).toMatch(/formatRosterSlipDays\(row\.slipDays\)/);
    expect(table).not.toMatch(/overflow-x-auto/);
    expect(table).not.toMatch(/min-w-\[960px\]/);
    expect(table).not.toMatch(/slipCount/);
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
