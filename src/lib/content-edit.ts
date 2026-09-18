/**
 * Edit / delete for task comments, project updates, and risks.
 *
 * Permission: author, or OWNER/ADMIN (`canEditAuthoredRecord`).
 * No revision log — `editedAt` is a soft “edited” flag only.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { taskComments, statusUpdates, risks, projects, type Health, type RiskSeverity } from "@/db/schema";
import {
  assertProjectAccess,
  isCustomer,
  ForbiddenError,
  NotFoundError,
  type Actor,
} from "@/lib/authz";
import { canEditAuthoredRecord } from "@/lib/authored-content";
import { isSpecialistSubtask } from "@/lib/task-visibility";
import { audit } from "@/lib/audit";

const HEALTH: Health[] = ["GREEN", "YELLOW", "RED"];
const SEVERITY: RiskSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function requireAuthorOrAdmin(actor: Actor, authorId: string | null | undefined) {
  if (!canEditAuthoredRecord(actor, authorId)) {
    throw new ForbiddenError("Only the author or an owner/admin can change this.");
  }
}

async function loadLiveComment(commentId: string) {
  const comment = await db.query.taskComments.findFirst({
    where: eq(taskComments.id, commentId),
    with: {
      task: {
        columns: {
          id: true,
          projectId: true,
          visibility: true,
          ownerSide: true,
          parentTaskId: true,
          title: true,
        },
        with: { phase: { columns: { visibility: true, notApplicable: true } } },
      },
    },
  });
  if (!comment || comment.deletedAt) throw new NotFoundError("Comment not found.");
  return comment;
}

async function assertCommentAccess(
  actor: Actor,
  comment: Awaited<ReturnType<typeof loadLiveComment>>,
) {
  await assertProjectAccess(actor, comment.task.projectId);
  if (!isCustomer(actor)) return;
  if (
    comment.visibility === "INTERNAL" ||
    comment.task.visibility === "INTERNAL" ||
    isSpecialistSubtask(comment.task)
  ) {
    throw new NotFoundError("Comment not found.");
  }
  const phase = comment.task.phase;
  if (phase && (phase.visibility !== "SHARED" || phase.notApplicable)) {
    throw new NotFoundError("Comment not found.");
  }
}

export async function editTaskCommentForActor(actor: Actor, commentId: string, rawBody: string) {
  const body = rawBody.trim();
  if (!body) throw new Error("Write a comment first.");
  if (body.length > 10000) throw new Error("That comment is too long.");

  const comment = await loadLiveComment(commentId);
  await assertCommentAccess(actor, comment);
  requireAuthorOrAdmin(actor, comment.authorId);

  if (body !== comment.body) {
    await db
      .update(taskComments)
      .set({ body, editedAt: new Date() })
      .where(eq(taskComments.id, commentId));
    await audit({
      actor,
      action: "task.comment.edited",
      entityType: "task_comment",
      entityId: commentId,
      summary: comment.task.title,
      metadata: { projectId: comment.task.projectId, taskId: comment.taskId },
    });
  }

  return { projectId: comment.task.projectId, taskId: comment.taskId };
}

export async function deleteTaskCommentForActor(actor: Actor, commentId: string) {
  const comment = await loadLiveComment(commentId);
  await assertCommentAccess(actor, comment);
  requireAuthorOrAdmin(actor, comment.authorId);

  await db
    .update(taskComments)
    .set({ deletedAt: new Date() })
    .where(eq(taskComments.id, commentId));

  await audit({
    actor,
    action: "task.comment.deleted",
    entityType: "task_comment",
    entityId: commentId,
    summary: comment.task.title,
    metadata: { projectId: comment.task.projectId, taskId: comment.taskId },
  });

  return { projectId: comment.task.projectId, taskId: comment.taskId };
}

export type StatusUpdateEdit = {
  summary: string;
  accomplished?: string | null;
  upcoming?: string | null;
  needsFromYou?: string | null;
  health: Health;
};

export async function editStatusUpdateForActor(
  actor: Actor,
  updateId: string,
  patch: StatusUpdateEdit,
) {
  if (isCustomer(actor)) throw new ForbiddenError("Customer contacts cannot edit project updates.");
  const summary = patch.summary.trim();
  if (!summary) throw new Error("Write a summary.");
  if (!HEALTH.includes(patch.health)) throw new Error("Unknown health.");

  const row = await db.query.statusUpdates.findFirst({ where: eq(statusUpdates.id, updateId) });
  if (!row) throw new NotFoundError("Update not found.");
  await assertProjectAccess(actor, row.projectId);
  requireAuthorOrAdmin(actor, row.authorId);

  const accomplished = patch.accomplished?.trim() || null;
  const upcoming = patch.upcoming?.trim() || null;
  const needsFromYou = patch.needsFromYou?.trim() || null;
  const changed =
    summary !== row.summary ||
    accomplished !== (row.accomplished ?? null) ||
    upcoming !== (row.upcoming ?? null) ||
    needsFromYou !== (row.needsFromYou ?? null) ||
    patch.health !== row.health;

  if (changed) {
    const now = new Date();
    await db
      .update(statusUpdates)
      .set({
        summary,
        accomplished,
        upcoming,
        needsFromYou,
        health: patch.health,
        editedAt: now,
        updatedAt: now,
      })
      .where(eq(statusUpdates.id, updateId));

    if (patch.health !== row.health) {
      await db.update(projects).set({ health: patch.health }).where(eq(projects.id, row.projectId));
    }

    await audit({
      actor,
      action: "status_update.edited",
      entityType: "status_update",
      entityId: updateId,
      summary: `${row.projectId} status update`,
      metadata: { projectId: row.projectId, health: patch.health },
    });
  }

  return { projectId: row.projectId };
}

export async function deleteStatusUpdateForActor(actor: Actor, updateId: string) {
  if (isCustomer(actor)) throw new ForbiddenError("Customer contacts cannot delete project updates.");
  const row = await db.query.statusUpdates.findFirst({ where: eq(statusUpdates.id, updateId) });
  if (!row) throw new NotFoundError("Update not found.");
  await assertProjectAccess(actor, row.projectId);
  requireAuthorOrAdmin(actor, row.authorId);

  await db.delete(statusUpdates).where(eq(statusUpdates.id, updateId));
  await audit({
    actor,
    action: "status_update.deleted",
    entityType: "status_update",
    entityId: updateId,
    summary: row.summary.slice(0, 120),
    metadata: { projectId: row.projectId },
  });
  return { projectId: row.projectId };
}

export type RiskEdit = {
  title: string;
  description?: string | null;
  severity: RiskSeverity;
};

export async function editRiskForActor(actor: Actor, riskId: string, patch: RiskEdit) {
  if (isCustomer(actor)) throw new ForbiddenError("Customer contacts cannot edit risks.");
  const title = patch.title.trim();
  if (!title) throw new Error("Describe the risk.");
  if (!SEVERITY.includes(patch.severity)) throw new Error("Unknown severity.");

  const row = await db.query.risks.findFirst({ where: eq(risks.id, riskId) });
  if (!row) throw new NotFoundError("Risk not found.");
  await assertProjectAccess(actor, row.projectId);
  requireAuthorOrAdmin(actor, row.ownerId);

  const description = patch.description?.trim() || null;
  const changed =
    title !== row.title || description !== (row.description ?? null) || patch.severity !== row.severity;

  if (changed) {
    const now = new Date();
    await db
      .update(risks)
      .set({ title, description, severity: patch.severity, editedAt: now, updatedAt: now })
      .where(eq(risks.id, riskId));
    await audit({
      actor,
      action: "risk.edited",
      entityType: "risk",
      entityId: riskId,
      summary: title,
      metadata: { projectId: row.projectId },
    });
  }

  return { projectId: row.projectId };
}

export async function deleteRiskForActor(actor: Actor, riskId: string) {
  if (isCustomer(actor)) throw new ForbiddenError("Customer contacts cannot delete risks.");
  const row = await db.query.risks.findFirst({ where: eq(risks.id, riskId) });
  if (!row) throw new NotFoundError("Risk not found.");
  await assertProjectAccess(actor, row.projectId);
  requireAuthorOrAdmin(actor, row.ownerId);

  await db.delete(risks).where(eq(risks.id, riskId));
  await audit({
    actor,
    action: "risk.deleted",
    entityType: "risk",
    entityId: riskId,
    summary: row.title,
    metadata: { projectId: row.projectId },
  });
  return { projectId: row.projectId };
}
