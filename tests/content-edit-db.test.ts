import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { buildFixture, type Fixture } from "./fixtures";
import { taskComments, statusUpdates, risks, projects, users } from "@/db/schema";
import {
  editTaskCommentForActor,
  deleteTaskCommentForActor,
  editStatusUpdateForActor,
  deleteStatusUpdateForActor,
  editRiskForActor,
  deleteRiskForActor,
} from "@/lib/content-edit";
import { ForbiddenError } from "@/lib/authz";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbOk)("edit/delete comments, updates, risks (postgres)", () => {
  let f: Fixture;
  let ownerActor: Fixture["actors"]["specialist"];
  let commentId: string;
  let customerCommentId: string;
  let updateId: string;
  let riskId: string;

  beforeAll(async () => {
    f = await buildFixture();
    const [owner] = await db
      .insert(users)
      .values({ email: "owner-edit@pimsyehr.com", name: "Owner", role: "OWNER" })
      .returning({ id: users.id });
    ownerActor = { ...f.actors.specialist, id: owner.id, role: "OWNER", email: "owner-edit@pimsyehr.com" };

    const existing = await db.query.taskComments.findFirst({
      where: and(eq(taskComments.taskId, f.tasks.shared), eq(taskComments.visibility, "SHARED")),
    });
    commentId = existing!.id;

    const [customerComment] = await db
      .insert(taskComments)
      .values({
        taskId: f.tasks.shared,
        authorId: f.actors.customerA.id,
        body: "Customer note.",
        visibility: "SHARED",
      })
      .returning({ id: taskComments.id });
    customerCommentId = customerComment.id;

    const existingUpdate = await db.query.statusUpdates.findFirst({
      where: and(eq(statusUpdates.projectId, f.projects.a), eq(statusUpdates.visibility, "SHARED")),
    });
    updateId = existingUpdate!.id;

    const [risk] = await db
      .insert(risks)
      .values({
        projectId: f.projects.a,
        title: "Go-live date slip",
        description: "IT has not returned the VPN form.",
        severity: "HIGH",
        ownerId: f.actors.specialist.id,
      })
      .returning({ id: risks.id });
    riskId = risk.id;
  });

  it("author can edit comment text and sets editedAt; covering specialist cannot", async () => {
    await expect(
      editTaskCommentForActor(f.actors.otherSpecialist, commentId, "Hijack"),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await editTaskCommentForActor(f.actors.specialist, commentId, "Shared comment, corrected.");
    const row = await db.query.taskComments.findFirst({ where: eq(taskComments.id, commentId) });
    expect(row?.body).toBe("Shared comment, corrected.");
    expect(row?.editedAt).toBeTruthy();
  });

  it("owner/admin can edit a comment they did not author", async () => {
    await editTaskCommentForActor(ownerActor, commentId, "Owner corrected the note.");
    const row = await db.query.taskComments.findFirst({ where: eq(taskComments.id, commentId) });
    expect(row?.body).toBe("Owner corrected the note.");
  });

  it("customer can edit their own comment and cannot edit staff comments", async () => {
    await editTaskCommentForActor(f.actors.customerA, customerCommentId, "Customer note, edited.");
    const mine = await db.query.taskComments.findFirst({
      where: eq(taskComments.id, customerCommentId),
    });
    expect(mine?.body).toBe("Customer note, edited.");
    expect(mine?.editedAt).toBeTruthy();

    await expect(
      editTaskCommentForActor(f.actors.customerA, commentId, "Nope"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("author or admin can soft-delete a comment", async () => {
    await deleteTaskCommentForActor(f.actors.customerA, customerCommentId);
    const row = await db.query.taskComments.findFirst({
      where: eq(taskComments.id, customerCommentId),
    });
    expect(row?.deletedAt).toBeTruthy();
  });

  it("status update edit changes text and health, and can update project health", async () => {
    await expect(
      editStatusUpdateForActor(f.actors.otherSpecialist, updateId, {
        summary: "Hijack",
        health: "RED",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await editStatusUpdateForActor(f.actors.specialist, updateId, {
      summary: "Training slipped a week.",
      accomplished: "Config done",
      upcoming: "Make-up session",
      needsFromYou: "Confirm attendees",
      health: "RED",
    });
    const row = await db.query.statusUpdates.findFirst({ where: eq(statusUpdates.id, updateId) });
    expect(row?.summary).toBe("Training slipped a week.");
    expect(row?.health).toBe("RED");
    expect(row?.editedAt).toBeTruthy();
    const project = await db.query.projects.findFirst({ where: eq(projects.id, f.projects.a) });
    expect(project?.health).toBe("RED");
  });

  it("owner can delete a status update they did not author", async () => {
    await deleteStatusUpdateForActor(ownerActor, updateId);
    const row = await db.query.statusUpdates.findFirst({ where: eq(statusUpdates.id, updateId) });
    expect(row).toBeUndefined();
  });

  it("risk author can edit title, description, and severity; others cannot", async () => {
    await expect(
      editRiskForActor(f.actors.otherSpecialist, riskId, {
        title: "Hijack",
        severity: "CRITICAL",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await editRiskForActor(f.actors.specialist, riskId, {
      title: "VPN still outstanding",
      description: "Escalated to IT director.",
      severity: "CRITICAL",
    });
    const row = await db.query.risks.findFirst({ where: eq(risks.id, riskId) });
    expect(row?.title).toBe("VPN still outstanding");
    expect(row?.severity).toBe("CRITICAL");
    expect(row?.editedAt).toBeTruthy();
  });

  it("owner can delete a risk they do not own", async () => {
    await deleteRiskForActor(ownerActor, riskId);
    const row = await db.query.risks.findFirst({ where: eq(risks.id, riskId) });
    expect(row).toBeUndefined();
  });
});
