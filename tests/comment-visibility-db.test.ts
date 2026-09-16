import { describe, it, expect, beforeAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { taskComments } from "@/db/schema";
import { buildFixture } from "./fixtures";
import { portalPlan, type CustomerActor } from "@/lib/portal";
import {
  previewPortalPlan,
  previewPortalTask,
  previewPortalTaskComments,
} from "@/lib/portal-preview";
import { commentsForCustomerSurface } from "@/lib/comment-visibility";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbOk)("customer / Customer view task comments (postgres)", () => {
  let projectId: string;
  let sharedTaskId: string;
  let actor: CustomerActor;

  beforeAll(async () => {
    const f = await buildFixture();
    projectId = f.projects.a;
    sharedTaskId = f.tasks.shared;
    actor = f.actors.customerA;
  });

  it("portal plan comment counts are SHARED only", async () => {
    const plan = await portalPlan(actor, projectId);
    const task = plan.phases.flatMap((p) => p.tasks).find((t) => t.id === sharedTaskId);
    expect(task).toBeTruthy();
    expect(task?.comments.map((c) => c.id)).toHaveLength(1);

    const all = await db.query.taskComments.findMany({
      where: eq(taskComments.taskId, sharedTaskId),
    });
    expect(all.some((c) => c.visibility === "INTERNAL")).toBe(true);
    expect(all.some((c) => c.visibility === "SHARED")).toBe(true);
  });

  it("Customer view preview matches portal SHARED comments and hides INTERNAL", async () => {
    const preview = await previewPortalPlan(projectId);
    const task = preview.phases.flatMap((p) => p.tasks).find((t) => t.id === sharedTaskId);
    expect(task?.comments).toHaveLength(1);

    const visible = await previewPortalTask(projectId, sharedTaskId);
    expect(visible?.id).toBe(sharedTaskId);

    const comments = await previewPortalTaskComments(sharedTaskId);
    expect(comments.map((c) => c.body)).toEqual(["Shared comment the customer should read."]);
    expect(comments.every((c) => c.visibility === "SHARED")).toBe(true);
    expect(commentsForCustomerSurface(comments)).toHaveLength(1);
  });
});
