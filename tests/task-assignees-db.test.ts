import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  customerAccounts,
  users,
  projects,
  projectMembers,
  phases,
  tasks,
  taskAssignees,
  notifications,
} from "@/db/schema";
import { resetDb } from "./fixtures";
import { autoAssignForProjectRole, addAssigneesToTask, taskAssigneeIds, notifyDefaultAssigneesForProject } from "@/lib/task-assignees";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbOk)("multi-assignee + role auto-assign (postgres)", () => {
  let specialistId = "";
  let billingId = "";
  let leadContactId = "";
  let billingContactId = "";
  let teammateId = "";
  let projectId = "";
  let kickoffId = "";
  let claimmdId = "";
  let logosId = "";
  let billingQId = "";

  beforeAll(async () => {
    await resetDb();
    const [acct] = await db
      .insert(customerAccounts)
      .values({ name: "Harbor Clinic", slug: "harbor-auto" })
      .returning({ id: customerAccounts.id });

    const [spec, bill, lead, billingC, teammate] = await db
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
          title: "Billing manager",
        },
        {
          email: "jo@harbor.example.com",
          name: "Jo",
          role: "CUSTOMER",
          customerAccountId: acct.id,
        },
      ])
      .returning({ id: users.id });
    specialistId = spec.id;
    billingId = bill.id;
    leadContactId = lead.id;
    billingContactId = billingC.id;
    teammateId = teammate.id;

    const [project] = await db
      .insert(projects)
      .values({
        name: "Harbor EHR",
        code: "IMP-A014",
        customerAccountId: acct.id,
        portalEnabled: true,
      })
      .returning({ id: projects.id });
    projectId = project.id;

    const [kickoffPhase, discoveryPhase] = await db
      .insert(phases)
      .values([
        { projectId, name: "Kickoff", order: 0, visibility: "SHARED" },
        { projectId, name: "Discovery", order: 1, visibility: "SHARED" },
      ])
      .returning({ id: phases.id });

    const [kickoff, claimmd, logos, billingQ] = await db
      .insert(tasks)
      .values([
        {
          projectId,
          phaseId: kickoffPhase.id,
          title: "Schedule Kickoff",
          ownerSide: "INTERNAL",
          visibility: "INTERNAL",
          defaultRole: "IMPLEMENTATION_SPECIALIST",
          order: 0,
        },
        {
          projectId,
          phaseId: discoveryPhase.id,
          title: "ClaimMD Enrollment",
          ownerSide: "INTERNAL",
          visibility: "INTERNAL",
          defaultRole: "T1_BILLING_SUPPORT",
          overlapKey: "claimmd_enrollment",
          order: 1,
        },
        {
          projectId,
          phaseId: discoveryPhase.id,
          title: "Upload Company Logo(s)",
          ownerSide: "CUSTOMER",
          visibility: "SHARED",
          order: 2,
        },
        {
          projectId,
          phaseId: discoveryPhase.id,
          title: "Billing Questionnaire",
          ownerSide: "CUSTOMER",
          visibility: "SHARED",
          overlapKey: "billing_questionnaire",
          order: 3,
        },
      ])
      .returning({ id: tasks.id });
    kickoffId = kickoff.id;
    claimmdId = claimmd.id;
    logosId = logos.id;
    billingQId = billingQ.id;
  });

  it("assigns the specialist to every PIMSY (internal) task, including billing", async () => {
    const n = await autoAssignForProjectRole({
      projectId,
      userId: specialistId,
      role: "IMPLEMENTATION_SPECIALIST",
      notify: false,
    });
    expect(n).toBe(2);
    expect(await taskAssigneeIds(kickoffId)).toContain(specialistId);
    expect(await taskAssigneeIds(claimmdId)).toContain(specialistId);
    expect(await taskAssigneeIds(logosId)).not.toContain(specialistId);
  });

  it("adds billing support to billing staff tasks and the customer questionnaire without wiping the specialist", async () => {
    const n = await autoAssignForProjectRole({
      projectId,
      userId: billingId,
      role: "T1_BILLING_SUPPORT",
      notify: false,
    });
    expect(n).toBe(2);
    const claimmd = await taskAssigneeIds(claimmdId);
    expect(claimmd).toContain(specialistId);
    expect(claimmd).toContain(billingId);
    expect(await taskAssigneeIds(kickoffId)).not.toContain(billingId);
    expect(await taskAssigneeIds(billingQId)).toContain(billingId);
    expect(await taskAssigneeIds(logosId)).not.toContain(billingId);
  });

  it("assigns the customer project lead to all customer-facing tasks", async () => {
    const n = await autoAssignForProjectRole({
      projectId,
      userId: leadContactId,
      role: "CUSTOMER_PROJECT_LEAD",
      notify: false,
    });
    expect(n).toBe(2);
    expect(await taskAssigneeIds(logosId)).toContain(leadContactId);
    expect(await taskAssigneeIds(billingQId)).toContain(leadContactId);
    expect(await taskAssigneeIds(kickoffId)).not.toContain(leadContactId);
  });

  it("adds the customer billing contact to billing customer tasks and keeps the lead", async () => {
    const n = await autoAssignForProjectRole({
      projectId,
      userId: billingContactId,
      role: "CUSTOMER_BILLING",
      notify: false,
    });
    expect(n).toBe(1);
    const billing = await taskAssigneeIds(billingQId);
    expect(billing).toContain(leadContactId);
    expect(billing).toContain(billingContactId);
    expect(billing).toContain(billingId);
    expect(await taskAssigneeIds(logosId)).not.toContain(billingContactId);
  });

  it("adds a second specialist without replacing the first (additive)", async () => {
    const [extra] = await db
      .insert(users)
      .values({ email: "morgan@pimsyehr.com", name: "Morgan", role: "SPECIALIST" })
      .returning({ id: users.id });
    await db.insert(projectMembers).values({
      projectId,
      userId: extra.id,
      role: "IMPLEMENTATION_SPECIALIST",
    });
    const added = await autoAssignForProjectRole({
      projectId,
      userId: extra.id,
      role: "IMPLEMENTATION_SPECIALIST",
      notify: false,
    });
    expect(added).toBeGreaterThan(0);
    expect(await taskAssigneeIds(kickoffId)).toContain(extra.id);
    expect(await taskAssigneeIds(kickoffId)).toContain(specialistId);
  });

  it("supports more than one assignee via the join table", async () => {
    await addAssigneesToTask({
      taskId: logosId,
      userIds: [teammateId],
      source: "MANUAL",
    });
    const ids = await taskAssigneeIds(logosId);
    expect(ids).toContain(leadContactId);
    expect(ids).toContain(teammateId);
    const rows = await db.query.taskAssignees.findMany({
      where: eq(taskAssignees.taskId, logosId),
    });
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it("sends one TASK_ASSIGNED summary per AUTO_ROLE assignee on the site (P1-G)", async () => {
    const n = await notifyDefaultAssigneesForProject({ projectId });
    expect(n).toBeGreaterThanOrEqual(4);
    const assigned = await db.query.notifications.findMany({
      where: eq(notifications.type, "TASK_ASSIGNED"),
    });
    const people = new Set(assigned.map((r) => r.userId));
    expect(people.has(specialistId)).toBe(true);
    expect(people.has(billingId)).toBe(true);
    expect(people.has(leadContactId)).toBe(true);
    expect(people.has(billingContactId)).toBe(true);
    expect(assigned.some((r) => /task/i.test(r.title))).toBe(true);
  });
});
