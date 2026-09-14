/**
 * Copy reusable library files onto a live task (same storage key, new row).
 * Used when materializing a playbook, importing Dock WIP, and resyncing
 * existing projects. Never deletes user-uploaded files.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fileAssets, libraryAssets, tasks } from "@/db/schema";
import { fileCoversLibraryAsset, libraryDefsForTaskTitle } from "@/db/dock-default-attachments";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export async function copyLibraryAssetToTask(
  tx: Tx,
  opts: {
    taskId: string;
    projectId: string;
    libraryAssetId: string;
    uploadedById: string | null;
  },
): Promise<{ attached: boolean; skipped: boolean }> {
  const lib = await tx.query.libraryAssets.findFirst({
    where: eq(libraryAssets.id, opts.libraryAssetId),
  });
  if (!lib) return { attached: false, skipped: true };

  const task = await tx.query.tasks.findFirst({
    where: eq(tasks.id, opts.taskId),
    columns: { visibility: true },
  });
  const visibility =
    task?.visibility === "INTERNAL" ? ("INTERNAL" as const) : lib.visibility;

  const existing = await tx.query.fileAssets.findMany({
    where: eq(fileAssets.taskId, opts.taskId),
    columns: { id: true, libraryAssetId: true, kind: true, url: true },
  });
  if (fileCoversLibraryAsset(existing, lib)) {
    return { attached: false, skipped: true };
  }

  await tx.insert(fileAssets).values({
    name: lib.name,
    kind: lib.kind,
    url: lib.url,
    storageKey: lib.storageKey,
    description: lib.description,
    mimeType: lib.mimeType,
    sizeBytes: lib.sizeBytes,
    visibility,
    libraryAssetId: lib.id,
    taskId: opts.taskId,
    projectId: opts.projectId,
    uploadedById: opts.uploadedById,
  });
  return { attached: true, skipped: false };
}

/**
 * Attach every catalog default whose title matches this live/template task.
 * Idempotent: skips when the library clone (or equivalent Discovery Wizard
 * URL) is already present. Does not remove extra files the user uploaded.
 */
export async function ensureDefaultAttachmentsOnTask(
  tx: Tx,
  opts: {
    taskId: string;
    projectId: string;
    title: string;
    uploadedById: string | null;
  },
): Promise<{ attached: number; skipped: number }> {
  const defs = libraryDefsForTaskTitle(opts.title);
  if (defs.length === 0) return { attached: 0, skipped: 0 };

  const libs = await tx.query.libraryAssets.findMany();
  const libBySlug = new Map(libs.map((l) => [l.slug, l]));

  let attached = 0;
  let skipped = 0;
  for (const def of defs) {
    const lib = libBySlug.get(def.slug);
    if (!lib) {
      skipped += 1;
      continue;
    }
    const result = await copyLibraryAssetToTask(tx, {
      taskId: opts.taskId,
      projectId: opts.projectId,
      libraryAssetId: lib.id,
      uploadedById: opts.uploadedById,
    });
    if (result.attached) attached += 1;
    else skipped += 1;
  }
  return { attached, skipped };
}

/** After a library binary is replaced, point existing clones at the new blob. */
export async function propagateLibraryFileToCopies(
  tx: Tx,
  opts: {
    libraryAssetId: string;
    storageKey: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    url: string | null;
    kind: "FILE" | "IMAGE" | "LINK";
    name: string;
    description: string | null;
  },
) {
  await tx
    .update(fileAssets)
    .set({
      storageKey: opts.storageKey,
      mimeType: opts.mimeType,
      sizeBytes: opts.sizeBytes,
      url: opts.url,
      kind: opts.kind,
      name: opts.name,
      description: opts.description,
    })
    .where(eq(fileAssets.libraryAssetId, opts.libraryAssetId));
}
