import { extname } from "node:path";
import { isDisplayableLogoUrl } from "@/lib/customer-logo";

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

const LOGO_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

export type LogoInput =
  | { kind: "unchanged" }
  | { kind: "clear" }
  | { kind: "url"; url: string }
  | { kind: "file"; name: string; mimeType: string; bytes: Buffer };

export function logoContentType(storageKey: string): string | null {
  const ext = extname(storageKey).toLowerCase();
  return MIME_BY_EXT[ext] ?? null;
}

export function logoFilename(name: string, mimeType: string): string {
  const ext = extname(name).toLowerCase();
  if (LOGO_EXT.has(ext)) return name.slice(0, 180);
  const fromMime = EXT_BY_MIME[mimeType];
  return `logo${fromMime ?? ".png"}`;
}

function checkLogoFile(
  name: string,
  mimeType: string,
  size: number,
): { ok: true; mimeType: string } | { ok: false; reason: string } {
  if (size <= 0) return { ok: false, reason: "That logo file is empty." };
  if (size > LOGO_MAX_BYTES) {
    return { ok: false, reason: "Logo images must be 2 MB or smaller." };
  }
  const ext = extname(name).toLowerCase();
  const mime = (mimeType || "").trim().toLowerCase();
  const fromExt = MIME_BY_EXT[ext];
  const mimeOk = Boolean(EXT_BY_MIME[mime]);
  if (!fromExt && !mimeOk) {
    return { ok: false, reason: "Logo must be a PNG, JPG, GIF, or WebP image." };
  }
  if (fromExt && mimeOk && fromExt !== mime) {
    return { ok: false, reason: "That file’s type doesn’t match a PNG, JPG, GIF, or WebP logo." };
  }
  return { ok: true, mimeType: fromExt ?? mime };
}

/**
 * Reads the shared logo fields (`logoUrl`, `logoFile`, `clearLogo`).
 * An empty form is "unchanged" so other customer forms can omit the fields.
 * A file wins over a URL. Remove is explicit.
 */
export async function parseLogoForm(
  formData: FormData,
): Promise<{ ok: true; input: LogoInput } | { ok: false; error: string }> {
  const file = formData.get("logoFile");
  if (file instanceof File && file.size > 0) {
    const check = checkLogoFile(file.name, file.type, file.size);
    if (!check.ok) return { ok: false, error: check.reason };
    const bytes = Buffer.from(await file.arrayBuffer());
    return {
      ok: true,
      input: {
        kind: "file",
        name: logoFilename(file.name, check.mimeType),
        mimeType: check.mimeType,
        bytes,
      },
    };
  }

  const clear = formData.get("clearLogo");
  if (clear === "on" || clear === "1" || clear === "true") {
    return { ok: true, input: { kind: "clear" } };
  }

  const url = formData.get("logoUrl")?.toString().trim() ?? "";
  if (!url) return { ok: true, input: { kind: "unchanged" } };
  if (!isDisplayableLogoUrl(url)) {
    return { ok: false, error: "Logo URL must be an https link to an image." };
  }
  return { ok: true, input: { kind: "url", url } };
}
