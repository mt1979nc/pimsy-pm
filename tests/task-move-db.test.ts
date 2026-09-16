import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { phases, tasks } from "@/db/schema";
import { buildFixture } from "./fixtures";
import { applyTaskMove } from "@/lib/task-relink";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbOk)("live task move across phase and parent (postgres)", () => {
  let projectId: string;
  let discoveryId: string;
  let configId: string;
  let userSetupId: string;
  let createUsersId: string;
  let userCodesId: string;
  let siteConfigId: string;
  let orgDetailsId: string;
  let followUpId: string;

  beforeAll(async () => {
    const f = await buildFixture();
    projectId = f.projects.a;
    discoveryId = f.phases.shared;

    const [config] = await db
      .insert(phases)
      .values({
        projectId,
        name: "Configuration",
        order: 2,
        visibility: "SHARED",
        workTrack: "EHR",
      })
      .returning({ id: phases.id });
    configId = config.id;

    const [userSetup] = await db
      .insert(tasks)
      .values({
        projectId,
        phaseId: discoveryId,
        title: "User Setup",
        visibility: "SHARED",
        ownerSide: "INTERNAL",
        workTrack: "EHR",
        order: 20,
      })
      .returning({ id: tasks.id });
    userSetupId = userSetup.id;

    const [createUsers] = await db
      .insert(tasks)
      .values({
        projectId,
        phaseId: discoveryId,
        parentTaskId: userSetupId,
        title: "Create Users",
        visibility: "INTERNAL",
        ownerSide: "INTERNAL",
        workTrack: "EHR",
        order: 21,
      })
      .returning({ id: tasks.id });
    createUsersId = createUsers.id;

    const [followUp] = await db
      .insert(tasks)
      .values({
        projectId,
        phaseId: discoveryId,
        parentTaskId: createUsersId,
        title: "Schedule follow-up",
        visibility: "INTERNAL",
        ownerSide: "INTERNAL",
        workTrack: "EHR",
        order: 23,
      })
      .returning({ id: tasks.id });
    followUpId = followUp.id;

    const [userCodes] = await db
      .insert(tasks)
      .values({
        projectId,
        phaseId: discoveryId,
        parentTaskId: userSetupId,
        title: "User Codes / Rates",
        visibility: "INTERNAL",
        ownerSide: "INTERNAL",
        workTrack: "EHR",
        order: 22,
      })
      .returning({ id: tasks.id });
    userCodesId = userCodes.id;

    const [siteConfig] = await db
      .insert(tasks)
      .values({
        projectId,
        phaseId: configId,
        title: "Site Configuration",
        visibility: "SHARED",
        ownerSide: "INTERNAL",
        workTrack: "EHR",
        order: 30,
      })
      .returning({ id: tasks.id });
    siteConfigId = siteConfig.id;

    const [orgDetails] = await db
      .insert(tasks)
      .values({
        projectId,
        phaseId: configId,
        parentTaskId: siteConfigId,
        title: "Org details",
        visibility: "SHARED",
        ownerSide: "CUSTOMER",
        workTrack: "EHR",
        order: 31,
      })
      .returning({ id: tasks.id });
    orgDetailsId = orgDetails.id;
  });

  it("moves a sub-task under a parent in another section", async () => {
    const result = await applyTaskMove({
      taskId: createUsersId,
      toPhaseId: configId,
      toParentTaskId: siteConfigId,
    });
    expect(result.unchanged).toBe(false);
    expect(result.toPhaseId).toBe(configId);
    expect(result.toParentTaskId).toBe(siteConfigId);

    const moved = await db.query.tasks.findFirst({ where: eq(tasks.id, createUsersId) });
    expect(moved?.phaseId).toBe(configId);
    expect(moved?.parentTaskId).toBe(siteConfigId);

    const grandchild = await db.query.tasks.findFirst({ where: eq(tasks.id, followUpId) });
    expect(grandchild?.phaseId).toBe(configId);
    expect(grandchild?.parentTaskId).toBe(createUsersId);

    const leftover = await db.query.tasks.findFirst({ where: eq(tasks.id, userCodesId) });
    expect(leftover?.parentTaskId).toBe(userSetupId);
    expect(leftover?.phaseId).toBe(discoveryId);
  });

  it("moves a parent to another section as top-level and keeps remaining children with it", async () => {
    const result = await applyTaskMove({
      taskId: userSetupId,
      toPhaseId: configId,
      toParentTaskId: null,
    });
    expect(result.unchanged).toBe(false);
    expect(result.toParentTaskId).toBe(null);
    expect(result.movedCount).toBe(2);

    const parent = await db.query.tasks.findFirst({ where: eq(tasks.id, userSetupId) });
    expect(parent?.phaseId).toBe(configId);
    expect(parent?.parentTaskId).toBe(null);

    const child = await db.query.tasks.findFirst({ where: eq(tasks.id, userCodesId) });
    expect(child?.phaseId).toBe(configId);
    expect(child?.parentTaskId).toBe(userSetupId);

    const alreadyMoved = await db.query.tasks.findFirst({ where: eq(tasks.id, createUsersId) });
    expect(alreadyMoved?.parentTaskId).toBe(siteConfigId);
  });

  it("moves a top-level task under a different parent in the same section", async () => {
    const result = await applyTaskMove({
      taskId: userSetupId,
      toPhaseId: configId,
      toParentTaskId: siteConfigId,
    });
    expect(result.toParentTaskId).toBe(siteConfigId);

    const nested = await db.query.tasks.findFirst({ where: eq(tasks.id, userSetupId) });
    expect(nested?.parentTaskId).toBe(siteConfigId);
    expect(nested?.phaseId).toBe(configId);

    const child = await db.query.tasks.findFirst({ where: eq(tasks.id, userCodesId) });
    expect(child?.parentTaskId).toBe(userSetupId);
    expect(child?.phaseId).toBe(configId);
  });

  it("rejects nesting a task under its own descendant", async () => {
    await expect(
      applyTaskMove({
        taskId: siteConfigId,
        toPhaseId: configId,
        toParentTaskId: orgDetailsId,
      }),
    ).rejects.toThrow(/itself or one of its sub-tasks/);
  });

  it("no-ops when section and parent are unchanged", async () => {
    const result = await applyTaskMove({
      taskId: createUsersId,
      toPhaseId: configId,
      toParentTaskId: siteConfigId,
    });
    expect(result.unchanged).toBe(true);
  });
});
