"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { fileAssets, tasks, projects, users, phases } from "@/db/schema";
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
import {
  collectUploadFiles,
  MAX_DISCOVERY_BATCH_FILES,
  shouldFanOutWizardWorkbook,
} from "@/lib/discovery-config-review";
import {
  attachWizardWorkbookToConfiguration,
  hashUploadBytes,
  spawnConfigurationReviewTasks,
  type DiscoveryUploadFile,
} from "@/lib/discovery-config-review-tasks";
import { defaultLinkLabel, parseHttpUrl } from "@/lib/http-url";
import { attachLibraryToLiveTask } from "@/lib/library";
import { checkUpload, putFile, deleteFile, isImage } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { taskAssigneeIds } from "@/lib/task-assignees";
import { mirrorRecordingToSession } from "@/lib/training-ops";
import { shouldTreatLinkAsRecording } from "@/lib/training-session";
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
  for (const id of await taskAssigneeIds(task.id)) audience.add(id);
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
  revalidatePath(`/portal/projects/${projectId}/recordings`);
  revalidatePath(`/projects/${projectId}/settings`);
  revalidatePath(`/projects/${projectId}/customer-view`);
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
  const parsedUrl = parseHttpUrl(parsed.data.url);
  if (!parsedUrl.ok) return { error: parsedUrl.error };

  const task = await loadTask(actor, parsed.data.taskId);
  const visibility = resolveVisibilityForActor(actor, parsed.data.visibility);
  // An attachment can never be more visible than the task carrying it.
  const effective = task.visibility === "INTERNAL" ? "INTERNAL" : visibility;

  if (shouldTreatLinkAsRecording(task.title, parsedUrl.url)) {
    await mirrorRecordingToSession({
      projectId: task.projectId,
      url: parsedUrl.url.toString(),
      name: defaultLinkLabel(parsedUrl.url, parsed.data.name),
      visibility: effective,
      uploadedById: actor.id,
      hintTaskId: task.id,
      hintName: parsed.data.name ?? task.title,
    });
  } else {
    await db.insert(fileAssets).values({
      name: defaultLinkLabel(parsedUrl.url, parsed.data.name),
      kind: "LINK",
      url: parsedUrl.url.toString(),
      visibility: effective,
      taskId: task.id,
      projectId: task.projectId,
      uploadedById: actor.id,
    });
  }

  await audit({
    actor,
    action: "task.link.added",
    entityType: "task",
    entityId: task.id,
    summary: parsedUrl.url.hostname,
    metadata: { projectId: task.projectId, visibility: effective },
  });

  await notifyAttachment(actor, task, {
    name: parsed.data.name?.trim() || parsedUrl.url.hostname,
    visibility: effective,
    kind: "LINK",
  });

  try {
    if (
      shouldFanOutWizardWorkbook({
        sourceTitle: task.title,
        url: parsedUrl.url.toString(),
        linkName: parsed.data.name?.trim() || null,
      })
    ) {
      await attachWizardWorkbookToConfiguration({
        actor,
        projectId: task.projectId,
        sourceTask: { id: task.id, title: task.title },
        workbook: {
          kind: "LINK",
          name: defaultLinkLabel(parsedUrl.url, parsed.data.name),
          url: parsedUrl.url.toString(),
        },
      });
    }
  } catch (err) {
    console.error("attachWizardWorkbookToConfiguration (link) failed", err);
  }

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
  taskId: z.string().optional(),
});

/**
 * A training-session recording. Shown on the portal Recordings tab, and
 * mirrored onto the matching Training N task when a session is selected or
 * the name parses (e.g. "Training 2").
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
    taskId: formData.get("taskId")?.toString() || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  const parsedUrl = parseHttpUrl(parsed.data.url);
  if (!parsedUrl.ok) return { error: parsedUrl.error };

  await assertProjectWrite(actor, parsed.data.projectId);
  const visibility = resolveVisibilityForActor(actor, parsed.data.visibility);

  const mirrored = await mirrorRecordingToSession({
    projectId: parsed.data.projectId,
    url: parsedUrl.url.toString(),
    name: parsed.data.name,
    description: parsed.data.description || null,
    visibility,
    uploadedById: actor.id,
    hintTaskId: parsed.data.taskId || null,
    hintName: parsed.data.name,
  });

  await audit({
    actor,
    action: "recording.added",
    entityType: "project",
    entityId: parsed.data.projectId,
    summary: parsed.data.name,
    metadata: { visibility, taskId: mirrored.sessionTaskId, created: mirrored.created },
  });

  revalidatePath(`/projects/${parsed.data.projectId}/settings`);
  revalidatePath(`/projects/${parsed.data.projectId}/tasks`);
  if (mirrored.sessionTaskId) {
    revalidatePath(`/projects/${parsed.data.projectId}/tasks/${mirrored.sessionTaskId}`);
    revalidatePath(`/portal/projects/${parsed.data.projectId}/tasks/${mirrored.sessionTaskId}`);
  }
  revalidatePath(`/portal/projects/${parsed.data.projectId}`);
  revalidatePath(`/portal/projects/${parsed.data.projectId}/recordings`);
  revalidatePath(`/projects/${parsed.data.projectId}/customer-view`);
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
  if (!taskId) return { error: "Missing task." };

  const files = collectUploadFiles(formData);
  if (files.length === 0) return { error: "Choose a file first." };
  if (files.length > MAX_DISCOVERY_BATCH_FILES) {
    return { error: `Upload up to ${MAX_DISCOVERY_BATCH_FILES} files at a time.` };
  }

  for (const file of files) {
    const check = checkUpload(file.name, file.type, file.size);
    if (!check.ok) return { error: `${file.name}: ${check.reason}` };
  }

  const task = await loadTask(actor, taskId);
  const requested = (formData.get("visibility")?.toString() as "INTERNAL" | "SHARED") || undefined;
  const visibility = resolveVisibilityForActor(actor, requested);
  const effective = task.visibility === "INTERNAL" ? "INTERNAL" : visibility;
  const note = formData.get("description")?.toString() || null;

  const stored: DiscoveryUploadFile[] = [];
  try {
    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const contentHash = hashUploadBytes(bytes);
      const storageKey = await putFile(file.name, bytes);
      const kind = isImage(file.type) ? "IMAGE" : "FILE";
      stored.push({
        name: file.name.slice(0, 200),
        mimeType: file.type || null,
        sizeBytes: file.size,
        kind,
        contentHash,
        visibility: effective,
        description: note,
        bytes,
      });
      await db.insert(fileAssets).values({
        name: file.name.slice(0, 200),
        kind,
        storageKey,
        mimeType: file.type || null,
        sizeBytes: file.size,
        contentHash,
        description: note,
        visibility: effective,
        taskId: task.id,
        projectId: task.projectId,
        uploadedById: actor.id,
      });
    }
  } catch (err) {
    console.error("uploadTaskFile failed", err);
    return { error: "Could not save that file. Please try again." };
  }

  const summary =
    stored.length === 1 ? stored[0]!.name : `${stored.length} files`;
  await audit({
    actor,
    action: "task.file.uploaded",
    entityType: "task",
    entityId: task.id,
    summary,
    metadata: {
      projectId: task.projectId,
      visibility: effective,
      count: stored.length,
      names: stored.map((f) => f.name),
    },
  });

  const first = stored[0]!;
  await notifyAttachment(actor, task, {
    name: summary,
    visibility: effective,
    kind: first.kind,
  });

  try {
    const phase = task.phaseId
      ? await db.query.phases.findFirst({
          where: eq(phases.id, task.phaseId),
          columns: { name: true },
        })
      : null;
    const wizardFiles = stored.filter((f) =>
      shouldFanOutWizardWorkbook({ sourceTitle: task.title, filename: f.name }),
    );
    const reviewFiles = stored.filter((f) => !wizardFiles.includes(f));
    if (reviewFiles.length > 0) {
      await spawnConfigurationReviewTasks({
        actor,
        sourceTask: {
          id: task.id,
          title: task.title,
          projectId: task.projectId,
          phaseId: task.phaseId,
        },
        phaseName: phase?.name,
        files: reviewFiles,
      });
    }
    for (const file of wizardFiles) {
      await attachWizardWorkbookToConfiguration({
        actor,
        projectId: task.projectId,
        sourceTask: { id: task.id, title: task.title },
        workbook: {
          kind: "FILE",
          name: file.name,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          contentHash: file.contentHash,
          bytes: file.bytes,
        },
      });
    }
  } catch (err) {
    // Discovery upload already saved; specialists can still see the files there.
    console.error("Discovery → Configuration attach failed", err);
  }

  revalidateTask(task.projectId, task.id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Library clones on live tasks
// ---------------------------------------------------------------------------

export async function attachLibraryItemToTask(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireStaff();
  const taskId = String(formData.get("taskId") ?? "");
  const libraryAssetId = String(formData.get("libraryAssetId") ?? "");
  if (!taskId || !libraryAssetId) return { error: "Pick a library item." };

  const task = await loadTask(actor, taskId);
  await assertProjectWrite(actor, task.projectId);

  const result = await attachLibraryToLiveTask(db, {
    taskId: task.id,
    projectId: task.projectId,
    libraryAssetId,
    uploadedById: actor.id,
  });
  if ("error" in result) return { error: result.error };

  await audit({
    actor,
    action: "task.library.attached",
    entityType: "task",
    entityId: task.id,
    summary: libraryAssetId,
    metadata: { projectId: task.projectId },
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
