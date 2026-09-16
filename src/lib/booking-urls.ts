/**
 * Per-meeting-type booking links (PATH v1.14).
 *
 * Replaces the single project Zoom URL. Kickoff still falls back to the
 * assigned specialist’s personal booking page when About has no kickoff URL.
 * Client-safe: no Postgres imports.
 */
import { parseHttpUrl } from "@/lib/http-url";

export const BOOKING_MEETING_TYPES = [
  "kickoff",
  "workflowDiscovery",
  "billingDiscovery",
  "training1",
  "training2",
  "training3",
] as const;

export type BookingMeetingType = (typeof BOOKING_MEETING_TYPES)[number];

export type BookingUrlMap = Partial<Record<BookingMeetingType, string>>;

export const BOOKING_MEETING_LABELS: Record<BookingMeetingType, string> = {
  kickoff: "Kickoff",
  workflowDiscovery: "Workflow discovery",
  billingDiscovery: "Billing discovery",
  training1: "Training 1",
  training2: "Training 2",
  training3: "Training 3",
};

export const BOOKING_FORM_FIELD = {
  kickoff: "bookingUrl_kickoff",
  workflowDiscovery: "bookingUrl_workflowDiscovery",
  billingDiscovery: "bookingUrl_billingDiscovery",
  training1: "bookingUrl_training1",
  training2: "bookingUrl_training2",
  training3: "bookingUrl_training3",
} as const satisfies Record<BookingMeetingType, string>;

export const SPECIALIST_BOOKING_FIELD = "zoomBookingUrl";

export function isBookingMeetingType(value: string): value is BookingMeetingType {
  return (BOOKING_MEETING_TYPES as readonly string[]).includes(value);
}

export function sanitizeBookingUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const parsed = parseHttpUrl(raw);
  if (!parsed.ok) return null;
  return parsed.url.toString();
}

export function normalizeBookingUrls(raw: unknown): BookingUrlMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: BookingUrlMap = {};
  for (const type of BOOKING_MEETING_TYPES) {
    const value = (raw as Record<string, unknown>)[type];
    if (typeof value !== "string") continue;
    const url = sanitizeBookingUrl(value);
    if (url) out[type] = url;
  }
  return out;
}

/** Copy a legacy project Zoom URL into kickoff when that slot is empty. */
export function migrateLegacyZoomBooking(
  zoomBookingUrl: string | null | undefined,
  existing: BookingUrlMap = {},
): BookingUrlMap {
  const out: BookingUrlMap = { ...existing };
  if (out.kickoff) return out;
  const legacy = sanitizeBookingUrl(zoomBookingUrl);
  if (legacy) out.kickoff = legacy;
  return out;
}

export function resolveProjectBookingUrls(input: {
  bookingUrls?: unknown;
  zoomBookingUrl?: string | null;
  lead?: { zoomBookingUrl?: string | null } | null;
}): BookingUrlMap {
  const stored = migrateLegacyZoomBooking(input.zoomBookingUrl, normalizeBookingUrls(input.bookingUrls));
  if (stored.kickoff) return stored;
  const specialist = sanitizeBookingUrl(input.lead?.zoomBookingUrl);
  if (!specialist) return stored;
  return { ...stored, kickoff: specialist };
}

export function bookingUrlFor(
  urls: BookingUrlMap | null | undefined,
  type: BookingMeetingType,
): string | null {
  const href = urls?.[type];
  return href ? href : null;
}

export function hasAnyBookingUrl(urls: BookingUrlMap | null | undefined): boolean {
  if (!urls) return false;
  return BOOKING_MEETING_TYPES.some((type) => Boolean(urls[type]));
}

export type PortalBookingLink = {
  type: BookingMeetingType;
  label: string;
  href: string;
  hint?: string;
};

export function portalBookingLinks(
  urls: BookingUrlMap,
  opts?: { specialistName?: string | null },
): PortalBookingLink[] {
  const name = opts?.specialistName?.trim();
  return BOOKING_MEETING_TYPES.flatMap((type) => {
    const href = urls[type];
    if (!href) return [];
    const label = BOOKING_MEETING_LABELS[type];
    return [
      {
        type,
        label,
        href,
        hint:
          type === "kickoff" && name
            ? `Book kickoff with ${name}`
            : `Book ${label.toLowerCase()}`,
      },
    ];
  });
}

/**
 * Playbook Schedule-* titles that should open the matching meeting-type
 * booking page. Does not invent URLs — callers only render a CTA when a
 * resolved href exists.
 */
export function bookingMeetingTypeForTitle(title: string): BookingMeetingType | null {
  const t = title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!t) return null;
  if (/\bschedule kickoff\b/.test(t) && !/\brcm\b/.test(t)) return "kickoff";
  if (/\bschedule\b/.test(t) && /\bbilling\b/.test(t) && /\bdiscovery\b/.test(t)) {
    return "billingDiscovery";
  }
  if (/\bschedule\b/.test(t) && /\bworkflow\b/.test(t) && /\bdiscovery\b/.test(t)) {
    return "workflowDiscovery";
  }
  const training = t.match(/\bschedule training ([123])\b/);
  if (training) return `training${training[1]}` as BookingMeetingType;
  return null;
}

export function bookingHrefForTitle(
  title: string,
  urls: BookingUrlMap | null | undefined,
): string | null {
  const type = bookingMeetingTypeForTitle(title);
  if (!type) return null;
  return bookingUrlFor(urls, type);
}

export function bookingButtonLabel(type: BookingMeetingType): string {
  return `Book ${BOOKING_MEETING_LABELS[type]}`;
}

export type ParsedBookingForm =
  | { ok: true; urls: BookingUrlMap }
  | { ok: false; error: string };

export function parseBookingUrlsFromForm(formData: FormData): ParsedBookingForm {
  const urls: BookingUrlMap = {};
  for (const type of BOOKING_MEETING_TYPES) {
    const raw = formData.get(BOOKING_FORM_FIELD[type])?.toString() ?? "";
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const parsed = parseHttpUrl(trimmed);
    if (!parsed.ok) {
      return {
        ok: false,
        error: `${BOOKING_MEETING_LABELS[type]}: ${parsed.error}`,
      };
    }
    urls[type] = parsed.url.toString();
  }
  return { ok: true, urls };
}

export function parseOptionalStaffBookingUrl(
  raw: string | null | undefined,
): { ok: true; url: string | null } | { ok: false; error: string } {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return { ok: true, url: null };
  const parsed = parseHttpUrl(trimmed);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return { ok: true, url: parsed.url.toString() };
}
