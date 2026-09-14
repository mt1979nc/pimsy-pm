/**
 * Resolve Dock template binaries from `content/template-attachments/`
 * (real files) or `content/default-attachments/` (markdown placeholders).
 */
import { existsSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import type { DefaultLibraryDef } from "@/db/dock-default-attachments";

export const TEMPLATE_ATTACHMENT_PACK_DIR = resolve(
  process.cwd(),
  "content/template-attachments",
);
export const TEMPLATE_ATTACHMENT_PLACEHOLDER_DIR = resolve(
  process.cwd(),
  "content/default-attachments",
);

const PACK_EXT = new Set([".xlsx", ".xls", ".csv", ".pdf", ".docx", ".doc", ".pptx", ".zip"]);

function stem(name: string) {
  return name.replace(/\.[^.]+$/, "").toLowerCase();
}

export function findPackFile(def: DefaultLibraryDef): string | null {
  const dir = TEMPLATE_ATTACHMENT_PACK_DIR;
  if (!existsSync(dir)) return null;

  if (def.packFileName) {
    const exact = join(dir, def.packFileName);
    if (existsSync(exact)) return exact;
  }

  const wanted = new Set<string>();
  if (def.packFileName) wanted.add(stem(def.packFileName));
  if (def.fileName) wanted.add(stem(def.fileName));
  wanted.add(def.slug.toLowerCase());

  const files = readdirSync(dir).filter((f) => {
    if (f.startsWith(".")) return false;
    if (f.toLowerCase() === "readme.md") return false;
    const ext = extname(f).toLowerCase();
    return PACK_EXT.has(ext);
  });
  const hit = files.find((f) => wanted.has(stem(f)));
  return hit ? join(dir, hit) : null;
}

export function findPlaceholderFile(def: DefaultLibraryDef): string | null {
  if (!def.fileName) return null;
  const path = join(TEMPLATE_ATTACHMENT_PLACEHOLDER_DIR, def.fileName);
  return existsSync(path) ? path : null;
}

export function resolveLibrarySourceFile(def: DefaultLibraryDef): {
  path: string;
  fromPack: boolean;
} | null {
  if ((def.kind ?? "FILE") === "LINK") return null;
  const pack = findPackFile(def);
  if (pack) return { path: pack, fromPack: true };
  const placeholder = findPlaceholderFile(def);
  if (placeholder) return { path: placeholder, fromPack: false };
  return null;
}
