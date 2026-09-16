"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { libraryAssets } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import {
  createLibraryFile,
  createLibraryLink,
  updateLibraryLink,
} from "@/lib/library";
import { checkUpload, putFile } from "@/lib/storage";
import { propagateLibraryFileToCopies } from "@/lib/template-attachments";
import type { ActionState } from "./messages";

function revalidateLibrary() {
  revalidatePath("/learning");
  revalidatePath("/templates");
  revalidatePath("/library");
}

function visibilityFromForm(formData: FormData): "INTERNAL" | "SHARED" {
  return formData.get("visibility")?.toString() === "INTERNAL" ? "INTERNAL" : "SHARED";
}

export async function addLibraryLink(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const result = await createLibraryLink(db, {
    name: formData.get("name")?.toString() ?? "",
    url: formData.get("url")?.toString() ?? "",
    description: formData.get("description")?.toString() || null,
    adminNotes: formData.get("adminNotes")?.toString() || null,
    visibility: visibilityFromForm(formData),
  });
  if ("error" in result) return { error: result.error };
  revalidateLibrary();
  return { ok: true };
}

export async function addLibraryFile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };

  const check = checkUpload(file.name, file.type, file.size);
  if (!check.ok) return { error: check.reason };

  let storageKey: string;
  try {
    storageKey = await putFile(file.name, Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    console.error("addLibraryFile failed", err);
    return { error: "Could not save that file. Please try again." };
  }

  const name = formData.get("name")?.toString()?.trim() || file.name;
  const result = await createLibraryFile(db, {
    name,
    storageKey,
    mimeType: file.type || null,
    sizeBytes: file.size,
    description: formData.get("description")?.toString() || null,
    adminNotes: formData.get("adminNotes")?.toString() || null,
    visibility: visibilityFromForm(formData),
  });
  if ("error" in result) return { error: result.error };
  revalidateLibrary();
  return { ok: true };
}

export async function saveLibraryLink(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const assetId = formData.get("assetId")?.toString();
  if (!assetId) return { error: "Missing library link." };
  const result = await updateLibraryLink(db, {
    id: assetId,
    url: formData.get("url")?.toString(),
    name: formData.get("name")?.toString(),
    description: formData.get("description")?.toString(),
  });
  if ("error" in result) return { error: result.error };
  revalidateLibrary();
  return { ok: true };
}

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
  if (asset.kind === "LINK") return { error: "Replace the URL on a Link/Form item, not a file." };

  const check = checkUpload(file.name, file.type, file.size);
  if (!check.ok) return { error: check.reason };

  const bytes = Buffer.from(await file.arrayBuffer());
  const key = await putFile(file.name, bytes);
  const mimeType = file.type || asset.mimeType;
  const name = asset.name;

  await db
    .update(libraryAssets)
    .set({
      storageKey: key,
      mimeType,
      sizeBytes: file.size,
      isPlaceholder: false,
      kind: "FILE",
      url: null,
      name,
      updatedAt: new Date(),
    })
    .where(eq(libraryAssets.id, assetId));

  await propagateLibraryFileToCopies(db, {
    libraryAssetId: asset.id,
    storageKey: key,
    mimeType,
    sizeBytes: file.size,
    url: null,
    kind: "FILE",
    name,
    description: asset.description,
  });

  revalidateLibrary();
  return { ok: true };
}
