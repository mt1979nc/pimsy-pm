import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("P1 EHR color chrome", () => {
  it("keeps the left nav and adds a navy utility bar", () => {
    const layout = source("src/app/(app)/layout.tsx");
    const bar = source("src/components/staff-utility-bar.tsx");
    expect(layout).toMatch(/PRISM_NAV/);
    expect(layout).toMatch(/ADMIN_AREA_LABEL/);
    expect(layout).toMatch(/<StaffUtilityBar/);
    expect(bar).toMatch(/Search sites/);
    expect(bar).toMatch(/Alerts/);
    expect(bar).toMatch(/Profile/);
    expect(bar).toMatch(/#113c64/);
    expect(bar).toMatch(/href="\/inbox"/);
    expect(bar).toMatch(/href="\/settings"/);
    expect(bar).toMatch(/action="\/projects"/);
  });

  it("colors Discovery, Config, and Training with the EHR secondary tokens", () => {
    const chips = source("src/components/queue-chips.tsx");
    const list = source("src/components/waiting-on-customer-list.tsx");
    const tasks = source("src/components/project-task-list.tsx");
    expect(chips).toMatch(/label: "Discovery"/);
    expect(chips).toMatch(/label: "Config"/);
    expect(chips).toMatch(/label: "Training"/);
    expect(chips).toMatch(/tone: "slate"/);
    expect(chips).toMatch(/tone: "gold"/);
    expect(chips).toMatch(/tone: "sage"/);
    expect(list).toMatch(/<AreaChip/);
    expect(list).not.toMatch(/tone="violet"/);
    expect(tasks).toMatch(/<AreaChip area=\{area\}/);
    expect(source("src/app/globals.css")).toMatch(/#4b7095/);
    expect(source("src/app/globals.css")).toMatch(/#ffe28e/);
    expect(source("src/app/globals.css")).toMatch(/#cedeba/);
  });

  it("gives Executive and Engagements a navy header and quiet blanks", () => {
    const executive = source("src/app/(app)/management/_components/executive-book-table.tsx");
    const engagements = source("src/app/(app)/management/_components/engagement-roster-table.tsx");
    for (const table of [executive, engagements]) {
      expect(table).toMatch(/bg-\[#113c64\]/);
      expect(table).toMatch(/QuietBlank/);
    }
    expect(executive).toMatch(/Not set/);
    expect(executive).toMatch(/bg-ehr-sage/);
    expect(executive).toMatch(/bg-red/);
    expect(engagements).toMatch(/statusTone/);
    expect(engagements).not.toMatch(/"violet"/);
    expect(source("src/app/(app)/management/executive/page.tsx")).toMatch(/stay blank/);
  });

  it("moves attention and RCM off Prism violet onto EHR maroon", () => {
    const ui = source("src/components/ui.tsx");
    expect(ui).toMatch(/IN_REVIEW: \{ label: "In review", tone: "maroon" \}/);
    expect(ui).toMatch(/CUSTOMER: \{ label: "Waiting on customer", tone: "maroon" \}/);
    expect(ui).toMatch(/#7a4550/);
    expect(ui).toMatch(/bg-ehr-maroon-soft/);
    expect(source("src/components/project-row.tsx")).toMatch(/tone="maroon">RCM/);
    expect(source("src/components/task-row.tsx")).toMatch(/tone="maroon">RCM/);
    expect(source("src/components/task-row.tsx")).toMatch(/tone="maroon">Customer/);
    expect(source("src/app/globals.css")).toMatch(/#6941c6/);
    expect(source("src/app/globals.css")).toMatch(/#90545e/);
    expect(source("src/app/globals.css")).toMatch(/#e9dbd6/);
  });

  it("replaces the flat None empty state with a tinted panel", () => {
    const empty = source("src/components/ui.tsx");
    expect(empty).toMatch(/bg-brand-soft/);
    expect(empty).toMatch(/border-ehr-slate/);
    expect(source("src/app/(app)/dashboard/page.tsx")).toMatch(/emptyTitle="All clear"/);
    expect(source("src/app/(app)/dashboard/page.tsx")).not.toMatch(/emptyTitle="None"/);
    expect(source("src/app/(app)/projects/[id]/page.tsx")).toMatch(/emptyTitle="All clear"/);
    expect(source("src/app/(app)/projects/[id]/page.tsx")).not.toMatch(/emptyTitle="None"/);
  });
});
