"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { libraryAssets } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import { checkUpload, putFile } from "@/lib/storage";
import type { ActionState } from "./messages";

export async function uploadLibraryFile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const assetId = formData.get("assetId")?.toString();
  const file = formData.get("file");
  if (!assetId) return { error: "Missing library file." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };

  const asset = await db.query.libraryAssets.findFirst({
    where: eq(libraryAssets.id, assetId),
  });
  if (!asset) return { error: "Library file not found." };

  const check = checkUpload(file.name, file.type, file.size);
  if (!check.ok) return { error: check.reason };

  const bytes = Buffer.from(await file.arrayBuffer());
  const key = await putFile(file.name, bytes);

  await db
    .update(libraryAssets)
    .set({
      storageKey: key,
      mimeType: file.type || asset.mimeType,
      sizeBytes: file.size,
      isPlaceholder: false,
      name: asset.isPlaceholder ? asset.name : file.name,
      updatedAt: new Date(),
    })
    .where(eq(libraryAssets.id, assetId));

  revalidatePath("/learning");
  revalidatePath("/templates");
  revalidatePath("/library");
  return { ok: true };
}
