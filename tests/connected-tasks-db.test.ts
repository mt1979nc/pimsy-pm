import { describe, it, expect, beforeAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customerAccounts, phases, projects, tasks, users } from "@/db/schema";
import { resetDb } from "./fixtures";
import { syncConnectedTaskStatus } from "@/lib/connected-task-sync";
import { setTaskNotApplicable } from "@/lib/playbook";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbOk)("connected task status sync (postgres)", () => {
  let projectId: string;
  let discoveryId: string;
  let billingId: string;

  beforeAll(async () => {
    await resetDb();
    const [acct] = await db
      .insert(customerAccounts)
      .values({ name: "Connected Clinic", slug: "connected-clinic" })
      .returning({ id: customerAccounts.id });
    const [lead] = await db
      .insert(users)
      .values({ email: "lead@pimsyehr.com", name: "Lee", role: "SPECIALIST" })
      .returning({ id: users.id });
    const [project] = await db
      .insert(projects)
      .values({
        name: "Connected EHR",
        code: "IMP-CONN",
        customerAccountId: acct.id,
        leadId: lead.id,
        portalEnabled: true,
      })
      .returning({ id: projects.id });
    projectId = project.id;
    const [discovery, billing] = await db
      .insert(phases)
      .values([
        { projectId, name: "Discovery", order: 0, visibility: "SHARED" },
        { projectId, name: "Billing Configuration", order: 1, visibility: "INTERNAL" },
      ])
      .returning({ id: phases.id });
    const [discTask, billTask] = await db
      .insert(tasks)
      .values([
        {
          projectId,
          phaseId: discovery.id,
          title: "Billing Questionnaire",
          ownerSide: "CUSTOMER",
          visibility: "SHARED",
          connectKey: "billing_questionnaire",
          overlapKey: "billing_questionnaire",
          order: 0,
        },
        {
          projectId,
          phaseId: billing.id,
          title: "Billing Questionnaire",
          ownerSide: "INTERNAL",
          visibility: "INTERNAL",
          connectKey: "billing_questionnaire",
          overlapKey: "billing_questionnaire",
          order: 0,
        },
      ])
      .returning({ id: tasks.id });
    discoveryId = discTask.id;
    billingId = billTask.id;
  });

  it("completing Discovery reflects on Billing Configuration", async () => {
    const when = new Date("2026-09-16T15:00:00Z");
    const synced = await syncConnectedTaskStatus({
      projectId,
      taskId: discoveryId,
      connectKey: "billing_questionnaire",
      status: "DONE",
      completedAt: when,
    });
    expect(synced).toContain(billingId);
    const peer = await db.query.tasks.findFirst({ where: eq(tasks.id, billingId) });
    expect(peer?.status).toBe("DONE");
    expect(peer?.completedAt?.toISOString()).toBe(when.toISOString());
  });

  it("reopening Billing Configuration reflects on Discovery", async () => {
    const synced = await syncConnectedTaskStatus({
      projectId,
      taskId: billingId,
      connectKey: "billing_questionnaire",
      status: "TODO",
      completedAt: null,
    });
    expect(synced).toContain(discoveryId);
    const peer = await db.query.tasks.findFirst({ where: eq(tasks.id, discoveryId) });
    expect(peer?.status).toBe("TODO");
    expect(peer?.completedAt).toBeNull();
  });

  it("N/A on one copy marks the connected copy N/A", async () => {
    await setTaskNotApplicable(discoveryId, true);
    const peer = await db.query.tasks.findFirst({ where: eq(tasks.id, billingId) });
    expect(peer?.notApplicable).toBe(true);
    await setTaskNotApplicable(discoveryId, false);
    const restored = await db.query.tasks.findFirst({ where: eq(tasks.id, billingId) });
    expect(restored?.notApplicable).toBe(false);
  });
});
