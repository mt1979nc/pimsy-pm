import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import { buildFixture } from "./fixtures";
import { applySupportHandoffOnComplete } from "@/lib/support-handoff";
import { SUPPORT_HANDOFF_EMAIL, SUPPORT_HANDOFF_EMPTY_NOTE, SUPPORT_HANDOFF_TASK_TITLE } from "@/lib/support-handoff-meta";
import { listProjects, portfolioSummary } from "@/lib/queries";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbOk)("Hand off to Support complete → status + email (postgres)", () => {
  let fixture: Awaited<ReturnType<typeof buildFixture>>;
  let handoffTaskId: string;

  beforeAll(async () => {
    fixture = await buildFixture();
    await db
      .update(projects)
      .set({ status: "IN_PROGRESS", onboarded: false, supportHandoffAt: null })
      .where(eq(projects.id, fixture.projects.a));

    const [row] = await db
      .insert(tasks)
      .values({
        projectId: fixture.projects.a,
        phaseId: fixture.phases.shared,
        title: SUPPORT_HANDOFF_TASK_TITLE,
        description: "Follow up on ClaimMD enrollment for the commercial payer list.",
        visibility: "INTERNAL",
        ownerSide: "INTERNAL",
        order: 40,
      })
      .returning({ id: tasks.id });
    handoffTaskId = row.id;
  });

  it("emails Kori, marks COMPLETED, and drops the site from active projects", async () => {
    const sent: Array<{ to: unknown; subject: string; text?: string; html: string }> = [];
    const before = await portfolioSummary(fixture.actors.manager);

    const result = await applySupportHandoffOnComplete({
      projectId: fixture.projects.a,
      taskId: handoffTaskId,
      taskTitle: SUPPORT_HANDOFF_TASK_TITLE,
      taskDescription: "Follow up on ClaimMD enrollment for the commercial payer list.",
      actor: fixture.actors.specialist,
      send: async (args) => {
        sent.push(args);
        return { id: "test-mail", skipped: true as const };
      },
    });

    expect(result.applied).toBe(true);
    if (!result.applied) throw new Error("expected handoff to apply");
    expect(result.to).toBe(SUPPORT_HANDOFF_EMAIL);
    expect(result.outstandingListed).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(SUPPORT_HANDOFF_EMAIL);
    expect(sent[0]?.text).toContain("ClaimMD enrollment");
    expect(sent[0]?.text).not.toContain(SUPPORT_HANDOFF_EMPTY_NOTE);

    const after = await db.query.projects.findFirst({
      where: eq(projects.id, fixture.projects.a),
      columns: { status: true, onboarded: true, supportHandoffAt: true, actualGoLiveDate: true },
    });
    expect(after?.status).toBe("COMPLETED");
    expect(after?.onboarded).toBe(true);
    expect(after?.supportHandoffAt).toBeTruthy();
    expect(after?.actualGoLiveDate).toBeTruthy();

    const active = await listProjects(fixture.actors.manager, { openOnly: true });
    expect(active.some((p) => p.id === fixture.projects.a)).toBe(false);

    const completed = await listProjects(fixture.actors.manager, { status: "COMPLETED" });
    expect(completed.some((p) => p.id === fixture.projects.a)).toBe(true);

    const summary = await portfolioSummary(fixture.actors.manager);
    expect(summary.active).toBe(before.active - 1);
  });

  it("does not re-email Kori when completed again", async () => {
    const sent: unknown[] = [];
    const result = await applySupportHandoffOnComplete({
      projectId: fixture.projects.a,
      taskId: handoffTaskId,
      taskTitle: SUPPORT_HANDOFF_TASK_TITLE,
      taskDescription: "A second note that must not be mailed.",
      actor: fixture.actors.specialist,
      send: async (args) => {
        sent.push(args);
        return { id: "should-not-send", skipped: true as const };
      },
    });
    expect(result).toMatchObject({ applied: false, reason: "already-handed-off" });
    expect(sent).toHaveLength(0);
  });

  it("does not hand off a different task", async () => {
    await db
      .update(projects)
      .set({
        status: "IN_PROGRESS",
        onboarded: false,
        supportHandoffAt: null,
        actualGoLiveDate: null,
      })
      .where(eq(projects.id, fixture.projects.b));

    const result = await applySupportHandoffOnComplete({
      projectId: fixture.projects.b,
      taskId: fixture.tasks.shared,
      taskTitle: "Shared: kickoff recording",
      taskDescription: "Should not email Support.",
      actor: fixture.actors.specialist,
      send: async () => {
        throw new Error("mailer must not run for a non-handoff task");
      },
    });
    expect(result).toMatchObject({ applied: false, reason: "not-handoff-task" });

    const row = await db.query.projects.findFirst({
      where: eq(projects.id, fixture.projects.b),
      columns: { status: true, supportHandoffAt: true },
    });
    expect(row?.status).toBe("IN_PROGRESS");
    expect(row?.supportHandoffAt).toBeNull();
  });

  it("still emails when the description is empty, with the empty-state note", async () => {
    await db
      .update(projects)
      .set({
        status: "IN_PROGRESS",
        onboarded: false,
        supportHandoffAt: null,
        actualGoLiveDate: null,
      })
      .where(eq(projects.id, fixture.projects.b));

    const [emptyTask] = await db
      .insert(tasks)
      .values({
        projectId: fixture.projects.b,
        title: SUPPORT_HANDOFF_TASK_TITLE,
        description: null,
        visibility: "INTERNAL",
        ownerSide: "INTERNAL",
        order: 41,
      })
      .returning({ id: tasks.id });

    const sent: Array<{ text?: string }> = [];
    const result = await applySupportHandoffOnComplete({
      projectId: fixture.projects.b,
      taskId: emptyTask.id,
      taskTitle: "Handoff to Support",
      taskDescription: null,
      actor: fixture.actors.manager,
      send: async (args) => {
        sent.push(args);
        return { id: "empty", skipped: true as const };
      },
    });
    expect(result.applied).toBe(true);
    if (!result.applied) throw new Error("expected empty-description handoff to apply");
    expect(result.outstandingListed).toBe(false);
    expect(sent[0]?.text).toContain(SUPPORT_HANDOFF_EMPTY_NOTE);

    const row = await db.query.projects.findFirst({
      where: eq(projects.id, fixture.projects.b),
      columns: { status: true, supportHandoffAt: true },
    });
    expect(row?.status).toBe("COMPLETED");
    expect(row?.supportHandoffAt).toBeTruthy();
  });
});
