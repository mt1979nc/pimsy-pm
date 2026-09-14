"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { taskChecklistItems, tasks } from "@/db/schema";
import { requireUser } from "@/lib/guard";
import {
  assertProjectAccess,
  assertProjectWrite,
  isCustomer,
  ForbiddenError,
  NotFoundError,
} from "@/lib/authz";
import { audit } from "@/lib/audit";
import type { ActionState } from "./messages";

async function loadChecklistContext(itemId: string) {
  const item = await db.query.taskChecklistItems.findFirst({
    where: eq(taskChecklistItems.id, itemId),
  });
  if (!item) throw new NotFoundError("Checklist item not found.");
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, item.taskId),
    columns: { id: true, projectId: true, visibility: true, title: true },
  });
  if (!task) throw new NotFoundError("Task not found.");
  return { item, task };
}

function revalidate(projectId: string, taskId: string) {
  revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
  revalidatePath(`/projects/${projectId}/tasks`);
  revalidatePath(`/portal/projects/${projectId}/tasks/${taskId}`);
  revalidatePath(`/portal/projects/${projectId}`);
}

export async function setChecklistItemDone(itemId: string, done: boolean) {
  const actor = await requireUser();
  const { item, task } = await loadChecklistContext(itemId);
  await assertProjectAccess(actor, task.projectId);
  if (isCustomer(actor)) {
    if (task.visibility === "INTERNAL" || item.visibility === "INTERNAL") {
      throw new NotFoundError("Checklist item not found.");
    }
    throw new ForbiddenError("Only your implementation team can check off training areas.");
  }
  await assertProjectWrite(actor, task.projectId);
  await db
    .update(taskChecklistItems)
    .set({
      done,
      completedAt: done ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(taskChecklistItems.id, itemId));
  revalidate(task.projectId, task.id);
}

export async function addChecklistItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireUser();
  const parsed = z
    .object({
      taskId: z.string().min(1),
      label: z.string().trim().min(1, "Add a label.").max(300),
      visibility: z.enum(["INTERNAL", "SHARED"]).optional(),
    })
    .safeParse({
      taskId: formData.get("taskId"),
      label: formData.get("label"),
      visibility: formData.get("visibility")?.toString() || undefined,
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, parsed.data.taskId),
    columns: { id: true, projectId: true, visibility: true, title: true },
  });
  if (!task) return { error: "Task not found." };
  if (isCustomer(actor)) return { error: "Only staff can edit the checklist." };
  await assertProjectWrite(actor, task.projectId);

  const existing = await db.query.taskChecklistItems.findMany({
    where: eq(taskChecklistItems.taskId, task.id),
    columns: { order: true },
  });
  const order = existing.reduce((m, r) => Math.max(m, r.order), -1) + 1;
  const visibility =
    task.visibility === "INTERNAL" ? "INTERNAL" : (parsed.data.visibility ?? "SHARED");

  await db.insert(taskChecklistItems).values({
    taskId: task.id,
    label: parsed.data.label,
    order,
    visibility,
    done: false,
  });
  await audit({
    actor,
    action: "task.checklist.added",
    entityType: "task",
    entityId: task.id,
    summary: parsed.data.label,
    metadata: { projectId: task.projectId },
  });
  revalidate(task.projectId, task.id);
  return { ok: true };
}

export async function removeChecklistItem(itemId: string) {
  const actor = await requireUser();
  if (isCustomer(actor)) throw new ForbiddenError("Only staff can edit the checklist.");
  const { item, task } = await loadChecklistContext(itemId);
  await assertProjectWrite(actor, task.projectId);
  await db.delete(taskChecklistItems).where(eq(taskChecklistItems.id, itemId));
  revalidate(task.projectId, task.id);
}
