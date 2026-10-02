import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("narrow-window layout", () => {
  it("keeps the accordion on small screens and clips page-level horizontal overflow", () => {
    const layout = source("src/app/(app)/layout.tsx");
    expect(layout).toMatch(/overflow-x-clip/);
    expect(layout).toMatch(/lg:grid-cols-\[228px_minmax\(0,1fr\)\]/);
    expect(layout).toMatch(/max-h-\[40vh\]/);
    expect(layout).not.toMatch(/hidden md:flex/);
    expect(source("src/components/staff-sidebar.tsx")).toMatch(/title=\{section\.label\}/);
    expect(source("src/components/staff-utility-bar.tsx")).not.toMatch(/aria-label="Sections"/);
  });

  it("wraps project chrome and customer chips instead of overflowing", () => {
    const project = source("src/app/(app)/projects/[id]/layout.tsx");
    expect(project).toMatch(/aria-label="Project"/);
    expect(project).toMatch(/flex-wrap/);
    expect(source("src/app/(app)/customers/page.tsx")).toMatch(/flex-wrap items-center gap-x-3/);
    expect(source("src/components/project-row.tsx")).toMatch(/flex-wrap items-center gap-1\.5/);
  });

  it("scrolls dense analytics tables inside the page and keeps Roster fitted", () => {
    const executive = source("src/app/(app)/management/_components/executive-book-table.tsx");
    expect(executive).toMatch(/max-w-full overflow-x-auto \[contain:paint\]/);
    expect(source("src/app/(app)/management/forecast/page.tsx")).toMatch(
      /min-w-0 max-w-full overflow-x-auto \[contain:paint\]/,
    );
    expect(source("src/app/(app)/management/analysis/page.tsx")).toMatch(/min-w-\[40rem\]/);
    expect(source("src/app/(app)/management/analysis/page.tsx")).toMatch(/\[contain:paint\]/);
    const roster = source("src/app/(app)/management/_components/engagement-roster-table.tsx");
    expect(roster).toMatch(/table-fixed/);
    expect(roster).toMatch(/overflow-hidden \[contain:paint\]/);
    expect(roster).toMatch(/w-\[9%\]/);
    expect(roster).not.toMatch(/overflow-x-auto/);
    expect(roster).not.toMatch(/whitespace-nowrap text-ink-2/);
    expect(roster).not.toMatch(/w-\[\d+(\.\d+)?rem\]/);
    expect(source("src/components/charts.tsx")).toMatch(/overflow-x-auto \[contain:paint\]/);
  });
});
