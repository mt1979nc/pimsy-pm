/**
 * Accessing Pimsy auto-fill: bookmark / CRM link, desktop app, practice
 * acronym, and security key. Only fields that already exist are written —
 * never invent a tenant URL or a security key.
 *
 * Desktop installer is the documented public page from the PIMSY Help Desk
 * (“How to Install PIMSY on Your Desktop”).
 */
import { parseHttpUrl } from "@/lib/http-url";

export const PIMSY_DESKTOP_INSTALL_URL = "https://pimsyehr.com/solutions/install-pimsy/";
export const ACCESSING_PIMSY_HEADING = "Access details for this practice:";
export const ACCESSING_PIMSY_CATALOG_BLURB =
  "Bookmark the live site, install the desktop app, and keep the practice acronym and security key handy. Your specialist adds the details here when accounts are ready.";

/** custom_fields keys that mean the PIMSY web bookmark (not HubSpot). */
export const BOOKMARK_CUSTOM_FIELD_KEYS = [
  "bookmark",
  "crmLink",
  "crm_link",
  "pimsyUrl",
  "pimsy_url",
  "pimsyBookmark",
  "pimsy_bookmark",
  "crmBookmark",
] as const;

export type AccessingPimsyFields = {
  bookmarkUrl: string | null;
  desktopAppUrl: string;
  acronym: string | null;
  securityKey: string | null;
};

export function isPracticeAcronym(value: string | null | undefined): boolean {
  const v = value?.trim() ?? "";
  if (!v) return false;
  if (/^(IMP|MIG|TRN|SUP|INT)-/i.test(v)) return false;
  return /^[A-Z0-9][A-Z0-9-]{1,19}$/i.test(v);
}

export function pickPracticeAcronym(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const c of candidates) {
    const t = c?.trim();
    if (t && isPracticeAcronym(t)) return t;
  }
  return null;
}

export function pickSecurityKey(value: string | null | undefined): string | null {
  const t = value?.trim();
  return t ? t : null;
}

export function isPimsyBookmarkUrl(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  const parsed = parseHttpUrl(raw);
  if (!parsed.ok) return false;
  const host = parsed.url.hostname.toLowerCase();
  if (host.includes("zendesk.com")) return false;
  if (host.includes("hubspot.com")) return false;
  return host.includes("pimsy");
}

export function normalizeBookmarkUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const parsed = parseHttpUrl(raw);
  if (!parsed.ok) return null;
  return parsed.url.toString();
}

export function bookmarkFromCustomFields(
  customFields: Record<string, string> | null | undefined,
): string | null {
  if (!customFields) return null;
  for (const key of BOOKMARK_CUSTOM_FIELD_KEYS) {
    const url = normalizeBookmarkUrl(customFields[key]);
    if (url) return url;
  }
  return null;
}

/**
 * Customer website is only used when it already looks like a PIMSY host.
 * A practice marketing site is not a CRM bookmark.
 */
export function bookmarkFromWebsite(website: string | null | undefined): string | null {
  const url = normalizeBookmarkUrl(website);
  if (!url || !isPimsyBookmarkUrl(url)) return null;
  return url;
}

export function mergeBookmarkIntoCustomFields(
  customFields: Record<string, string> | null | undefined,
  bookmarkUrl: string | null,
): Record<string, string> {
  const next: Record<string, string> = { ...(customFields ?? {}) };
  for (const key of BOOKMARK_CUSTOM_FIELD_KEYS) {
    if (key !== "bookmark") delete next[key];
  }
  if (bookmarkUrl) next.bookmark = bookmarkUrl;
  else delete next.bookmark;
  return next;
}

export function customFieldsWithoutBookmark(
  customFields: Record<string, string> | null | undefined,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(customFields ?? {})) {
    if ((BOOKMARK_CUSTOM_FIELD_KEYS as readonly string[]).includes(k)) continue;
    next[k] = v;
  }
  return next;
}

export function accessingPimsyFields(opts: {
  bookmarkUrl?: string | null;
  acronym?: string | null;
  securityKey?: string | null;
}): AccessingPimsyFields {
  return {
    bookmarkUrl: normalizeBookmarkUrl(opts.bookmarkUrl),
    desktopAppUrl: PIMSY_DESKTOP_INSTALL_URL,
    acronym: pickPracticeAcronym(opts.acronym),
    securityKey: pickSecurityKey(opts.securityKey),
  };
}

export function formatAccessingPimsyDescription(fields: AccessingPimsyFields): string {
  const lines: string[] = [
    "Bookmark the live site, install the desktop app, and keep the practice acronym and security key handy.",
    "",
    ACCESSING_PIMSY_HEADING,
    `Desktop application: ${fields.desktopAppUrl}`,
  ];
  if (fields.bookmarkUrl) lines.push(`Bookmark / CRM link: ${fields.bookmarkUrl}`);
  if (fields.acronym) lines.push(`Practice acronym: ${fields.acronym}`);
  if (fields.securityKey) lines.push(`Security key: ${fields.securityKey}`);
  if (!fields.bookmarkUrl && !fields.acronym && !fields.securityKey) {
    lines.push("Your specialist adds the remaining details here when accounts are ready.");
  }
  return lines.join("\n");
}

const KNOWN_FIELD_PREFIXES = [
  "Bookmark / CRM link:",
  "Desktop application:",
  "Practice acronym:",
  "Security key:",
  "Your specialist adds the remaining details here when accounts are ready.",
];

/** True when we can safely rewrite (blank, catalog blurb, or our generated block). */
export function isReplaceableAccessingPimsyDescription(text: string | null | undefined): boolean {
  if (!text || !text.trim()) return true;
  const t = text.trim();
  if (t === ACCESSING_PIMSY_CATALOG_BLURB) return true;
  if (t.includes(ACCESSING_PIMSY_HEADING)) {
    const extra = t
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => {
        if (l === ACCESSING_PIMSY_HEADING) return false;
        if (l.startsWith("Bookmark the live site")) return false;
        return !KNOWN_FIELD_PREFIXES.some((p) => l.startsWith(p));
      });
    return extra.length === 0;
  }
  return false;
}
