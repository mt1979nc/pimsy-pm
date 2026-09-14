"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { learningCenterItems, learningCenterSections, libraryAssets } from "@/db/schema";
import { requireAdmin, requireStaff } from "@/lib/guard";
import { canManageLearningCenter, ForbiddenError } from "@/lib/authz";
import { checkUpload, putFile } from "@/lib/storage";
import type { ActionState } from "./messages";

function revalidateLearn() {
  revalidatePath("/learning");
  revalidatePath("/portal/learn");
  revalidatePath("/admin/learning");
}

export async function updateLearningItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireStaff();
  if (!canManageLearningCenter(actor)) {
    return { error: "Only owners and admins can curate the Learning Center." };
  }

  const parsed = z
    .object({
      itemId: z.string().min(1),
      title: z.string().trim().min(1).max(200),
      summary: z.string().trim().max(500).optional(),
      body: z.string().trim().max(20000).optional(),
      url: z.string().trim().max(500).optional(),
      published: z.string().optional(),
    })
    .safeParse({
      itemId: formData.get("itemId"),
      title: formData.get("title"),
      summary: formData.get("summary")?.toString() || undefined,
      body: formData.get("body")?.toString() || undefined,
      url: formData.get("url")?.toString() || undefined,
      published: formData.get("published")?.toString(),
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  await db
    .update(learningCenterItems)
    .set({
      title: parsed.data.title,
      summary: parsed.data.summary || null,
      body: parsed.data.body || null,
      url: parsed.data.url || null,
      published: parsed.data.published === "on" || parsed.data.published === "true",
      isPlaceholder: false,
      updatedAt: new Date(),
    })
    .where(eq(learningCenterItems.id, parsed.data.itemId));

  revalidateLearn();
  return { ok: true };
}

export async function addLearningItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();
  const parsed = z
    .object({
      sectionId: z.string().min(1),
      title: z.string().trim().min(1).max(200),
      summary: z.string().trim().max(500).optional(),
      body: z.string().trim().max(20000).optional(),
      kind: z.enum(["ARTICLE", "LINK", "FILE"]).optional(),
      audienceRole: z.enum(["all", "clinical", "billing", "admin"]).optional(),
      url: z.string().trim().max(500).optional(),
    })
    .safeParse({
      sectionId: formData.get("sectionId"),
      title: formData.get("title"),
      summary: formData.get("summary")?.toString() || undefined,
      body: formData.get("body")?.toString() || undefined,
      kind: formData.get("kind")?.toString() || undefined,
      audienceRole: formData.get("audienceRole")?.toString() || undefined,
      url: formData.get("url")?.toString() || undefined,
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  const section = await db.query.learningCenterSections.findFirst({
    where: eq(learningCenterSections.id, parsed.data.sectionId),
    columns: { id: true },
  });
  if (!section) return { error: "Section not found." };

  const existing = await db.query.learningCenterItems.findMany({
    where: eq(learningCenterItems.sectionId, section.id),
    columns: { order: true },
  });
  const order = existing.reduce((m, r) => Math.max(m, r.order), -1) + 1;

  await db.insert(learningCenterItems).values({
    sectionId: section.id,
    title: parsed.data.title,
    summary: parsed.data.summary || null,
    body: parsed.data.body || null,
    kind: parsed.data.kind ?? "ARTICLE",
    audienceRole: parsed.data.audienceRole ?? "all",
    url: parsed.data.url || null,
    order,
    published: true,
    visibility: "SHARED",
    isPlaceholder: false,
  });
  revalidateLearn();
  return { ok: true };
}

export async function uploadLearningItemFile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();
  const itemId = formData.get("itemId")?.toString();
  const file = formData.get("file");
  if (!itemId) return { error: "Missing item." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };

  const item = await db.query.learningCenterItems.findFirst({
    where: eq(learningCenterItems.id, itemId),
  });
  if (!item) return { error: "Item not found." };

  const check = checkUpload(file.name, file.type, file.size);
  if (!check.ok) return { error: check.reason };

  const bytes = Buffer.from(await file.arrayBuffer());
  const key = await putFile(file.name, bytes);

  await db
    .update(learningCenterItems)
    .set({
      kind: "FILE",
      storageKey: key,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      isPlaceholder: false,
      updatedAt: new Date(),
    })
    .where(eq(learningCenterItems.id, itemId));

  if (item.libraryAssetId) {
    await db
      .update(libraryAssets)
      .set({
        storageKey: key,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        isPlaceholder: false,
        name: file.name,
        updatedAt: new Date(),
      })
      .where(eq(libraryAssets.id, item.libraryAssetId));
  }

  revalidateLearn();
  return { ok: true };
}

export async function deleteLearningItem(itemId: string) {
  const actor = await requireStaff();
  if (!canManageLearningCenter(actor)) {
    throw new ForbiddenError("Only owners and admins can curate the Learning Center.");
  }
  await db.delete(learningCenterItems).where(eq(learningCenterItems.id, itemId));
  revalidateLearn();
}
