/**
 * Shared http(s) URL parsing for staff-pasted links (task attachments,
 * file-library form URLs, recordings). javascript: and data: never store.
 */
export type ParsedHttpUrl =
  | { ok: true; url: URL }
  | { ok: false; error: string };

export function parseHttpUrl(raw: string): ParsedHttpUrl {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Paste a link first." };
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) {
    return { ok: false, error: "Only http and https links are allowed." };
  }
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, error: "That doesn't look like a valid web address." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http and https links are allowed." };
  }
  return { ok: true, url: parsed };
}

export function defaultLinkLabel(url: URL, name?: string | null): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed.slice(0, 200);
  return (url.hostname + url.pathname.replace(/\/$/, "")).slice(0, 200);
}
