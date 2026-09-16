/**
 * Client-safe file-library labels and hrefs.
 * Do not import `@/db` or `@/lib/library` from here — those pull Postgres.
 */
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
