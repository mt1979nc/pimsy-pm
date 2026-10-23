import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { archivedModulesEnabled, isArchivedRequestPath } from "@/lib/archived-modules";
import { PRISM_NAV } from "@/lib/area-nav";
import { staffHomeHref } from "@/lib/day-to-day";
import { staffSidebarSections } from "@/lib/staff-sidebar";

const originalArchive = process.env.PATH_ARCHIVED_MODULES;
const originalDay = process.env.PATH_DAY_TO_DAY;

afterEach(() => {
  if (originalArchive === undefined) delete process.env.PATH_ARCHIVED_MODULES;
  else process.env.PATH_ARCHIVED_MODULES = originalArchive;
  if (originalDay === undefined) delete process.env.PATH_DAY_TO_DAY;
  else process.env.PATH_DAY_TO_DAY = originalDay;
});

describe("PATH_ARCHIVED_MODULES", () => {
  it("is off unless the flag is 1, true, yes, or on", () => {
    delete process.env.PATH_ARCHIVED_MODULES;
    expect(archivedModulesEnabled()).toBe(false);
    process.env.PATH_ARCHIVED_MODULES = "0";
    expect(archivedModulesEnabled()).toBe(false);
    process.env.PATH_ARCHIVED_MODULES = "1";
    expect(archivedModulesEnabled()).toBe(true);
    process.env.PATH_ARCHIVED_MODULES = "yes";
    expect(archivedModulesEnabled()).toBe(true);
  });

  it("matches archived routes and leaves Prism, settings, and the report redirects", () => {
    expect(isArchivedRequestPath("/portal")).toBe(true);
    expect(isArchivedRequestPath("/portal/learn/item")).toBe(true);
    expect(isArchivedRequestPath("/learning")).toBe(true);
    expect(isArchivedRequestPath("/dashboard")).toBe(true);
    expect(isArchivedRequestPath("/my-work")).toBe(true);
    expect(isArchivedRequestPath("/inbox/thread")).toBe(true);
    expect(isArchivedRequestPath("/projects/site/tasks/1")).toBe(true);
    expect(isArchivedRequestPath("/customers/new")).toBe(true);
    expect(isArchivedRequestPath("/templates/playbook")).toBe(true);
    expect(isArchivedRequestPath("/library")).toBe(true);
    expect(isArchivedRequestPath("/admin/users")).toBe(true);
    expect(isArchivedRequestPath("/updates")).toBe(true);
    expect(isArchivedRequestPath("/reports")).toBe(true);
    expect(isArchivedRequestPath("/reports/waiting-on")).toBe(true);
    expect(isArchivedRequestPath("/management/executive")).toBe(true);
    expect(isArchivedRequestPath("/management/weekly")).toBe(true);
    expect(isArchivedRequestPath("/api/learn/item/file")).toBe(true);
    expect(isArchivedRequestPath("/api/library/id")).toBe(true);

    expect(isArchivedRequestPath("/reports/capacity")).toBe(false);
    expect(isArchivedRequestPath("/reports/analysis")).toBe(false);
    expect(isArchivedRequestPath("/management")).toBe(false);
    expect(isArchivedRequestPath("/management/capacity")).toBe(false);
    expect(isArchivedRequestPath("/management/forecast")).toBe(false);
    expect(isArchivedRequestPath("/management/team")).toBe(false);
    expect(isArchivedRequestPath("/management/engagements/site")).toBe(false);
    expect(isArchivedRequestPath("/management/analysis")).toBe(false);
    expect(isArchivedRequestPath("/management/dock-delivery")).toBe(false);
    expect(isArchivedRequestPath("/settings")).toBe(false);
    expect(isArchivedRequestPath("/signin")).toBe(false);
    expect(isArchivedRequestPath("/api/prism/snapshot")).toBe(false);
    expect(isArchivedRequestPath("/api/internal/dock-delivery/ingest")).toBe(false);
  });

  it("sends portfolio staff to /management while archives are off", () => {
    delete process.env.PATH_ARCHIVED_MODULES;
    delete process.env.PATH_DAY_TO_DAY;
    expect(staffHomeHref("OWNER")).toBe("/management");
    expect(staffHomeHref("ADMIN")).toBe("/management");
    expect(staffHomeHref("MANAGER")).toBe("/management");
    expect(staffHomeHref("SPECIALIST")).toBe("/settings");

    process.env.PATH_DAY_TO_DAY = "1";
    expect(staffHomeHref("MANAGER")).toBe("/management");

    process.env.PATH_ARCHIVED_MODULES = "1";
    delete process.env.PATH_DAY_TO_DAY;
    expect(staffHomeHref("OWNER")).toBe("/reports");
    process.env.PATH_DAY_TO_DAY = "1";
    expect(staffHomeHref("SPECIALIST")).toBe("/dashboard");
  });

  it("drops archived items from the sidebar and Prism tabs", () => {
    const sections = staffSidebarSections({
      unread: 2,
      showPortfolio: true,
      showTemplates: true,
      showDayToDay: true,
      showArchivedModules: false,
    });
    const hrefs = sections.flatMap((section) => section.items.map((item) => item.href));
    expect(hrefs).toEqual([
      "/management",
      "/management/forecast",
      "/management/capacity",
      "/management/team",
      "/management/analysis",
      "/management/dock-delivery",
      "/settings",
    ]);
    expect(sections.map((section) => section.id)).toEqual(["analytics", "settings"]);

    const hidden = new Set(
      PRISM_NAV.filter((item) => isArchivedRequestPath(item.href)).map((item) => item.href),
    );
    expect([...hidden]).toEqual(["/management/executive", "/management/weekly"]);
  });

  it("keeps the backup script documented and uninvoked from package.json", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/backup-path-db.sh"), "utf8");
    expect(script).toMatch(/pg_dump/);
    expect(script).toMatch(/DATABASE_URL/);
    expect(script).toMatch(/Do not run/);
    const pkg = readFileSync(resolve(process.cwd(), "package.json"), "utf8");
    expect(pkg).not.toMatch(/backup-path-db/);
    const archive = readFileSync(resolve(process.cwd(), "ARCHIVE.md"), "utf8");
    expect(archive).toMatch(/archive\/v1\.18\.28/);
    expect(archive).toMatch(/350974804280179864d7abbe46bc3e64e6e4b929/);
    expect(archive).toMatch(/git push origin archive\/v1\.18\.28/);
  });
});
