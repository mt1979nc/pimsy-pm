import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { customerAccounts, projects, slipEvents } from "@/db/schema";
import { buildFixture } from "./fixtures";
import { listWeeklyMeetingSites } from "@/lib/weekly-meeting";
import { isOpenImplementationStatus, type WeeklyMeetingSite } from "@/lib/weekly-meeting-types";
import {
  DEFAULT_WEEKLY_MEETING_SORT,
  sortWeeklyMeetingSites,
} from "@/lib/weekly-meeting-sort";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe("weekly meeting view (source)", () => {
  it("is a card roster with Record slip behind expand", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(app)/management/weekly/page.tsx"),
      "utf8",
    );
    const board = readFileSync(
      resolve(process.cwd(), "src/app/(app)/management/_components/weekly-meeting-board.tsx"),
      "utf8",
    );
    const layout = readFileSync(resolve(process.cwd(), "src/app/(app)/management/layout.tsx"), "utf8");
    const sidebar = readFileSync(resolve(process.cwd(), "src/app/(app)/layout.tsx"), "utf8");
    const nav = readFileSync(resolve(process.cwd(), "src/lib/area-nav.ts"), "utf8");
    const prism = readFileSync(resolve(process.cwd(), "src/components/prism-nav.tsx"), "utf8");
    expect(page).toMatch(/listWeeklyMeetingSites/);
    expect(page).toMatch(/includeExcluded/);
    expect(page).toMatch(/Show excluded/);
    expect(page).not.toMatch(/from ["']@\/db["']/);
    expect(page).not.toMatch(/WeeklyMeetingTable/);
    expect(board).toMatch(/RecordSlipForm/);
    expect(board).toMatch(/source="weekly"/);
    expect(board).toMatch(/from ["']@\/lib\/weekly-meeting-types["']/);
    expect(board).toMatch(/Nearest go-live|WEEKLY_MEETING_SORT_OPTIONS/);
    expect(board).not.toMatch(/<table/);
    expect(board).not.toMatch(/from ["']@\/lib\/weekly-meeting["']/);
    expect(board).not.toMatch(/from ["']@\/db["']/);
    expect(layout).toMatch(/\/management\/weekly|PrismNav/);
    expect(layout).toMatch(/PrismNav/);
    expect(nav).toMatch(/Weekly meeting/);
    expect(nav).toMatch(/href: "\/management\/capacity"/);
    expect(nav).toMatch(/source: "\/reports\/capacity", destination: "\/management\/capacity"/);
    expect(nav).not.toMatch(/href: "\/reports\/capacity"/);
    expect(nav).toMatch(/Analysis/);
    expect(nav).toMatch(/href: "\/management", label: "Overview", exact: true/);
    expect(prism).toMatch(/PRISM_NAV/);
    expect(sidebar).toMatch(/PRISM_NAV/);
    expect(sidebar).toMatch(/exact=\{item\.exact\}/);
    const lib = readFileSync(resolve(process.cwd(), "src/lib/weekly-meeting.ts"), "utf8");
    expect(lib).toMatch(/isExcludedFromAnalytics/);
    expect(lib).toMatch(/includeExcluded/);
    expect(lib).toMatch(/daysSinceKickoff/);
  });

  it("classifies open implementation statuses", () => {
    expect(isOpenImplementationStatus("IN_PROGRESS")).toBe(true);
    expect(isOpenImplementationStatus("NOT_STARTED")).toBe(true);
    expect(isOpenImplementationStatus("ON_HOLD")).toBe(true);
    expect(isOpenImplementationStatus("BLOCKED")).toBe(true);
    expect(isOpenImplementationStatus("COMPLETED")).toBe(false);
    expect(isOpenImplementationStatus("CANCELLED")).toBe(false);
  });
});

function meetingSite(
  partial: Partial<WeeklyMeetingSite> & Pick<WeeklyMeetingSite, "id" | "acronym">,
): WeeklyMeetingSite {
  return {
    name: partial.acronym,
    code: partial.acronym,
    status: "IN_PROGRESS",
    health: "GREEN",
    leadName: null,
    leadId: null,
    startDate: null,
    daysSinceKickoff: null,
    targetGoLiveDate: null,
    daysToGoLive: null,
    taskCountDone: 0,
    taskCountTotal: 0,
    progressPct: 0,
    excludeFromAnalytics: false,
    lastSlip: null,
    ...partial,
  };
}

describe("weekly meeting sort", () => {
  const rows = [
    meetingSite({ id: "late", acronym: "LATE", daysToGoLive: 30, daysSinceKickoff: 10, health: "GREEN", leadName: "Zoe" }),
    meetingSite({ id: "soon", acronym: "SOON", daysToGoLive: 2, daysSinceKickoff: 80, health: "RED", leadName: "Amy" }),
    meetingSite({ id: "none", acronym: "NONE", daysToGoLive: null, daysSinceKickoff: null, health: "YELLOW", leadName: null }),
    meetingSite({
      id: "over",
      acronym: "OVER",
      daysToGoLive: -4,
      daysSinceKickoff: 40,
      health: "YELLOW",
      leadName: "Amy",
      lastSlip: {
        id: "s1",
        days: 3,
        cause: "CUSTOMER",
        note: null,
        createdAt: new Date("2026-09-01T12:00:00.000Z"),
        fromDate: new Date("2026-09-01T12:00:00.000Z"),
        toDate: new Date("2026-09-04T12:00:00.000Z"),
      },
    }),
    meetingSite({
      id: "slipped",
      acronym: "SLIP",
      daysToGoLive: 9,
      daysSinceKickoff: 3,
      health: "GREEN",
      leadName: "Mia",
      lastSlip: {
        id: "s2",
        days: 14,
        cause: "PIMSY",
        note: "waiting",
        createdAt: new Date("2026-09-20T12:00:00.000Z"),
        fromDate: new Date("2026-09-20T12:00:00.000Z"),
        toDate: new Date("2026-10-04T12:00:00.000Z"),
      },
    }),
  ];

  it("defaults to nearest go-live, missing dates last", () => {
    expect(DEFAULT_WEEKLY_MEETING_SORT).toBe("go-live-asc");
    expect(sortWeeklyMeetingSites(rows).map((r) => r.acronym)).toEqual([
      "OVER",
      "SOON",
      "SLIP",
      "LATE",
      "NONE",
    ]);
  });

  it("sorts latest go-live and days since kickoff without mutating the input", () => {
    const before = rows.map((r) => r.id);
    expect(sortWeeklyMeetingSites(rows, "go-live-desc").map((r) => r.acronym)).toEqual([
      "LATE",
      "SLIP",
      "SOON",
      "OVER",
      "NONE",
    ]);
    expect(sortWeeklyMeetingSites(rows, "kickoff-desc").map((r) => r.acronym)).toEqual([
      "SOON",
      "OVER",
      "LATE",
      "SLIP",
      "NONE",
    ]);
    expect(sortWeeklyMeetingSites(rows, "kickoff-asc").map((r) => r.acronym)).toEqual([
      "SLIP",
      "LATE",
      "OVER",
      "SOON",
      "NONE",
    ]);
    expect(rows.map((r) => r.id)).toEqual(before);
  });

  it("sorts last slip, health, and lead", () => {
    expect(sortWeeklyMeetingSites(rows, "last-slip").map((r) => r.acronym).slice(0, 2)).toEqual([
      "SLIP",
      "OVER",
    ]);
    expect(sortWeeklyMeetingSites(rows, "health").map((r) => r.health)[0]).toBe("RED");
    const leads = sortWeeklyMeetingSites(rows, "lead").map((r) => r.leadName);
    expect(leads.at(-1)).toBeNull();
    expect(leads.filter(Boolean)).toEqual(["Amy", "Amy", "Mia", "Zoe"]);
  });
});

describe.skipIf(!dbOk)("weekly meeting list filters (postgres)", () => {
  let fixture: Awaited<ReturnType<typeof buildFixture>>;

  beforeAll(async () => {
    fixture = await buildFixture();
    await db
      .update(projects)
      .set({
        type: "IMPLEMENTATION",
        status: "IN_PROGRESS",
        health: "GREEN",
        targetGoLiveDate: new Date("2026-10-15T12:00:00.000Z"),
        startDate: new Date("2026-01-15T12:00:00.000Z"),
        excludeFromAnalytics: false,
      })
      .where(eq(projects.id, fixture.projects.a));
    await db
      .update(projects)
      .set({
        type: "IMPLEMENTATION",
        status: "COMPLETED",
        excludeFromAnalytics: false,
      })
      .where(eq(projects.id, fixture.projects.b));
    await db
      .update(projects)
      .set({
        type: "IMPLEMENTATION",
        status: "IN_PROGRESS",
        excludeFromAnalytics: true,
        targetGoLiveDate: new Date("2026-11-01T12:00:00.000Z"),
      })
      .where(eq(projects.id, fixture.projects.portalOff));
    await db
      .update(projects)
      .set({
        type: "IMPLEMENTATION",
        status: "CANCELLED",
      })
      .where(eq(projects.id, fixture.projects.managerOnly));
  });

  it("lists open Implementation sites and hides completed, cancelled, internal, and excluded", async () => {
    const rows = await listWeeklyMeetingSites();
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(fixture.projects.a);
    expect(ids).not.toContain(fixture.projects.b);
    expect(ids).not.toContain(fixture.projects.internal);
    expect(ids).not.toContain(fixture.projects.portalOff);
    expect(ids).not.toContain(fixture.projects.managerOnly);
    const site = rows.find((r) => r.id === fixture.projects.a);
    expect(site?.leadName).toBeTruthy();
    expect(site?.status).toBe("IN_PROGRESS");
    expect(site?.health).toBe("GREEN");
    expect(site?.progressPct).toBeGreaterThanOrEqual(0);
    expect(site?.daysSinceKickoff).toEqual(expect.any(Number));
    expect(site?.daysSinceKickoff ?? 0).toBeGreaterThan(0);
  });

  it("includes analytics-excluded rows when toggled", async () => {
    const hidden = await listWeeklyMeetingSites({ includeExcluded: false });
    expect(hidden.some((r) => r.id === fixture.projects.portalOff)).toBe(false);

    const shown = await listWeeklyMeetingSites({ includeExcluded: true });
    expect(shown.some((r) => r.id === fixture.projects.portalOff)).toBe(true);
    expect(shown.find((r) => r.id === fixture.projects.portalOff)?.excludeFromAnalytics).toBe(true);
    expect(shown.some((r) => r.id === fixture.projects.b)).toBe(false);
  });

  it("inherits customer-level analytics exclude", async () => {
    await db
      .update(customerAccounts)
      .set({ excludeFromAnalytics: true })
      .where(eq(customerAccounts.id, fixture.accounts.a));
    const hidden = await listWeeklyMeetingSites();
    expect(hidden.some((r) => r.id === fixture.projects.a)).toBe(false);
    const shown = await listWeeklyMeetingSites({ includeExcluded: true });
    expect(shown.some((r) => r.id === fixture.projects.a)).toBe(true);
    await db
      .update(customerAccounts)
      .set({ excludeFromAnalytics: false })
      .where(eq(customerAccounts.id, fixture.accounts.a));
  });

  it("surfaces the most recent slip on the row", async () => {
    const fromDate = new Date("2026-10-15T12:00:00.000Z");
    const toDate = new Date("2026-10-22T12:00:00.000Z");
    await db.insert(slipEvents).values({
      projectId: fixture.projects.a,
      fromDate,
      toDate,
      days: 7,
      cause: "CUSTOMER",
      note: "weekly meeting",
      createdById: fixture.actors.specialist.id,
    });
    const rows = await listWeeklyMeetingSites();
    const site = rows.find((r) => r.id === fixture.projects.a);
    expect(site?.lastSlip?.days).toBe(7);
    expect(site?.lastSlip?.cause).toBe("CUSTOMER");
    expect(site?.lastSlip?.note).toBe("weekly meeting");
  });
});
