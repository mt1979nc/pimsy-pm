import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { customerAccounts, projects } from "@/db/schema";
import { buildFixture } from "./fixtures";
import {
  cycleTimeStats,
  listCompletedForAnalysis,
  listProjects,
  portfolioSummary,
  teamCapacity,
} from "@/lib/queries";
import { loadForecastEngagements } from "@/lib/forecast-data";
import { portalProjects } from "@/lib/portal";
import { analyticsExcludedProjectIds, includedInAnalytics } from "@/lib/analytics-scope";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbOk)("excludeFromAnalytics reporting (postgres)", () => {
  let fixture: Awaited<ReturnType<typeof buildFixture>>;

  beforeAll(async () => {
    fixture = await buildFixture();
    await db
      .update(projects)
      .set({
        type: "IMPLEMENTATION",
        status: "IN_PROGRESS",
        health: "GREEN",
        estimatedHours: 40,
        startDate: new Date("2026-09-01T12:00:00.000Z"),
        targetGoLiveDate: new Date("2026-10-15T12:00:00.000Z"),
        excludeFromAnalytics: false,
      })
      .where(eq(projects.id, fixture.projects.a));
  });

  async function resetFlags() {
    await db
      .update(projects)
      .set({ excludeFromAnalytics: false, status: "IN_PROGRESS" })
      .where(eq(projects.id, fixture.projects.a));
    await db
      .update(customerAccounts)
      .set({ excludeFromAnalytics: false })
      .where(eq(customerAccounts.id, fixture.accounts.a));
  }

  it("skips a flagged project from portfolio / forecast / roster but keeps delivery + portal", async () => {
    await resetFlags();
    const manager = fixture.actors.manager;

    const beforeSummary = await portfolioSummary(manager);
    const beforeForecast = await loadForecastEngagements();
    expect(beforeForecast.some((e) => e.id === fixture.projects.a)).toBe(true);

    await db
      .update(projects)
      .set({ excludeFromAnalytics: true })
      .where(eq(projects.id, fixture.projects.a));

    const excluded = await analyticsExcludedProjectIds();
    expect(excluded).toContain(fixture.projects.a);

    const afterSummary = await portfolioSummary(manager);
    expect(afterSummary.active).toBe(beforeSummary.active - 1);

    const afterForecast = await loadForecastEngagements();
    expect(afterForecast.some((e) => e.id === fixture.projects.a)).toBe(false);

    const delivery = await listProjects(manager);
    expect(delivery.some((p) => p.id === fixture.projects.a)).toBe(true);

    const reporting = await listProjects(manager, { skipAnalyticsExcluded: true });
    expect(reporting.some((p) => p.id === fixture.projects.a)).toBe(false);

    const roster = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          isNull(projects.archivedAt),
          eq(projects.type, "IMPLEMENTATION"),
          ne(projects.status, "CANCELLED"),
          includedInAnalytics(),
        ),
      );
    expect(roster.some((r) => r.id === fixture.projects.a)).toBe(false);

    const portal = await portalProjects(fixture.actors.customerA);
    expect(portal.some((p) => p.id === fixture.projects.a)).toBe(true);

    await resetFlags();
  });

  it("inherits the customer flag onto every project under that account", async () => {
    await resetFlags();
    const manager = fixture.actors.manager;
    const before = await portfolioSummary(manager);

    await db
      .update(customerAccounts)
      .set({ excludeFromAnalytics: true })
      .where(eq(customerAccounts.id, fixture.accounts.a));

    const excluded = await analyticsExcludedProjectIds();
    expect(excluded).toContain(fixture.projects.a);
    expect(excluded).toContain(fixture.projects.portalOff);

    const after = await portfolioSummary(manager);
    expect(after.active).toBeLessThan(before.active);

    const delivery = await listProjects(manager, { customerId: fixture.accounts.a });
    expect(delivery.some((p) => p.id === fixture.projects.a)).toBe(true);

    await resetFlags();
  });

  it("drops flagged completed sites from Analysis and cycle-time stats", async () => {
    await resetFlags();
    await db
      .update(projects)
      .set({
        status: "COMPLETED",
        actualGoLiveDate: new Date("2026-03-02T12:00:00.000Z"),
        startDate: new Date("2026-01-05T12:00:00.000Z"),
        initialGoLiveDate: new Date("2026-03-02T12:00:00.000Z"),
        excludeFromAnalytics: false,
      })
      .where(eq(projects.id, fixture.projects.a));

    const included = await listCompletedForAnalysis();
    expect(included.some((r) => r.id === fixture.projects.a)).toBe(true);
    const cycleBefore = await cycleTimeStats();
    expect(cycleBefore.completed).toBeGreaterThanOrEqual(1);

    await db
      .update(projects)
      .set({ excludeFromAnalytics: true })
      .where(eq(projects.id, fixture.projects.a));

    const skipped = await listCompletedForAnalysis();
    expect(skipped.some((r) => r.id === fixture.projects.a)).toBe(false);
    const cycleAfter = await cycleTimeStats();
    expect(cycleAfter.completed).toBe(cycleBefore.completed - 1);

    await resetFlags();
  });

  it("does not count excluded project hours in team capacity", async () => {
    await resetFlags();
    const before = await teamCapacity();
    const specBefore = before.find((s) => s.id === fixture.actors.specialist.id);
    const ledBefore = specBefore?.projectsLed ?? 0;

    await db
      .update(projects)
      .set({ excludeFromAnalytics: true, leadId: fixture.actors.specialist.id })
      .where(eq(projects.id, fixture.projects.a));

    const after = await teamCapacity();
    const specAfter = after.find((s) => s.id === fixture.actors.specialist.id);
    expect((specAfter?.projectsLed ?? 0)).toBe(ledBefore - 1);

    await resetFlags();
  });
});
