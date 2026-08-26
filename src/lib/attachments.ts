import { and, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { fileAssets, tasks } from "@/db/schema";
import {
  assertProjectAccess,
  canSeeInternal,
  isCustomer,
  NotFoundError,
  type Actor,
} from "./authz";

/**
 * Attachment authorization. Every read of a file or link goes through here, so
 * there is exactly one answer to "may this person see this attachment?".
 *
 * The rule is the same as everywhere else: a customer sees only SHARED items,
 * and only on projects belonging to their own account.
 */

export type AttachmentWithOwner = typeof fileAssets.$inferSelect;

/** Attachments on a task the actor may see, newest first. */
export async function listTaskAttachments(actor: Actor, taskId: string) {
  if (!canSeeInternal(actor)) {
    // Nothing on an internal task is listable by a customer, whatever the
    // attachment itself claims.
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
      columns: { visibility: true },
    });
    if (!task || task.visibility === "INTERNAL") return [];
  }

  const conditions = [eq(fileAssets.taskId, taskId)];
  if (!canSeeInternal(actor)) conditions.push(eq(fileAssets.visibility, "SHARED"));

  return db.query.fileAssets.findMany({
    where: and(...conditions),
    orderBy: [desc(fileAssets.createdAt)],
    with: { uploadedBy: { columns: { id: true, name: true, image: true } } },
  });
}

/**
 * Resolve an attachment the actor is allowed to fetch, or throw NotFoundError.
 * Used by the download route before a single byte is streamed.
 */
export async function assertAttachmentAccess(actor: Actor, assetId: string) {
  const asset = await db.query.fileAssets.findFirst({
    where: eq(fileAssets.id, assetId),
  });
  if (!asset) throw new NotFoundError("File not found.");

  // Customers never see internal attachments, whatever they're attached to.
  if (isCustomer(actor) && asset.visibility === "INTERNAL") {
    throw new NotFoundError("File not found.");
  }

  // An attachment inherits the ceiling of whatever it hangs off. If it belongs
  // to a task, that task's visibility is checked ALWAYS — not only when the
  // asset lacks its own projectId. A SHARED attachment on an INTERNAL task is
  // still internal, and skipping this check leaked exactly that.
  let projectId = asset.projectId;
  if (asset.taskId) {
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, asset.taskId),
      columns: { projectId: true, visibility: true },
    });
    if (!task) throw new NotFoundError("File not found.");
    if (isCustomer(actor) && task.visibility === "INTERNAL") {
      throw new NotFoundError("File not found.");
    }
    projectId = task.projectId;
  }

  if (projectId) {
    await assertProjectAccess(actor, projectId);
    return asset;
  }

  // Account-level attachment with no project.
  if (asset.customerAccountId) {
    if (isCustomer(actor) && asset.customerAccountId !== actor.customerAccountId) {
      throw new NotFoundError("File not found.");
    }
    return asset;
  }

  // Unanchored: internal staff only.
  if (isCustomer(actor)) throw new NotFoundError("File not found.");
  return asset;
}

/** A safe href for rendering: links go direct, uploads stream through the API. */
export function attachmentHref(asset: { id: string; kind: string; url: string | null }) {
  return asset.kind === "LINK" ? (asset.url ?? "#") : `/api/files/${asset.id}`;
}
