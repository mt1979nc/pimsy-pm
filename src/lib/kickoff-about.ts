/**
 * Kickoff / About facts from fields PATH already stores.
 *
 * HubSpot stays staff-only on the About form. The customer About tab shows
 * kickoff date, go-live, specialist, Zoom booking, notes, a small set of
 * custom-field keys, and kickoff-named recordings — never deal URLs or CRM keys.
 */

import { fmtDate } from "@/lib/dates";
import { parseHttpUrl } from "@/lib/http-url";

export type KickoffAudience = "staff" | "portal";

export type KickoffRecording = {
  name: string;
  url?: string | null;
  visibility?: "INTERNAL" | "SHARED" | string | null;
};

export type KickoffAboutInput = {
  startDate?: Date | string | null;
  targetGoLiveDate?: Date | string | null;
  zoomBookingUrl?: string | null;
  crmAcronym?: string | null;
  aboutNotes?: string | null;
  leadName?: string | null;
  leadTitle?: string | null;
  customFields?: Record<string, string> | null;
  recordings?: KickoffRecording[] | null;
};

export type KickoffFact = {
  key: string;
  label: string;
  value: string;
  href?: string;
};

/** Custom-field keys (letters only, case-insensitive) the portal may show. */
const PORTAL_CUSTOM_FIELD_LABELS: Record<string, string> = {
  timezone: "Timezone",
  preferredcontact: "Preferred contact",
  kickofftime: "Kickoff time",
  meetingtime: "Kickoff time",
  meetinglink: "Kickoff meeting link",
  kickofflink: "Kickoff meeting link",
};

function lettersKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function compact(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function hrefFor(value: string): string | undefined {
  const parsed = parseHttpUrl(value);
  return parsed.ok ? parsed.url.toString() : undefined;
}

export function portalSafeCustomFacts(
  customFields: Record<string, string> | null | undefined,
): KickoffFact[] {
  if (!customFields) return [];
  const facts: KickoffFact[] = [];
  const seen = new Set<string>();
  for (const [rawKey, rawValue] of Object.entries(customFields)) {
    const value = compact(rawValue);
    if (!value) continue;
    const normalized = lettersKey(rawKey);
    const label = PORTAL_CUSTOM_FIELD_LABELS[normalized];
    if (!label) continue;
    const key = `custom:${normalized}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const href = hrefFor(value);
    if (/link/i.test(label) && !href) continue;
    facts.push({
      key,
      label,
      value,
      href,
    });
  }
  return facts;
}

export function kickoffNamedRecordings(
  recordings: KickoffRecording[] | null | undefined,
  audience: KickoffAudience,
): KickoffFact[] {
  if (!recordings?.length) return [];
  const facts: KickoffFact[] = [];
  for (const rec of recordings) {
    const name = compact(rec.name);
    const url = compact(rec.url);
    if (!name || !url) continue;
    if (!/kickoff/i.test(name)) continue;
    if (audience === "portal" && rec.visibility !== "SHARED") continue;
    const href = hrefFor(url);
    if (!href) continue;
    facts.push({
      key: `recording:${name.toLowerCase()}`,
      label: name,
      value: "Open recording",
      href,
    });
  }
  return facts;
}

export function kickoffFacts(
  input: KickoffAboutInput,
  audience: KickoffAudience = "portal",
): KickoffFact[] {
  const facts: KickoffFact[] = [];
  const acronym = compact(input.crmAcronym);
  if (acronym) facts.push({ key: "acronym", label: "Account", value: acronym });

  if (input.startDate) {
    facts.push({ key: "kickoff", label: "Kickoff", value: fmtDate(input.startDate) });
  }
  if (input.targetGoLiveDate) {
    facts.push({ key: "golive", label: "Target go-live", value: fmtDate(input.targetGoLiveDate) });
  }

  const lead = compact(input.leadName);
  if (lead) {
    const title = compact(input.leadTitle);
    facts.push({
      key: "specialist",
      label: "Specialist",
      value: title ? `${lead} · ${title}` : lead,
    });
  }

  const booking = compact(input.zoomBookingUrl);
  if (booking) {
    const href = hrefFor(booking);
    if (href) {
      facts.push({
        key: "booking",
        label: "Book a call",
        value: "Open Zoom booking",
        href,
      });
    }
  }

  facts.push(...portalSafeCustomFacts(input.customFields));
  facts.push(...kickoffNamedRecordings(input.recordings, audience));
  return facts;
}

export function extraKickoffFacts(
  input: KickoffAboutInput,
  audience: KickoffAudience = "portal",
): KickoffFact[] {
  return kickoffFacts(input, audience).filter(
    (fact) =>
      fact.key === "specialist" ||
      fact.key.startsWith("custom:") ||
      fact.key.startsWith("recording:"),
  );
}

export function hasKickoffAboutContent(input: KickoffAboutInput, audience: KickoffAudience = "portal"): boolean {
  if (compact(input.aboutNotes)) return true;
  return kickoffFacts(input, audience).length > 0;
}
