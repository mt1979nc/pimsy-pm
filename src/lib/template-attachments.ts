/**
 * Copy reusable library files onto a live task (same storage key, new row).
 * Used when materializing a playbook and when resyncing WIP projects.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { fileAssets, libraryAssets, tasks } from "@/db/schema";

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
    where: and(eq(fileAssets.taskId, opts.taskId), eq(fileAssets.libraryAssetId, lib.id)),
    columns: { id: true },
  });
  if (existing.length > 0) return { attached: false, skipped: true };

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
