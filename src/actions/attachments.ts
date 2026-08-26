"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { fileAssets, tasks, projects, users } from "@/db/schema";
import { notify } from "@/lib/notify";
import { requireUser, requireStaff } from "@/lib/guard";
import {
  assertProjectAccess,
  assertProjectWrite,
  isCustomer,
  canSeeInternal,
  ForbiddenError,
  NotFoundError,
  resolveVisibilityForActor,
  type Actor,
} from "@/lib/authz";
import { assertAttachmentAccess } from "@/lib/attachments";
import { checkUpload, putFile, deleteFile, isImage } from "@/lib/storage";
import { audit } from "@/lib/audit";
import type { ActionState } from "./messages";

/** Load a task the actor may act on, and the visibility ceiling that applies. */
async function loadTask(actor: Actor, taskId: string) {
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) throw new NotFoundError("Task not found.");
  await assertProjectAccess(actor, task.projectId);
  if (isCustomer(actor) && task.visibility === "INTERNAL") {
    throw new NotFoundError("Task not found.");
  }
  return task;
}

/**
 * Someone attached something to a task. Tell the lead and whoever owns the
 * task — a customer dropping a document into the portal is the classic case of
 * work arriving that nobody is watching for.
 *
 * The asset's own visibility governs the audience: an INTERNAL attachment can
 * never generate a customer notification, regardless of who is on the task.
 */
async function notifyAttachment(
  actor: Actor,
  task: { id: string; title: string; projectId: string; assigneeId: string | null },
  asset: { name: string; visibility: "INTERNAL" | "SHARED"; kind: "FILE" | "IMAGE" | "LINK" },
) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, task.projectId),
    columns: { id: true, name: true, leadId: true },
  });

  const audience = new Set<string>();
  if (project?.leadId) audience.add(project.leadId);
  if (task.assigneeId) audience.add(task.assigneeId);
  audience.delete(actor.id);
  if (audience.size === 0) return;

  let recipients = Array.from(audience);
  if (asset.visibility === "INTERNAL") {
    const rows = await db.query.users.findMany({
      where: inArray(users.id, recipients),
      columns: { id: true, role: true },
    });
    recipients = rows.filter((r) => r.role !== "CUSTOMER").map((r) => r.id);
  }
  if (recipients.length === 0) return;

  const who = actor.name ?? actor.email ?? "Someone";
  const noun = asset.kind === "LINK" ? "link" : asset.kind === "IMAGE" ? "image" : "file";

  await notify({
    userIds: recipients,
    type: "FILE_UPLOADED",
    title: `${who} added a ${noun} to “${task.title}”`,
    body: asset.name,
    facts: [
      { name: "Project", value: project?.name ?? "—" },
      { name: "Added by", value: who },
      { name: "Visible to", value: asset.visibility === "SHARED" ? "Customer & team" : "Team only" },
    ],
    linkUrl: `/projects/${task.projectId}/tasks/${task.id}`,
    portalLinkUrl: `/portal/projects/${task.projectId}/tasks/${task.id}`,
    ctaLabel: "Open the task",
    email: true,
    teams: isCustomer(actor),
    projectId: task.projectId,
    exceptUserId: actor.id,
  });
}

function revalidateTask(projectId: string, taskId: string) {
  revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
  revalidatePath(`/projects/${projectId}/tasks`);
  revalidatePath(`/portal/projects/${projectId}/tasks/${taskId}`);
  revalidatePath(`/portal/projects/${projectId}`);
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

const linkSchema = z.object({
  taskId: z.string().min(1),
  url: z.string().trim().min(1, "Paste a link first."),
  name: z.string().trim().max(200).optional(),
  visibility: z.enum(["INTERNAL", "SHARED"]).optional(),
});

export async function addTaskLink(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireUser();

  const parsed = linkSchema.safeParse({
    taskId: formData.get("taskId"),
    url: formData.get("url"),
    name: formData.get("name")?.toString() || undefined,
    visibility: formData.get("visibility")?.toString() || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  // Accept "docs.google.com/..." as well as a full URL, but only ever store
  // http(s) — javascript: and data: URLs must never become clickable links.
  const raw = parsed.data.url;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(candidate);
  } catch {
    return { error: "That doesn't look like a valid web address." };
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return { error: "Only http and https links are allowed." };
  }

  const task = await loadTask(actor, parsed.data.taskId);
  const visibility = resolveVisibilityForActor(actor, parsed.data.visibility);
  // An attachment can never be more visible than the task carrying it.
  const effective = task.visibility === "INTERNAL" ? "INTERNAL" : visibility;

  await db.insert(fileAssets).values({
    name: parsed.data.name || parsedUrl.hostname + parsedUrl.pathname.replace(/\/$/, ""),
    kind: "LINK",
    url: parsedUrl.toString(),
    visibility: effective,
    taskId: task.id,
    projectId: task.projectId,
    uploadedById: actor.id,
  });

  await audit({
    actor,
    action: "task.link.added",
    entityType: "task",
    entityId: task.id,
    summary: parsedUrl.hostname,
    metadata: { projectId: task.projectId, visibility: effective },
  });

  await notifyAttachment(actor, task, {
    name: parsed.data.name?.trim() || parsedUrl.hostname,
    visibility: effective,
    kind: "LINK",
  });

  revalidateTask(task.projectId, task.id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Recordings
// ---------------------------------------------------------------------------

const recordingSchema = z.object({
  projectId: z.string().min(1),
  url: z.string().trim().min(1, "Paste a link first."),
  name: z.string().trim().min(1, "Give it a name, e.g. \"Core Training — Session 2\".").max(200),
  description: z.string().trim().max(2000).optional(),
  visibility: z.enum(["INTERNAL", "SHARED"]).optional(),
});

/**
 * A training-session recording, shown in the portal's Recordings tab. Always
 * project-level (no task) since a recording isn't one action item. Defaults
 * to INTERNAL — same "hide until relevant" pattern as everything else in the
 * portal — so a specialist adds it privately first and shares it once it's
 * ready for the customer to rewatch.
 */
export async function addProjectRecording(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireStaff();

  const parsed = recordingSchema.safeParse({
    projectId: formData.get("projectId"),
    url: formData.get("url"),
    name: formData.get("name"),
    description: formData.get("description")?.toString() || undefined,
    visibility: formData.get("visibility")?.toString() || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  const raw = parsed.data.url;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(candidate);
  } catch {
    return { error: "That doesn't look like a valid web address." };
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return { error: "Only http and https links are allowed." };
  }

  await assertProjectWrite(actor, parsed.data.projectId);
  const visibility = resolveVisibilityForActor(actor, parsed.data.visibility);

  await db.insert(fileAssets).values({
    name: parsed.data.name,
    kind: "LINK",
    url: parsedUrl.toString(),
    description: parsed.data.description || null,
    visibility,
    isRecording: true,
    projectId: parsed.data.projectId,
    uploadedById: actor.id,
  });

  await audit({
    actor,
    action: "recording.added",
    entityType: "project",
    entityId: parsed.data.projectId,
    summary: parsed.data.name,
    metadata: { visibility },
  });

  revalidatePath(`/projects/${parsed.data.projectId}/settings`);
  revalidatePath(`/portal/projects/${parsed.data.projectId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

export async function uploadTaskFile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireUser();

  const taskId = String(formData.get("taskId") ?? "");
  const file = formData.get("file");
  if (!taskId) return { error: "Missing task." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file first." };

  const check = checkUpload(file.name, file.type, file.size);
  if (!check.ok) return { error: check.reason };

  const task = await loadTask(actor, taskId);
  const requested = (formData.get("visibility")?.toString() as "INTERNAL" | "SHARED") || undefined;
  const visibility = resolveVisibilityForActor(actor, requested);
  const effective = task.visibility === "INTERNAL" ? "INTERNAL" : visibility;

  let storageKey: string;
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    storageKey = await putFile(file.name, bytes);
  } catch (err) {
    console.error("uploadTaskFile failed", err);
    return { error: "Could not save that file. Please try again." };
  }

  await db.insert(fileAssets).values({
    name: file.name.slice(0, 200),
    kind: isImage(file.type) ? "IMAGE" : "FILE",
    storageKey,
    mimeType: file.type || null,
    sizeBytes: file.size,
    description: formData.get("description")?.toString() || null,
    visibility: effective,
    taskId: task.id,
    projectId: task.projectId,
    uploadedById: actor.id,
  });

  await audit({
    actor,
    action: "task.file.uploaded",
    entityType: "task",
    entityId: task.id,
    summary: file.name,
    metadata: { projectId: task.projectId, visibility: effective, bytes: file.size },
  });

  await notifyAttachment(actor, task, {
    name: file.name.slice(0, 200),
    visibility: effective,
    kind: isImage(file.type) ? "IMAGE" : "FILE",
  });

  revalidateTask(task.projectId, task.id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Removal & visibility
// ---------------------------------------------------------------------------

export async function deleteAttachment(assetId: string) {
  const actor = await requireUser();
  const asset = await assertAttachmentAccess(actor, assetId);

  // Customers may remove only what they added themselves.
  if (isCustomer(actor) && asset.uploadedById !== actor.id) {
    throw new ForbiddenError("You can only remove attachments you added.");
  }

  await db.delete(fileAssets).where(eq(fileAssets.id, assetId));
  if (asset.storageKey) await deleteFile(asset.storageKey);

  await audit({
    actor,
    action: "attachment.deleted",
    entityType: "file_asset",
    entityId: assetId,
    summary: asset.name,
  });

  if (asset.taskId && asset.projectId) revalidateTask(asset.projectId, asset.taskId);
  else if (asset.projectId) {
    revalidatePath(`/projects/${asset.projectId}/settings`);
    revalidatePath(`/portal/projects/${asset.projectId}`);
  }
}

export async function setAttachmentVisibility(
  assetId: string,
  visibility: "INTERNAL" | "SHARED",
) {
  const actor = await requireUser();
  if (!canSeeInternal(actor)) throw new ForbiddenError();
  const asset = await assertAttachmentAccess(actor, assetId);

  if (visibility === "SHARED" && asset.taskId) {
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, asset.taskId),
      columns: { visibility: true },
    });
    if (task?.visibility === "INTERNAL") {
      throw new ForbiddenError(
        "This task is internal. Share the task first, then the attachment can follow.",
      );
    }
  }

  await db.update(fileAssets).set({ visibility }).where(eq(fileAssets.id, assetId));
  await audit({
    actor,
    action: "attachment.visibility.changed",
    entityType: "file_asset",
    entityId: assetId,
    summary: `${asset.name}: now ${visibility === "SHARED" ? "visible to customer" : "internal only"}`,
    metadata: { from: asset.visibility, to: visibility },
  });

  if (asset.taskId && asset.projectId) revalidateTask(asset.projectId, asset.taskId);
  else if (asset.projectId) {
    revalidatePath(`/projects/${asset.projectId}/settings`);
    revalidatePath(`/portal/projects/${asset.projectId}`);
  }
}
