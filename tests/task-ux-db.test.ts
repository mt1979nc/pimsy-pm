import { describe, it, expect, beforeAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { buildFixture } from "./fixtures";
import { portalPlan, type CustomerActor } from "@/lib/portal";
import { previewPortalPlan } from "@/lib/portal-preview";
import { isSpecialistSubtask } from "@/lib/task-visibility";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbOk)("live task add/remove and parent vs specialist-sub visibility (postgres)", () => {
  let projectId: string;
  let phaseId: string;
  let actor: CustomerActor;
  let userSetupId: string;
  let createUsersId: string;
  let extraSubId: string;

  beforeAll(async () => {
    const f = await buildFixture();
    projectId = f.projects.a;
    phaseId = f.phases.shared;
    actor = f.actors.customerA;

    const [userSetup] = await db
      .insert(tasks)
      .values({
        projectId,
        phaseId,
        title: "User Setup",
        visibility: "SHARED",
        ownerSide: "INTERNAL",
        order: 10,
      })
      .returning({ id: tasks.id });
    userSetupId = userSetup.id;

    const [createUsers] = await db
      .insert(tasks)
      .values({
        projectId,
        phaseId,
        parentTaskId: userSetupId,
        title: "Create Users",
        visibility: "SHARED",
        ownerSide: "INTERNAL",
        order: 11,
      })
      .returning({ id: tasks.id });
    createUsersId = createUsers.id;

    await db.insert(tasks).values({
      projectId,
      phaseId,
      parentTaskId: userSetupId,
      title: "User Codes / Rates",
      visibility: "INTERNAL",
      ownerSide: "INTERNAL",
      order: 12,
    });

    await db.insert(tasks).values({
      projectId,
      phaseId,
      parentTaskId: userSetupId,
      title: "Schedule follow-up",
      visibility: "SHARED",
      ownerSide: "CUSTOMER",
      order: 13,
    });
  });

  it("portal and customer-shared view see parent status, not specialist subs", async () => {
    const plan = await portalPlan(actor, projectId);
    const discovery = plan.phases.find((p) => p.id === phaseId);
    const titles = discovery?.tasks.map((t) => t.title) ?? [];

    expect(titles).toContain("User Setup");
    expect(titles).toContain("Schedule follow-up");
    expect(titles).not.toContain("Create Users");
    expect(titles).not.toContain("User Codes / Rates");

    const preview = await previewPortalPlan(projectId);
    const previewDiscovery = preview.phases.find((p) => p.id === phaseId);
    const previewTitles = previewDiscovery?.tasks.map((t) => t.title) ?? [];
    expect(previewTitles).toContain("User Setup");
    expect(previewTitles).not.toContain("Create Users");

    const staffRows = await db.query.tasks.findMany({ where: eq(tasks.projectId, projectId) });
    expect(staffRows.some((t) => t.title === "Create Users" && isSpecialistSubtask(t))).toBe(true);
    expect(staffRows.some((t) => t.title === "User Codes / Rates" && isSpecialistSubtask(t))).toBe(
      true,
    );
  });

  it("adding a specialist sub-task keeps it off the portal", async () => {
    const [extra] = await db
      .insert(tasks)
      .values({
        projectId,
        phaseId,
        parentTaskId: userSetupId,
        title: "Extra specialist check",
        visibility: "INTERNAL",
        ownerSide: "INTERNAL",
        order: 14,
      })
      .returning({ id: tasks.id });
    extraSubId = extra.id;

    const staff = await db.query.tasks.findMany({ where: eq(tasks.projectId, projectId) });
    expect(staff.some((t) => t.id === extraSubId && t.parentTaskId === userSetupId)).toBe(true);

    const plan = await portalPlan(actor, projectId);
    const titles = plan.phases.flatMap((p) => p.tasks.map((t) => t.title));
    expect(titles).not.toContain("Extra specialist check");
    expect(titles).toContain("User Setup");
  });

  it("removing a live task (and nested specialist children) does not resurrect them in the portal", async () => {
    await db.delete(tasks).where(eq(tasks.id, extraSubId));
    await db.delete(tasks).where(eq(tasks.id, createUsersId));

    const staff = await db.query.tasks.findMany({ where: eq(tasks.projectId, projectId) });
    expect(staff.some((t) => t.id === extraSubId)).toBe(false);
    expect(staff.some((t) => t.id === createUsersId)).toBe(false);
    expect(staff.some((t) => t.id === userSetupId)).toBe(true);

    const plan = await portalPlan(actor, projectId);
    const titles = plan.phases.flatMap((p) => p.tasks.map((t) => t.title));
    expect(titles).toContain("User Setup");
    expect(titles).not.toContain("Create Users");
    expect(titles).not.toContain("Extra specialist check");
  });
});
