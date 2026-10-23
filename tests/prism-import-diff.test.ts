import { describe, expect, it } from "vitest";
import { diffPrismBooks, formatPrismDiffReport, prismBookFromDump } from "@/lib/prism-import-diff";
import type { PrismDump } from "@/lib/prism-dump";

const dump: PrismDump = {
  version: 1,
  exportedAt: "2026-10-01",
  source: "test",
  team: [
    {
      teamId: "am",
      name: "Alexander",
      hoursPerWeek: 32,
      flags: { capacityExempt: false, canLead: true, director: true },
      active: true,
    },
  ],
  formerTeam: [],
  customers: [
    {
      id: "1",
      acct: "CEDAR",
      owner: "am",
      owner2: null,
      split: 100,
      users: 8,
      fp: 20,
      locations: 1,
      trainingsPerWeek: 2,
      sel: {},
      serviceLines: [],
      status: "stalled",
      note: null,
      kickoffDate: "2026-09-01",
      goliveDate: "2026-12-01",
      initialGolive: "2026-11-01",
      stateComp: false,
      supportStruct: false,
      customHpw: null,
      slipLog: [{ from: "2026-11-01", to: "2026-12-01", days: 30, cause: "CUSTOMER", note: "delay" }],
      dockWorkspaceId: null,
    },
  ],
  completed: [
    {
      id: "2",
      acct: "TANC",
      era: "current",
      owner: "am",
      users: 4,
      complexity: "STANDARD",
      estimatedHours: 40,
      kickoffDate: "2026-01-06",
      goliveDate: "2026-04-01",
      initialGolive: "2026-03-15",
      forecastDays: 70,
    },
  ],
};

describe("Prism SQL dump diff", () => {
  it("reports adds against an empty PATH book and does not drop PATH-only people", () => {
    const report = diffPrismBooks(prismBookFromDump(dump), {
      team: [
        {
          key: "morgan",
          name: "Morgan",
          hours: 23,
          canLead: false,
          exempt: true,
          director: false,
          active: true,
        },
      ],
      engagements: [],
      completed: [],
    });
    const text = formatPrismDiffReport(report);
    expect(text).toMatch(/dry-run, nothing written/);
    expect(text).toMatch(/\+ \[team\] Alexander/);
    expect(text).toMatch(/\+ \[engagement\] CEDAR/);
    expect(text).toMatch(/\+ \[completed\] TANC/);
    expect(text).toMatch(/PATH is the source for logins/);
    expect(text).not.toMatch(/DROP/i);
  });

  it("is quiet when the books already match", () => {
    const book = prismBookFromDump(dump);
    const report = diffPrismBooks(book, book);
    expect(report.lines.every((line) => line.change === "same")).toBe(true);
    expect(formatPrismDiffReport(report)).not.toMatch(/\n {2}[~+]/);
  });

  it("lists status and slip count changes", () => {
    const prism = prismBookFromDump(dump);
    const path = prismBookFromDump(dump);
    path.engagements[0] = { ...path.engagements[0]!, status: "active", slipCount: 0 };
    const report = diffPrismBooks(prism, path);
    const cedar = report.lines.find((line) => line.key === "CEDAR");
    expect(cedar?.change).toBe("update");
    expect(cedar?.fields.join(" ")).toMatch(/status active → stalled/);
    expect(cedar?.fields.join(" ")).toMatch(/slips 0 → 1/);
  });
});
