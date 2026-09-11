"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  projectTemplates,
  templatePhases,
  templateTasks,
} from "@/db/schema";
import { requireStaff } from "@/lib/guard";
import { canManageTemplates, ForbiddenError, NotFoundError } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { ASSIGNABLE_PROJECT_ROLES } from "@/lib/staffing";
import type { ActionState } from "./messages";

async function requireTemplateAdmin() {
  const actor = await requireStaff();
  if (!canManageTemplates(actor)) throw new ForbiddenError("Templates are owner/admin only.");
  return actor;
}

const pathSchema = z.enum(["EHR", "EHR_RCM", "RCM_LEGACY", "RCM_PRISM"]);

export async function updateTemplateMeta(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireTemplateAdmin();
  const id = String(formData.get("templateId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return { error: "Template needs a name." };

  const existing = await db.query.projectTemplates.findFirst({
    where: eq(projectTemplates.id, id),
    columns: { id: true },
  });
  if (!existing) return { error: "Template not found." };

  const duration = Number(formData.get("durationDays") ?? 60);
  const pathRaw = formData.get("playbookPath")?.toString() || "";
  const playbookPath = pathSchema.safeParse(pathRaw).success ? pathSchema.parse(pathRaw) : null;

  await db
    .update(projectTemplates)
    .set({
      name,
      description: formData.get("description")?.toString().trim() || null,
      durationDays: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 60,
      isActive: formData.get("isActive") === "on",
      playbookPath,
      updatedAt: new Date(),
    })
    .where(eq(projectTemplates.id, id));

  await audit({
    actor,
    action: "template.updated",
    entityType: "template",
    entityId: id,
    summary: name,
  });
  revalidatePath("/templates");
  revalidatePath(`/templates/${id}`);
  return { ok: true };
}

export async function createTemplatePhase(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireTemplateAdmin();
  const templateId = String(formData.get("templateId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!templateId || !name) return { error: "Phase needs a name." };

  const existing = await db.query.templatePhases.findMany({
    where: eq(templatePhases.templateId, templateId),
    columns: { order: true },
  });
  const maxOrder = existing.reduce((m, p) => Math.max(m, p.order), -1);

  await db.insert(templatePhases).values({
    templateId,
    name,
    description: formData.get("description")?.toString().trim() || null,
    order: maxOrder + 1,
    visibility: formData.get("visibility") === "INTERNAL" ? "INTERNAL" : "SHARED",
    offsetDays: Number(formData.get("offsetDays") ?? 0) || 0,
    durationDays: Number(formData.get("durationDays") ?? 7) || 7,
    isOptional: formData.get("isOptional") === "on",
    areaKey: formData.get("areaKey")?.toString().trim() || null,
    workTrack: formData.get("workTrack") === "RCM" ? "RCM" : "EHR",
  });

  revalidatePath(`/templates/${templateId}`);
  return { ok: true };
}

export async function updateTemplatePhase(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireTemplateAdmin();
  const phaseId = String(formData.get("phaseId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!phaseId || !name) return { error: "Phase needs a name." };

  const phase = await db.query.templatePhases.findFirst({
    where: eq(templatePhases.id, phaseId),
    columns: { id: true, templateId: true },
  });
  if (!phase) return { error: "Phase not found." };

  await db
    .update(templatePhases)
    .set({
      name,
      description: formData.get("description")?.toString().trim() || null,
      visibility: formData.get("visibility") === "INTERNAL" ? "INTERNAL" : "SHARED",
      offsetDays: Number(formData.get("offsetDays") ?? 0) || 0,
      durationDays: Number(formData.get("durationDays") ?? 7) || 7,
      isOptional: formData.get("isOptional") === "on",
      areaKey: formData.get("areaKey")?.toString().trim() || null,
      workTrack: formData.get("workTrack") === "RCM" ? "RCM" : formData.get("workTrack") === "SHARED" ? "SHARED" : "EHR",
    })
    .where(eq(templatePhases.id, phaseId));

  revalidatePath(`/templates/${phase.templateId}`);
  return { ok: true };
}

export async function deleteTemplatePhase(phaseId: string) {
  const actor = await requireTemplateAdmin();
  const phase = await db.query.templatePhases.findFirst({
    where: eq(templatePhases.id, phaseId),
    columns: { id: true, templateId: true, name: true },
  });
  if (!phase) throw new NotFoundError("Phase not found.");
  await db.delete(templatePhases).where(eq(templatePhases.id, phaseId));
  await audit({
    actor,
    action: "template.phase.deleted",
    entityType: "template_phase",
    entityId: phaseId,
    summary: phase.name,
    metadata: { templateId: phase.templateId },
  });
  revalidatePath(`/templates/${phase.templateId}`);
}

export async function reorderTemplatePhases(templateId: string, orderedIds: string[]) {
  await requireTemplateAdmin();
  const existing = await db.query.templatePhases.findMany({
    where: eq(templatePhases.templateId, templateId),
    columns: { id: true },
  });
  const allowed = new Set(existing.map((p) => p.id));
  const ids = orderedIds.filter((id) => allowed.has(id));
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx.update(templatePhases).set({ order: i }).where(eq(templatePhases.id, ids[i]));
    }
  });
  revalidatePath(`/templates/${templateId}`);
}

const roleSchema = z.enum(ASSIGNABLE_PROJECT_ROLES as unknown as [string, ...string[]]);

export async function createTemplateTask(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireTemplateAdmin();
  const phaseId = String(formData.get("phaseId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!phaseId || !title) return { error: "Task needs a title." };

  const phase = await db.query.templatePhases.findFirst({
    where: eq(templatePhases.id, phaseId),
    columns: { id: true, templateId: true },
  });
  if (!phase) return { error: "Phase not found." };

  const existing = await db.query.templateTasks.findMany({
    where: eq(templateTasks.phaseId, phaseId),
    columns: { order: true },
  });
  const maxOrder = existing.reduce((m, t) => Math.max(m, t.order), -1);
  const ownerSide = formData.get("ownerSide") === "CUSTOMER" ? "CUSTOMER" : "INTERNAL";
  const roleRaw = formData.get("defaultRole")?.toString() || "";
  const defaultRole = roleSchema.safeParse(roleRaw).success ? (roleRaw as never) : null;

  await db.insert(templateTasks).values({
    phaseId,
    parentTaskId: formData.get("parentTaskId")?.toString() || null,
    title,
    description: formData.get("description")?.toString().trim() || null,
    order: maxOrder + 1,
    priority: (formData.get("priority")?.toString() as never) || "MEDIUM",
    visibility: ownerSide === "CUSTOMER" ? "SHARED" : formData.get("visibility") === "SHARED" ? "SHARED" : "INTERNAL",
    ownerSide,
    offsetDays: Number(formData.get("offsetDays") ?? 0) || 0,
    durationDays: Number(formData.get("durationDays") ?? 1) || 1,
    isOptional: formData.get("isOptional") === "on",
    areaKey: formData.get("areaKey")?.toString().trim() || null,
    defaultRole,
    workTrack: formData.get("workTrack") === "RCM" ? "RCM" : "EHR",
    overlapKey: formData.get("overlapKey")?.toString().trim() || null,
  });

  revalidatePath(`/templates/${phase.templateId}`);
  return { ok: true };
}

export async function updateTemplateTask(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireTemplateAdmin();
  const taskId = String(formData.get("taskId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!taskId || !title) return { error: "Task needs a title." };

  const task = await db.query.templateTasks.findFirst({
    where: eq(templateTasks.id, taskId),
    with: { phase: { columns: { templateId: true } } },
  });
  if (!task) return { error: "Task not found." };

  const ownerSide = formData.get("ownerSide") === "CUSTOMER" ? "CUSTOMER" : "INTERNAL";
  const roleRaw = formData.get("defaultRole")?.toString() || "";
  const defaultRole = roleSchema.safeParse(roleRaw).success ? (roleRaw as never) : null;

  await db
    .update(templateTasks)
    .set({
      title,
      description: formData.get("description")?.toString().trim() || null,
      priority: (formData.get("priority")?.toString() as never) || task.priority,
      visibility: ownerSide === "CUSTOMER" ? "SHARED" : formData.get("visibility") === "SHARED" ? "SHARED" : "INTERNAL",
      ownerSide,
      offsetDays: Number(formData.get("offsetDays") ?? 0) || 0,
      durationDays: Number(formData.get("durationDays") ?? 1) || 1,
      isOptional: formData.get("isOptional") === "on",
      areaKey: formData.get("areaKey")?.toString().trim() || null,
      defaultRole,
      workTrack: formData.get("workTrack") === "RCM" ? "RCM" : formData.get("workTrack") === "SHARED" ? "SHARED" : "EHR",
      overlapKey: formData.get("overlapKey")?.toString().trim() || null,
    })
    .where(eq(templateTasks.id, taskId));

  revalidatePath(`/templates/${task.phase.templateId}`);
  return { ok: true };
}

export async function deleteTemplateTask(taskId: string) {
  const actor = await requireTemplateAdmin();
  const task = await db.query.templateTasks.findFirst({
    where: eq(templateTasks.id, taskId),
    with: { phase: { columns: { templateId: true } } },
  });
  if (!task) throw new NotFoundError("Task not found.");
  await db.delete(templateTasks).where(eq(templateTasks.id, taskId));
  await audit({
    actor,
    action: "template.task.deleted",
    entityType: "template_task",
    entityId: taskId,
    summary: task.title,
    metadata: { templateId: task.phase.templateId },
  });
  revalidatePath(`/templates/${task.phase.templateId}`);
}

export async function reorderTemplateTasks(phaseId: string, orderedIds: string[]) {
  await requireTemplateAdmin();
  const phase = await db.query.templatePhases.findFirst({
    where: eq(templatePhases.id, phaseId),
    columns: { id: true, templateId: true },
  });
  if (!phase) throw new NotFoundError("Phase not found.");

  const existing = await db.query.templateTasks.findMany({
    where: eq(templateTasks.phaseId, phaseId),
    columns: { id: true },
  });
  const allowed = new Set(existing.map((t) => t.id));
  const ids = orderedIds.filter((id) => allowed.has(id));
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx.update(templateTasks).set({ order: i }).where(eq(templateTasks.id, ids[i]));
    }
  });
  revalidatePath(`/templates/${phase.templateId}`);
}

export async function moveTemplateTask(taskId: string, toPhaseId: string, beforeTaskId?: string) {
  await requireTemplateAdmin();
  const task = await db.query.templateTasks.findFirst({
    where: eq(templateTasks.id, taskId),
    with: { phase: { columns: { templateId: true } } },
  });
  if (!task) throw new NotFoundError("Task not found.");
  const dest = await db.query.templatePhases.findFirst({
    where: and(eq(templatePhases.id, toPhaseId), eq(templatePhases.templateId, task.phase.templateId)),
    columns: { id: true, templateId: true },
  });
  if (!dest) throw new NotFoundError("Phase not found.");

  const siblings = await db.query.templateTasks.findMany({
    where: eq(templateTasks.phaseId, toPhaseId),
    columns: { id: true, order: true },
    orderBy: (t, { asc }) => [asc(t.order)],
  });
  const without = siblings.filter((s) => s.id !== taskId).map((s) => s.id);
  const idx = beforeTaskId ? without.indexOf(beforeTaskId) : -1;
  const next = idx >= 0 ? [...without.slice(0, idx), taskId, ...without.slice(idx)] : [...without, taskId];

  await db.transaction(async (tx) => {
    await tx.update(templateTasks).set({ phaseId: toPhaseId }).where(eq(templateTasks.id, taskId));
    for (let i = 0; i < next.length; i++) {
      await tx.update(templateTasks).set({ order: i, phaseId: toPhaseId }).where(eq(templateTasks.id, next[i]));
    }
  });
  revalidatePath(`/templates/${dest.templateId}`);
}

