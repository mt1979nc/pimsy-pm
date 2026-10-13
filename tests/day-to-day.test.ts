import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ADMIN_NAV } from "@/lib/area-nav";
import { adminNavFor, dayToDayEnabled, staffHomeHref } from "@/lib/day-to-day";

const original = process.env.PATH_DAY_TO_DAY;

afterEach(() => {
  if (original === undefined) delete process.env.PATH_DAY_TO_DAY;
  else process.env.PATH_DAY_TO_DAY = original;
});

describe("day-to-day feature flag", () => {
  it("hides day-to-day unless PATH_DAY_TO_DAY is on", () => {
    delete process.env.PATH_DAY_TO_DAY;
    expect(dayToDayEnabled()).toBe(false);
    expect(staffHomeHref("OWNER")).toBe("/reports");
    expect(staffHomeHref("ADMIN")).toBe("/reports");
    expect(staffHomeHref("MANAGER")).toBe("/reports");
    expect(staffHomeHref("SPECIALIST")).toBe("/settings");
    expect(staffHomeHref("MEMBER")).toBe("/settings");

    process.env.PATH_DAY_TO_DAY = "1";
    expect(dayToDayEnabled()).toBe(true);
    expect(staffHomeHref("MANAGER")).toBe("/dashboard");
    expect(staffHomeHref("SPECIALIST")).toBe("/dashboard");

    process.env.PATH_DAY_TO_DAY = "off";
    expect(dayToDayEnabled()).toBe(false);
  });

  it("drops project and customer tabs from the admin nav while the flag is off", () => {
    const hidden = adminNavFor(ADMIN_NAV, { isAdmin: true, showDayToDay: false });
    expect(hidden.map((item) => item.href)).toEqual(["/admin", "/admin/users", "/admin/alerts"]);
    const manager = adminNavFor(ADMIN_NAV, { isAdmin: false, showDayToDay: false });
    expect(manager.map((item) => item.label)).toEqual(["Overview"]);
    const shown = adminNavFor(ADMIN_NAV, { isAdmin: true, showDayToDay: true });
    expect(shown.map((item) => item.href)).toEqual(ADMIN_NAV.map((item) => item.href));
  });

  it("keeps slip approval on Team capacity and lands staff on Portfolio", () => {
    const capacity = readFileSync(resolve(process.cwd(), "src/app/(app)/management/capacity/page.tsx"), "utf8");
    expect(capacity).toMatch(/slip history/);
    expect(capacity).toMatch(/approve the go-live/);
    const home = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");
    expect(home).toMatch(/staffHomeHref/);
    const layout = readFileSync(resolve(process.cwd(), "src/app/(app)/layout.tsx"), "utf8");
    expect(layout).toMatch(/showDayToDay/);
    const reports = readFileSync(resolve(process.cwd(), "src/app/(app)/reports/page.tsx"), "utf8");
    expect(reports).toMatch(/showDayToDay/);
    expect(reports).toMatch(/WaitingOnCustomerList/);
  });
});
