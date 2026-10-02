import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ADMIN_AREA_LABEL } from "@/lib/area-nav";
import {
  STAFF_SIDEBAR_OPEN_KEY,
  parseOpenSectionIds,
  sectionIdForPath,
  staffSidebarSections,
  toggleOpenSection,
  visibleOpenSectionIds,
  type StaffSidebarSection,
} from "@/lib/staff-sidebar";

const full = staffSidebarSections({ unread: 3, showPortfolio: true, showTemplates: true });

function labels(id: StaffSidebarSection["id"], sections: StaffSidebarSection[] = full) {
  return sections.find((section) => section.id === id)?.items.map((item) => item.label);
}

function hrefs(id: StaffSidebarSection["id"], sections: StaffSidebarSection[] = full) {
  return sections.find((section) => section.id === id)?.items.map((item) => item.href);
}

describe("staff sidebar sections", () => {
  it("groups day-to-day, analytics, and settings", () => {
    expect(full.map((section) => section.label)).toEqual([
      "Day-to-day project work",
      "Data analytics",
      "PATH settings",
    ]);
    expect(labels("day-to-day")).toEqual([
      "Dashboard",
      "My work",
      "Inbox",
      "Projects",
      "Customers",
      "Waiting on",
    ]);
    expect(labels("analytics")).toEqual([
      "Portfolio",
      ADMIN_AREA_LABEL,
      "Overview",
      "Executive",
      "Weekly meeting",
      "Forecast",
      "Team capacity",
      "Team",
      "Analysis",
    ]);
    expect(ADMIN_AREA_LABEL).toBe("Implementation Dashboard");
    expect(hrefs("analytics")).toContain("/admin");
    expect(hrefs("analytics")).not.toContain("/management/engagements");
    expect(labels("settings")).toEqual([
      "Templates",
      "File library",
      "Learning Center",
      "What's new",
      "Settings",
    ]);
    expect(full.flatMap((section) => section.items.map((item) => item.label)).join(" ")).not.toMatch(
      /Prism|Management|Engagements|Delivery|Leadership|Setup/,
    );
  });

  it("keeps portfolio and template gates", () => {
    const manager = staffSidebarSections({ unread: 0, showPortfolio: true, showTemplates: false });
    expect(labels("day-to-day", manager)).toContain("Waiting on");
    expect(labels("analytics", manager)).toContain("Implementation Dashboard");
    expect(labels("settings", manager)).toEqual(["Learning Center", "What's new", "Settings"]);

    const specialist = staffSidebarSections({ unread: 0, showPortfolio: false, showTemplates: false });
    expect(specialist.map((section) => section.id)).toEqual(["day-to-day", "settings"]);
    expect(labels("day-to-day", specialist)).not.toContain("Waiting on");
    expect(labels("settings", specialist)).toEqual(["Learning Center", "What's new", "Settings"]);
  });

  it("passes the inbox count through", () => {
    expect(full.find((section) => section.id === "day-to-day")?.items.find((item) => item.href === "/inbox")?.badge).toBe(
      3,
    );
    expect(hrefs("analytics")).toContain("/reports");
    expect(full.find((section) => section.id === "analytics")?.items.find((item) => item.href === "/reports")?.exact).toBe(
      true,
    );
    expect(
      full.find((section) => section.id === "analytics")?.items.find((item) => item.href === "/management")?.exact,
    ).toBe(true);
  });

  it("opens the section that contains the current page", () => {
    expect(sectionIdForPath("/dashboard", full)).toBe("day-to-day");
    expect(sectionIdForPath("/projects/site-1", full)).toBe("day-to-day");
    expect(sectionIdForPath("/reports/waiting-on", full)).toBe("day-to-day");
    expect(sectionIdForPath("/reports", full)).toBe("analytics");
    expect(sectionIdForPath("/admin/users", full)).toBe("analytics");
    expect(sectionIdForPath("/management", full)).toBe("analytics");
    expect(sectionIdForPath("/management/engagements/site-1", full)).toBe("analytics");
    expect(sectionIdForPath("/learning", full)).toBe("settings");
    expect(sectionIdForPath("/updates", full)).toBe("settings");
  });

  it("remembers open sections and still reveals the active one", () => {
    expect(STAFF_SIDEBAR_OPEN_KEY).toBe("path.sidebar.sections");
    expect(parseOpenSectionIds(null)).toBeNull();
    expect(parseOpenSectionIds("nope")).toBeNull();
    expect(parseOpenSectionIds('["settings","nope","day-to-day"]')).toEqual(["day-to-day", "settings"]);
    expect(visibleOpenSectionIds(null, null)).toEqual(["day-to-day"]);
    expect(visibleOpenSectionIds(null, "settings")).toEqual(["day-to-day", "settings"]);
    expect(visibleOpenSectionIds([], "analytics")).toEqual(["analytics"]);
    expect(visibleOpenSectionIds(["settings"], "day-to-day")).toEqual(["day-to-day", "settings"]);
    expect(toggleOpenSection(["day-to-day"], "analytics")).toEqual(["day-to-day", "analytics"]);
    expect(toggleOpenSection(["day-to-day", "analytics"], "day-to-day")).toEqual(["analytics"]);
  });

  it("titles the engagements page Roster and leaves it out of the sidebar chrome", () => {
    const page = readFileSync(resolve(process.cwd(), "src/app/(app)/management/engagements/page.tsx"), "utf8");
    const layout = readFileSync(resolve(process.cwd(), "src/app/(app)/layout.tsx"), "utf8");
    expect(page).toMatch(/title: "Roster"/);
    expect(page).toMatch(/"Roster"/);
    expect(page).not.toMatch(/Engagements — Prism/);
    expect(page).not.toMatch(/title=\{filter === "all" \? "Engagements"/);
    expect(layout).not.toMatch(/Delivery|Leadership|Setup/);
    expect(layout).not.toMatch(/What's new|What&apos;s new/);
    expect(layout).toMatch(/v\{APP_VERSION\}/);
  });
});
