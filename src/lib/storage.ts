import { mkdir, writeFile, unlink, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { resolve, join, extname, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Attachment storage.
 *
 * Two backends behind one small interface (checkUpload, putFile,
 * readFileStream, deleteFile):
 *
 *  - "local" (default): files land on disk under UPLOAD_DIR (default
 *    ./uploads). This is what local dev and the demo environment use.
 *  - "azure-blob": files land in an Azure Storage container instead, chosen
 *    automatically when AZURE_STORAGE_CONNECTION_STRING is set (see
 *    src/lib/env.ts). Azure App Service's local filesystem isn't reliably
 *    persistent across restarts or scale-out, so a real deployment there
 *    needs this.
 *
 * Either way, files are only ever served through /api/files/[id], which
 * re-checks project access and visibility. Nothing here is web-reachable on
 * its own — a leaked storage key is not a leaked file.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Types we will store. Anything executable is refused: this system exists to
 * pass spreadsheets and screenshots between a practice and its implementation
 * team, not to distribute binaries.
 */
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
]);

const ALLOWED_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
  ".pdf", ".txt", ".csv", ".md", ".json",
  ".xls", ".xlsx", ".doc", ".docx", ".ppt", ".pptx", ".zip",
]);

export function uploadRoot() {
  return resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads");
}

export function isImage(mimeType: string | null | undefined) {
  return !!mimeType && mimeType.startsWith("image/");
}

export type UploadCheck = { ok: true } | { ok: false; reason: string };

export function checkUpload(name: string, mimeType: string, size: number): UploadCheck {
  if (size <= 0) return { ok: false, reason: "That file is empty." };
  if (size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: `That file is ${(size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
    };
  }
  const ext = extname(name).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return { ok: false, reason: `${ext || "That file type"} isn't allowed here.` };
  }
  if (mimeType && !ALLOWED_MIME.has(mimeType)) {
    return { ok: false, reason: `${mimeType} isn't an allowed file type.` };
  }
  return { ok: true };
}

/** Generates the opaque, date-folder-prefixed key shared by both backends. */
function newKey(originalName: string): string {
  const ext = extname(originalName).toLowerCase().slice(0, 12);
  const now = new Date();
  const folder = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${folder}/${randomBytes(16).toString("hex")}${ext}`;
}

/** Writes the file and returns an opaque storage key. */
export async function putFile(originalName: string, bytes: Buffer): Promise<string> {
  const key = newKey(originalName);
  if (env.STORAGE_BACKEND === "azure-blob") {
    const client = await blobClient(key);
    await client.uploadData(bytes);
    return key;
  }

  const dest = join(uploadRoot(), key);
  await mkdir(join(uploadRoot(), key.split("/")[0]), { recursive: true });
  await writeFile(dest, bytes);
  return key;
}

/**
 * Resolves a storage key to an absolute path, refusing anything that escapes
 * the root. Local-disk only — Azure Blob keys are just blob names, so there's
 * no filesystem path to guard.
 */
export function resolveKey(key: string): string | null {
  const root = uploadRoot();
  const full = resolve(root, key);
  // Path traversal guard: the resolved path must stay under the root.
  if (full !== root && !full.startsWith(root + sep)) return null;
  return full;
}

export async function readFileStream(key: string) {
  if (env.STORAGE_BACKEND === "azure-blob") {
    try {
      const client = await blobClient(key);
      const download = await client.download();
      if (!download.readableStreamBody) return null;
      return { stream: download.readableStreamBody, size: download.contentLength ?? 0 };
    } catch (err) {
      if (isBlobNotFound(err)) return null;
      throw err;
    }
  }

  const full = resolveKey(key);
  if (!full) return null;
  try {
    const info = await stat(full);
    if (!info.isFile()) return null;
    return { stream: createReadStream(full), size: info.size };
  } catch {
    return null;
  }
}

export async function deleteFile(key: string) {
  if (env.STORAGE_BACKEND === "azure-blob") {
    try {
      const client = await blobClient(key);
      await client.deleteIfExists();
    } catch {
      // Already gone is fine.
    }
    return;
  }

  const full = resolveKey(key);
  if (!full) return;
  try {
    await unlink(full);
  } catch {
    // Already gone is fine.
  }
}

// ---------------------------------------------------------------------------
// Azure Blob Storage backend
// ---------------------------------------------------------------------------

/**
 * Lazily imported so a local-only deployment never needs @azure/storage-blob
 * to actually resolve, and the container client (which does a small amount
 * of setup work) is reused across calls within the same server process.
 */
let containerClientPromise: Promise<import("@azure/storage-blob").ContainerClient> | null = null;

async function getContainerClient() {
  if (!containerClientPromise) {
    containerClientPromise = (async () => {
      const { BlobServiceClient } = await import("@azure/storage-blob");
      const service = BlobServiceClient.fromConnectionString(env.AZURE_STORAGE_CONNECTION_STRING);
      const container = service.getContainerClient(env.AZURE_STORAGE_CONTAINER);
      // private: attachments are only ever served through /api/files/[id].
      await container.createIfNotExists();
      return container;
    })();
  }
  return containerClientPromise;
}

async function blobClient(key: string) {
  const container = await getContainerClient();
  return container.getBlockBlobClient(key);
}

function isBlobNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "statusCode" in err &&
    (err as { statusCode?: number }).statusCode === 404
  );
}
