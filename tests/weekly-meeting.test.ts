import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { customerAccounts, projects, slipEvents } from "@/db/schema";
import { buildFixture } from "./fixtures";
import { listWeeklyMeetingSites } from "@/lib/weekly-meeting";
import { isOpenImplementationStatus } from "@/lib/weekly-meeting-types";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe("weekly meeting view (source)", () => {
  it("is a management roster with inline Record slip", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(app)/management/weekly/page.tsx"),
      "utf8",
    );
    const table = readFileSync(
      resolve(process.cwd(), "src/app/(app)/management/_components/weekly-meeting-table.tsx"),
      "utf8",
    );
    const layout = readFileSync(resolve(process.cwd(), "src/app/(app)/management/layout.tsx"), "utf8");
    expect(page).toMatch(/listWeeklyMeetingSites/);
    expect(page).toMatch(/includeExcluded/);
    expect(page).toMatch(/Show analytics-excluded/);
    expect(page).not.toMatch(/from ["']@\/db["']/);
    expect(table).toMatch(/RecordSlipForm/);
    expect(table).toMatch(/source="weekly"/);
    expect(table).toMatch(/from ["']@\/lib\/weekly-meeting-types["']/);
    expect(table).not.toMatch(/from ["']@\/lib\/weekly-meeting["']/);
    expect(table).not.toMatch(/from ["']@\/db["']/);
    expect(layout).toMatch(/\/management\/weekly/);
    expect(layout).toMatch(/Weekly meeting/);
    const lib = readFileSync(resolve(process.cwd(), "src/lib/weekly-meeting.ts"), "utf8");
    expect(lib).toMatch(/isExcludedFromAnalytics/);
    expect(lib).toMatch(/includeExcluded/);
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
