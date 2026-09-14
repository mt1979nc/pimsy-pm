import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  customerAccounts,
  users,
  projects,
  phases,
  tasks,
  projectMembers,
  slipEvents,
  messageThreads,
} from "@/db/schema";
import { resetDb } from "./fixtures";
import { hardDeleteCustomer, hardDeleteProject } from "@/lib/delete-records";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbOk)("delete cascade (postgres)", () => {
  let customerId = "";
  let projectId = "";
  let staffId = "";
  let contactId = "";
  let otherProjectId = "";

  beforeAll(async () => {
    await resetDb();
    const [acct] = await db
      .insert(customerAccounts)
      .values({ name: "Harbor Clinic", slug: "harbor-clinic" })
      .returning({ id: customerAccounts.id });
    customerId = acct.id;

    const [staff, contact] = await db
      .insert(users)
      .values([
        { email: "sam@pimsyehr.com", name: "Sam", role: "SPECIALIST" },
        {
          email: "pat@harbor.example.com",
          name: "Pat",
          role: "CUSTOMER",
          customerAccountId: customerId,
        },
      ])
      .returning({ id: users.id });
    staffId = staff.id;
    contactId = contact.id;

    const [project] = await db
      .insert(projects)
      .values({
        name: "Harbor EHR",
        code: "IMP-7777",
        customerAccountId: customerId,
        leadId: staffId,
        crmAcronym: "HARBOR",
        startDate: new Date("2026-09-01T12:00:00.000Z"),
        targetGoLiveDate: new Date("2026-11-01T12:00:00.000Z"),
      })
      .returning({ id: projects.id });
    projectId = project.id;

    const [phase] = await db
      .insert(phases)
      .values({ projectId, name: "Kickoff", order: 0 })
      .returning({ id: phases.id });
    await db.insert(tasks).values({
      projectId,
      phaseId: phase.id,
      title: "Send welcome",
      order: 0,
    });
    await db.insert(projectMembers).values({ projectId, userId: staffId, role: "LEAD" });
    await db.insert(slipEvents).values({
      projectId,
      fromDate: new Date("2026-10-01T12:00:00.000Z"),
      toDate: new Date("2026-11-01T12:00:00.000Z"),
      days: 31,
    });
    await db.insert(messageThreads).values({
      subject: "Kickoff notes",
      projectId,
      customerAccountId: customerId,
      createdById: staffId,
    });
  });

  it("hard-deletes a project and FK-cascades children without removing staff or the customer", async () => {
    await hardDeleteProject(projectId);
    expect(await db.query.projects.findFirst({ where: eq(projects.id, projectId) })).toBeUndefined();
    expect(await db.query.tasks.findMany({ where: eq(tasks.projectId, projectId) })).toEqual([]);
    expect(await db.query.phases.findMany({ where: eq(phases.projectId, projectId) })).toEqual([]);
    expect(await db.query.slipEvents.findMany({ where: eq(slipEvents.projectId, projectId) })).toEqual(
      [],
    );
    expect(await db.query.projectMembers.findMany({ where: eq(projectMembers.projectId, projectId) })).toEqual(
      [],
    );
    expect(
      await db.query.messageThreads.findMany({ where: eq(messageThreads.projectId, projectId) }),
    ).toEqual([]);
    const staff = await db.query.users.findFirst({ where: eq(users.id, staffId) });
    const contact = await db.query.users.findFirst({ where: eq(users.id, contactId) });
    expect(staff?.email).toBe("sam@pimsyehr.com");
    expect(contact?.email).toBe("pat@harbor.example.com");
    expect(await db.query.customerAccounts.findFirst({ where: eq(customerAccounts.id, customerId) }))
      .toBeTruthy();
  });

  it("hard-deletes a customer and cascaded leftover projects, keeping staff logins", async () => {
    const [leftover] = await db
      .insert(projects)
      .values({
        name: "Harbor leftover",
        code: "IMP-7778",
        customerAccountId: customerId,
        leadId: staffId,
      })
      .returning({ id: projects.id });
    otherProjectId = leftover.id;

    await hardDeleteCustomer(customerId);

    expect(
      await db.query.customerAccounts.findFirst({ where: eq(customerAccounts.id, customerId) }),
    ).toBeUndefined();
    expect(await db.query.projects.findFirst({ where: eq(projects.id, otherProjectId) })).toBeUndefined();
    expect(await db.query.users.findFirst({ where: eq(users.id, contactId) })).toBeUndefined();
    const staffAfter = await db.query.users.findFirst({ where: eq(users.id, staffId) });
    expect(staffAfter?.role).toBe("SPECIALIST");
  });
});
