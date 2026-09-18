/**
 * Client-safe file-library labels and hrefs.
 * Do not import `@/db` or `@/lib/library` from here — those pull Postgres.
 */

export const MISSING_LIBRARY_FILE_CUSTOMER_NOTE =
  "This file is not available yet. Your implementation team will attach it when it is ready.";

export const MISSING_LIBRARY_FILE_STAFF_NOTE =
  "This template file is not in the library yet. Upload the real Dock file from Templates → File library.";

export function libraryKindLabel(kind: string | null | undefined): "Link" | "File" | "Image" {
  if (kind === "LINK") return "Link";
  if (kind === "IMAGE") return "Image";
  return "File";
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;

/** FILE vs IMAGE for a library upload. LINK is a URL, not an upload. */
export function libraryUploadKind(
  mimeType: string | null | undefined,
  requested?: string | null,
  fileName?: string | null,
): { ok: true; kind: "FILE" | "IMAGE" } | { error: string } {
  const wantsImage = requested === "IMAGE";
  const image = Boolean(mimeType?.startsWith("image/")) || IMAGE_EXT.test(fileName ?? "");
  if (wantsImage && !image) return { error: "Choose an image." };
  return { ok: true, kind: wantsImage || image ? "IMAGE" : "FILE" };
}

export function slugifyLibraryName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return slug || "library-item";
}

export type OpenableAsset = {
  id?: string;
  kind?: string | null;
  url?: string | null;
  storageKey?: string | null;
  /** Precomputed when the client must not receive a storage path. */
  hasBlob?: boolean;
};

/** FILE/IMAGE with a stored blob. Links are not blobs. */
export function assetHasDownloadableBlob(asset: OpenableAsset): boolean {
  if ((asset.kind ?? "FILE") === "LINK") return false;
  if (typeof asset.hasBlob === "boolean") return asset.hasBlob;
  return Boolean(asset.storageKey?.trim());
}

export function libraryAssetOpenHref(asset: {
  id: string;
  kind: string;
  url?: string | null;
  storageKey?: string | null;
  hasBlob?: boolean;
}): string | null {
  if (asset.kind === "LINK") return asset.url?.trim() || null;
  if (!assetHasDownloadableBlob(asset)) return null;
  return `/api/library/${asset.id}`;
}

export function fileAssetOpenHref(asset: {
  id: string;
  kind: string;
  url?: string | null;
  storageKey?: string | null;
  hasBlob?: boolean;
}): string | null {
  if (asset.kind === "LINK") return asset.url?.trim() || null;
  if (!assetHasDownloadableBlob(asset)) return null;
  return `/api/files/${asset.id}`;
}
