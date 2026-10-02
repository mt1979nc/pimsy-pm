import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ADMIN_AREA_LABEL, ADMIN_NAV, LEGACY_PRISM_REDIRECTS, PRISM_NAV } from "@/lib/area-nav";

describe("P0 cutover banner, queue chips, and Prism nav", () => {
  it("keeps one Prism list and one Admin list, with clearer labels", () => {
    expect(ADMIN_AREA_LABEL).toBe("Admin");
    expect(ADMIN_NAV.map((item) => item.href)).toEqual([
      "/admin",
      "/admin/projects",
      "/admin/customers",
      "/admin/users",
      "/admin/alerts",
    ]);
    expect(PRISM_NAV.map((item) => item.label)).toEqual([
      "Overview",
      "Executive",
      "Weekly meeting",
      "Forecast",
      "Team capacity",
      "Team",
      "Engagements",
      "Analysis",
    ]);
    expect(PRISM_NAV.map((item) => item.href)).toEqual([
      "/management",
      "/management/executive",
      "/management/weekly",
      "/management/forecast",
      "/management/capacity",
      "/management/team",
      "/management/engagements",
      "/management/analysis",
    ]);
    expect(PRISM_NAV.find((item) => item.href === "/management")?.exact).toBe(true);
    expect(PRISM_NAV.find((item) => item.href === "/management/engagements")?.match).toBe("prefix");
    expect(LEGACY_PRISM_REDIRECTS).toEqual([
      { source: "/reports/capacity", destination: "/management/capacity" },
      { source: "/reports/analysis", destination: "/management/analysis" },
    ]);
    expect(JSON.stringify(LEGACY_PRISM_REDIRECTS)).not.toMatch(/staffing/);
  });

  it("drops the staffing alias and redirects the old report URLs", () => {
    expect(existsSync(resolve(process.cwd(), "src/app/(app)/management/staffing/page.tsx"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "src/app/(app)/reports/capacity/page.tsx"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "src/app/(app)/reports/analysis/page.tsx"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "src/app/(app)/management/capacity/page.tsx"))).toBe(true);
    const config = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toMatch(/LEGACY_PRISM_REDIRECTS/);
    const sidebar = readFileSync(resolve(process.cwd(), "src/app/(app)/layout.tsx"), "utf8");
    const admin = readFileSync(resolve(process.cwd(), "src/app/(app)/admin/layout.tsx"), "utf8");
    expect(sidebar).toMatch(/PRISM_NAV/);
    expect(sidebar).toMatch(/ADMIN_AREA_LABEL/);
    expect(sidebar).not.toMatch(/>Management</);
    expect(admin).toMatch(/ADMIN_NAV/);
    expect(admin).toMatch(/ADMIN_AREA_LABEL/);
  });

  it("shows the shared banner on dashboard, projects, and project overview", () => {
    const banner = readFileSync(resolve(process.cwd(), "src/components/cutover-banner.tsx"), "utf8");
    expect(banner).toMatch(/path\.cutover-banner\.dismissed/);
    expect(banner).toMatch(/Roster and time slips are live in PATH/);
    expect(banner).toMatch(/still in Dock/);
    expect(banner).toMatch(/localStorage/);
    for (const file of [
      "src/app/(app)/dashboard/page.tsx",
      "src/app/(app)/projects/page.tsx",
      "src/app/(app)/projects/[id]/page.tsx",
    ]) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).toMatch(/<CutoverBanner \/>/);
    }
    const portal = readFileSync(resolve(process.cwd(), "src/app/portal/page.tsx"), "utf8");
    expect(portal).not.toMatch(/CutoverBanner/);
  });

  it("renders dashboard queue chips from the portfolio summary", () => {
    const dashboard = readFileSync(resolve(process.cwd(), "src/app/(app)/dashboard/page.tsx"), "utf8");
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    expect(dashboard).toMatch(/label: "At risk"/);
    expect(dashboard).toMatch(/summary\.atRisk/);
    expect(dashboard).toMatch(/label: "Go-lives in 30 days"/);
    expect(dashboard).toMatch(/summary\.goLivesNext30/);
    expect(dashboard).toMatch(/label: "Overdue"/);
    expect(dashboard).toMatch(/summary\.overdueTasks/);
    expect(dashboard).toMatch(/label: "Waiting on customer"/);
    expect(dashboard).toMatch(/summary\.openCustomerActions/);
    expect(css).toMatch(/#4b7095/);
    expect(css).toMatch(/#89a55b/);
    expect(css).toMatch(/#cedeba/);
    expect(css).toMatch(/#90545e/);
    expect(css).toMatch(/#e9dbd6/);
    expect(css).toMatch(/#ffe28e/);
  });
});
