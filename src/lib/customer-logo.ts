/**
 * Customer logo display helpers. Pure — safe to import from UI.
 * Uploads are stored privately and shown through /api/customer-logos/[id].
 * External marks are https URLs (Dock account logos, or a link pasted in PATH).
 */

export type CustomerLogoRef = {
  id: string;
  logoUrl?: string | null;
  logoStorageKey?: string | null;
};

const LOGO_MAX_URL = 2000;

/** Square mark initials. Short acronyms (BHC, CEDAR is 5 so CE) stay scannable. */
export function logoInitials(name: string | null | undefined): string {
  const t = (name ?? "").trim();
  if (!t) return "?";
  if (/^[A-Za-z0-9]{2,4}$/.test(t)) return t.toUpperCase();
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** https, or http only for local dev. Rejects javascript: and data: URLs. */
export function isDisplayableLogoUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > LOGO_MAX_URL) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol === "https:") return true;
  if (
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
  ) {
    return true;
  }
  return false;
}

/**
 * img src for a customer mark. Uploads win over a stale URL. Returns null
 * when the row has no usable logo (caller shows initials).
 */
export function customerLogoSrc(row: CustomerLogoRef | null | undefined): string | null {
  if (!row?.id) return null;
  if (row.logoStorageKey) return `/api/customer-logos/${row.id}`;
  const url = row.logoUrl?.trim() ?? "";
  if (!url || !isDisplayableLogoUrl(url)) return null;
  return url;
}
