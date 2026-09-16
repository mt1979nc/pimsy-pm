/**
 * Staff file library: reusable FILE uploads and LINK/Form hyperlinks.
 * Schema already has kind FILE | IMAGE | LINK on library_asset — no migrate.
 */
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { libraryAssets, templateTaskAttachments } from "@/db/schema";
import { defaultLinkLabel, parseHttpUrl } from "@/lib/http-url";
import { copyLibraryAssetToTask, propagateLibraryFileToCopies } from "@/lib/template-attachments";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export type LibraryKind = "FILE" | "IMAGE" | "LINK";
export type LibraryVisibility = "INTERNAL" | "SHARED";

export function libraryKindLabel(kind: string | null | undefined): "Link/Form" | "File" | "Image" {
  if (kind === "LINK") return "Link/Form";
  if (kind === "IMAGE") return "Image";
  return "File";
}

export function slugifyLibraryName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return slug || "library-item";
}

export async function uniqueLibrarySlug(tx: Tx, name: string): Promise<string> {
  const base = slugifyLibraryName(name);
  const existing = await tx.query.libraryAssets.findMany({
    columns: { slug: true },
  });
  const taken = new Set(existing.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 500; i++) {
    const candidate = `${base.slice(0, 50)}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base.slice(0, 40)}-${Date.now().toString(36)}`;
}

export async function listLibraryAssets(tx: Tx = db) {
  return tx.query.libraryAssets.findMany({
    orderBy: [asc(libraryAssets.name)],
  });
}

export type CreateLibraryLinkInput = {
  name: string;
  url: string;
  description?: string | null;
  adminNotes?: string | null;
  visibility?: LibraryVisibility;
};

export async function createLibraryLink(tx: Tx, input: CreateLibraryLinkInput) {
  const name = input.name.trim();
  if (!name) return { error: "Give the link a name." } as const;
  const parsed = parseHttpUrl(input.url);
  if (!parsed.ok) return { error: parsed.error } as const;

  const slug = await uniqueLibrarySlug(tx, name);
  const [row] = await tx
    .insert(libraryAssets)
    .values({
      slug,
      name: name.slice(0, 200),
      description: input.description?.trim() || null,
      adminNotes: input.adminNotes?.trim() || null,
      kind: "LINK",
      url: parsed.url.toString(),
      visibility: input.visibility ?? "SHARED",
      isPlaceholder: false,
    })
    .returning();
  return { ok: true as const, asset: row };
}

export type CreateLibraryFileInput = {
  name: string;
  storageKey: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  description?: string | null;
  adminNotes?: string | null;
  visibility?: LibraryVisibility;
};

export async function createLibraryFile(tx: Tx, input: CreateLibraryFileInput) {
  const name = input.name.trim();
  if (!name) return { error: "Give the file a name." } as const;
  if (!input.storageKey) return { error: "Choose a file." } as const;

  const slug = await uniqueLibrarySlug(tx, name);
  const [row] = await tx
    .insert(libraryAssets)
    .values({
      slug,
      name: name.slice(0, 200),
      description: input.description?.trim() || null,
      adminNotes: input.adminNotes?.trim() || null,
      kind: "FILE",
      url: null,
      storageKey: input.storageKey,
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes ?? null,
      visibility: input.visibility ?? "SHARED",
      isPlaceholder: false,
    })
    .returning();
  return { ok: true as const, asset: row };
}

export type UpdateLibraryLinkInput = {
  id: string;
  url?: string;
  name?: string;
  description?: string | null;
};

export async function updateLibraryLink(tx: Tx, input: UpdateLibraryLinkInput) {
  const existing = await tx.query.libraryAssets.findFirst({
    where: eq(libraryAssets.id, input.id),
  });
  if (!existing) return { error: "Library link not found." } as const;
  if (existing.kind !== "LINK") return { error: "That library item is a file, not a link." } as const;

  const name = input.name?.trim() || existing.name;
  let url = existing.url;
  if (input.url !== undefined) {
    const parsed = parseHttpUrl(input.url);
    if (!parsed.ok) return { error: parsed.error } as const;
    url = parsed.url.toString();
  }

  const description =
    input.description === undefined ? existing.description : input.description?.trim() || null;

  await tx
    .update(libraryAssets)
    .set({
      name: name.slice(0, 200),
      url,
      description,
      isPlaceholder: false,
      updatedAt: new Date(),
    })
    .where(eq(libraryAssets.id, existing.id));

  await propagateLibraryFileToCopies(tx, {
    libraryAssetId: existing.id,
    storageKey: existing.storageKey,
    mimeType: existing.mimeType,
    sizeBytes: existing.sizeBytes,
    url,
    kind: "LINK",
    name: name.slice(0, 200),
    description,
  });

  return { ok: true as const };
}

export async function attachLibraryToTemplateTask(
  tx: Tx,
  opts: { templateTaskId: string; libraryAssetId: string },
) {
  const lib = await tx.query.libraryAssets.findFirst({
    where: eq(libraryAssets.id, opts.libraryAssetId),
    columns: { id: true },
  });
  if (!lib) return { error: "Library item not found." } as const;

  const already = await tx.query.templateTaskAttachments.findFirst({
    where: and(
      eq(templateTaskAttachments.templateTaskId, opts.templateTaskId),
      eq(templateTaskAttachments.libraryAssetId, opts.libraryAssetId),
    ),
    columns: { id: true },
  });
  if (already) return { error: "That item is already on this playbook task." } as const;

  const [row] = await tx
    .insert(templateTaskAttachments)
    .values({
      templateTaskId: opts.templateTaskId,
      libraryAssetId: opts.libraryAssetId,
    })
    .returning();
  return { ok: true as const, attachment: row };
}

export async function attachLibraryToLiveTask(
  tx: Tx,
  opts: {
    taskId: string;
    projectId: string;
    libraryAssetId: string;
    uploadedById: string | null;
  },
) {
  const lib = await tx.query.libraryAssets.findFirst({
    where: eq(libraryAssets.id, opts.libraryAssetId),
    columns: { id: true },
  });
  if (!lib) return { error: "Library item not found." } as const;
  const result = await copyLibraryAssetToTask(tx, opts);
  if (result.skipped) return { error: "That library item is already on this task." } as const;
  return { ok: true as const, attached: result.attached };
}

export function libraryAssetOpenHref(asset: {
  id: string;
  kind: string;
  url?: string | null;
}): string | null {
  if (asset.kind === "LINK") return asset.url?.trim() || null;
  return `/api/library/${asset.id}`;
}

export function fileAssetOpenHref(asset: {
  id: string;
  kind: string;
  url?: string | null;
}): string {
  if (asset.kind === "LINK") return asset.url?.trim() || "#";
  return `/api/files/${asset.id}`;
}

export { defaultLinkLabel, parseHttpUrl };
