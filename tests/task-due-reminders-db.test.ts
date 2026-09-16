import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  customerAccounts,
  users,
  projects,
  phases,
  tasks,
  notifications,
} from "@/db/schema";
import { resetDb } from "./fixtures";
import { addAssigneesToTask } from "@/lib/task-assignees";
import { runTaskDueReminders } from "@/lib/run-task-due-reminders";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbOk)("assignee due reminders (postgres)", () => {
  let specialistId = "";
  let billingId = "";
  let leadId = "";
  let billingContactId = "";
  let projectId = "";
  let kickoffId = "";
  let billingQId = "";
  let logosId = "";

  const now = new Date("2026-09-16T15:00:00.000Z");
  const dueToday = new Date("2026-09-16T16:00:00.000Z");
  const dueLater = new Date("2026-09-25T16:00:00.000Z");

  beforeAll(async () => {
    await resetDb();
    const [acct] = await db
      .insert(customerAccounts)
      .values({ name: "Harbor Clinic", slug: "harbor-due" })
      .returning({ id: customerAccounts.id });

    const [spec, bill, lead, billingC] = await db
      .insert(users)
      .values([
        { email: "sam@pimsyehr.com", name: "Sam", role: "SPECIALIST" },
        { email: "anna@pimsyehr.com", name: "Anna", role: "MEMBER", staffingRole: "T1_BILLING_SUPPORT" },
        {
          email: "pat@harbor.example.com",
          name: "Pat",
          role: "CUSTOMER",
          customerAccountId: acct.id,
        },
        {
          email: "lee@harbor.example.com",
          name: "Lee",
          role: "CUSTOMER",
          customerAccountId: acct.id,
        },
      ])
      .returning({ id: users.id });
    specialistId = spec.id;
    billingId = bill.id;
    leadId = lead.id;
    billingContactId = billingC.id;

    const [project] = await db
      .insert(projects)
      .values({
        name: "Harbor EHR",
        code: "IMP-A015",
        customerAccountId: acct.id,
        portalEnabled: true,
        status: "IN_PROGRESS",
      })
      .returning({ id: projects.id });
    projectId = project.id;

    const [phase] = await db
      .insert(phases)
      .values({ projectId, name: "Discovery", order: 0, visibility: "SHARED" })
      .returning({ id: phases.id });

    const [kickoff, billingQ, logos] = await db
      .insert(tasks)
      .values([
        {
          projectId,
          phaseId: phase.id,
          title: "Schedule Kickoff",
          ownerSide: "INTERNAL",
          visibility: "INTERNAL",
          dueDate: dueToday,
          order: 0,
        },
        {
          projectId,
          phaseId: phase.id,
          title: "Billing Questionnaire",
          ownerSide: "CUSTOMER",
          visibility: "SHARED",
          dueDate: dueToday,
          order: 1,
        },
        {
          projectId,
          phaseId: phase.id,
          title: "Upload Company Logo(s)",
          ownerSide: "CUSTOMER",
          visibility: "SHARED",
          dueDate: dueLater,
          order: 2,
        },
      ])
      .returning({ id: tasks.id });
    kickoffId = kickoff.id;
    billingQId = billingQ.id;
    logosId = logos.id;

    await addAssigneesToTask({
      taskId: kickoffId,
      userIds: [specialistId],
      source: "AUTO_ROLE",
    });
    await addAssigneesToTask({
      taskId: billingQId,
      userIds: [leadId, billingContactId, billingId],
      source: "AUTO_ROLE",
    });
    await addAssigneesToTask({
      taskId: logosId,
      userIds: [leadId],
      source: "AUTO_ROLE",
    });
  });

  it("notifies every assignee on due-soon tasks, including billing questionnaire co-owners", async () => {
    const first = await runTaskDueReminders(now);
    expect(first.scannedTasks).toBe(2);
    expect(first.notificationsCreated).toBe(4);

    const rows = await db.query.notifications.findMany({
      where: eq(notifications.type, "TASK_DUE_SOON"),
    });
    const byUser = new Map(rows.map((r) => [r.userId, r]));
    expect(byUser.get(specialistId)?.title).toMatch(/Schedule Kickoff/);
    expect(byUser.get(leadId)?.title).toMatch(/Billing Questionnaire/);
    expect(byUser.get(billingContactId)?.title).toMatch(/Billing Questionnaire/);
    expect(byUser.get(billingId)?.title).toMatch(/Billing Questionnaire/);
    expect(rows.some((r) => r.title.includes("Logo"))).toBe(false);
    expect(byUser.get(leadId)?.linkUrl).toMatch(/^\/portal\//);
    expect(byUser.get(specialistId)?.linkUrl).toMatch(/^\/projects\//);
  });

  it("does not re-notify inside the cooldown window", async () => {
    const second = await runTaskDueReminders(now);
    expect(second.notificationsCreated).toBe(0);
    const count = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(eq(notifications.type, "TASK_DUE_SOON"));
    expect(Number(count[0]?.n)).toBe(4);
  });
});
