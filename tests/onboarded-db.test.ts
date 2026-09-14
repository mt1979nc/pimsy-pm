import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import { buildFixture } from "./fixtures";
import { myTasks, portfolioSummary, attentionProjects } from "@/lib/queries";
import { completeHistoricalProjectOnTime } from "@/lib/historical-complete";
import { utcDayKey } from "@/lib/dates";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbOk)("Onboarded + historical complete (postgres)", () => {
  let fixture: Awaited<ReturnType<typeof buildFixture>>;
  const overdue = new Date("2026-01-15T12:00:00.000Z");

  beforeAll(async () => {
    fixture = await buildFixture();
    await db
      .update(tasks)
      .set({
        assigneeId: fixture.actors.specialist.id,
        dueDate: overdue,
        status: "TODO",
      })
      .where(eq(tasks.id, fixture.tasks.shared));
    await db.update(projects).set({ health: "YELLOW" }).where(eq(projects.id, fixture.projects.a));
  });

  it("excludes onboarded sites from overdue / my-work overview but not the hub query", async () => {
    const manager = fixture.actors.manager;
    const specialist = fixture.actors.specialist;

    const before = await portfolioSummary(manager);
    expect(before.overdueTasks).toBeGreaterThanOrEqual(1);
    const mineBefore = await myTasks(specialist);
    expect(mineBefore.some((t) => t.id === fixture.tasks.shared)).toBe(true);

    const attentionBefore = await attentionProjects(manager, 20);
    expect(attentionBefore.some((p) => p.id === fixture.projects.a)).toBe(true);

    await db.update(projects).set({ onboarded: true }).where(eq(projects.id, fixture.projects.a));

    const after = await portfolioSummary(manager);
    expect(after.overdueTasks).toBe(before.overdueTasks - 1);

    const mineAfter = await myTasks(specialist);
    expect(mineAfter.some((t) => t.id === fixture.tasks.shared)).toBe(false);

    const attention = await attentionProjects(manager, 20);
    expect(attention.some((p) => p.id === fixture.projects.a)).toBe(false);

    const hub = await db.query.tasks.findMany({
      where: and(eq(tasks.projectId, fixture.projects.a), ne(tasks.status, "CANCELLED")),
    });
    expect(hub.some((t) => t.id === fixture.tasks.shared && t.status === "TODO")).toBe(true);

    await db.update(projects).set({ onboarded: false }).where(eq(projects.id, fixture.projects.a));
  });

  it("marks historical tasks complete on time when gated, and refuses active WIP", async () => {
    await db
      .update(projects)
      .set({
        status: "IN_PROGRESS",
        onboarded: false,
        startDate: new Date("2026-01-05T12:00:00.000Z"),
        targetGoLiveDate: new Date("2026-03-02T12:00:00.000Z"),
        actualGoLiveDate: null,
      })
      .where(eq(projects.id, fixture.projects.a));

    const refused = await completeHistoricalProjectOnTime(fixture.projects.a, { apply: true });
    expect(refused.assessment.ok).toBe(false);
    expect(refused.applied).toBe(0);

    await db
      .update(projects)
      .set({
        status: "COMPLETED",
        actualGoLiveDate: new Date("2026-03-02T12:00:00.000Z"),
      })
      .where(eq(projects.id, fixture.projects.a));

    const dry = await completeHistoricalProjectOnTime(fixture.projects.a, { apply: false });
    expect(dry.assessment.ok).toBe(true);
    expect(dry.applied).toBe(0);
    expect(dry.planned.length).toBeGreaterThan(0);

    const applied = await completeHistoricalProjectOnTime(fixture.projects.a, { apply: true });
    expect(applied.applied).toBe(applied.planned.length);

    const shared = await db.query.tasks.findFirst({ where: eq(tasks.id, fixture.tasks.shared) });
    expect(shared?.status).toBe("DONE");
    expect(shared?.completedAt).toBeTruthy();
    expect(utcDayKey(shared!.completedAt!)).toBe("2026-01-15");
    expect(shared!.completedAt!.getTime()).toBeLessThanOrEqual(overdue.getTime());
  });
});
