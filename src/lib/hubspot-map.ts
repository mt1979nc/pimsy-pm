/**
 * HubSpot deal property → PATH CEO fields. Pure helpers — no fetch, no token.
 *
 * READ-ONLY mapping. PATH stores the result. It never writes these values back.
 * Standard deal properties are the default. Custom internal names are optional
 * overrides; an empty custom value falls back to `closedate` / `amount`.
 * No PHI: deal name, stage, close date, and amount only.
 */
import { parseExpectedArr } from "@/lib/ceo-book";
import { parseDateInput, utcDayKey } from "@/lib/dates";

export const DEFAULT_HUBSPOT_CONTRACT_DATE_PROPERTY = "closedate";
export const DEFAULT_HUBSPOT_ARR_PROPERTY = "amount";

/** HubSpot internal property names. Rejects commas, spaces, and query injection. */
const PROPERTY_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function resolveHubSpotPropertyName(raw: string | null | undefined, fallback: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || !PROPERTY_NAME.test(trimmed)) return fallback;
  return trimmed;
}

/** Properties requested on the deal GET. Always includes the standard fields. */
export function hubspotDealProperties(opts?: {
  contractDateProperty?: string | null;
  arrProperty?: string | null;
}): string[] {
  const contract = resolveHubSpotPropertyName(
    opts?.contractDateProperty,
    DEFAULT_HUBSPOT_CONTRACT_DATE_PROPERTY,
  );
  const arr = resolveHubSpotPropertyName(opts?.arrProperty, DEFAULT_HUBSPOT_ARR_PROPERTY);
  return [...new Set(["dealname", "dealstage", "closedate", "amount", contract, arr])];
}

export function hubspotValueToIsoDay(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  const day = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/);
  if (day?.[1] && isRealIsoDay(day[1])) return day[1];
  if (/^\d{12,13}$/.test(trimmed)) {
    const d = new Date(Number(trimmed));
    if (Number.isNaN(d.getTime())) return null;
    return utcDayKey(d);
  }
  return null;
}

function isRealIsoDay(iso: string): boolean {
  const d = new Date(`${iso}T12:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && utcDayKey(d) === iso;
}

/** Staff-facing close date. UTC calendar day, so midnight HubSpot dates do not shift. */
export function formatHubSpotDateLabel(raw: string | null | undefined): string | null {
  const iso = hubspotValueToIsoDay(raw);
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const month = MONTHS[(m ?? 0) - 1];
  if (!month || !y || !d) return null;
  return `${month} ${d}, ${y}`;
}

export function hubspotAmountToExpectedArr(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const amount = Number(cleaned);
  if (!Number.isFinite(amount)) return null;
  const parsed = parseExpectedArr(amount.toFixed(2));
  return parsed.ok ? parsed.value : null;
}

export type HubSpotPropertyBag = Record<string, unknown> | null | undefined;

function propString(props: HubSpotPropertyBag, name: string): string | null {
  if (!props) return null;
  const value = props[name];
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function firstNonEmpty(primary: string | null, fallback: string | null): string | null {
  return primary || fallback;
}

export type MappedHubSpotCeo = {
  contractDateIso: string | null;
  /** Noon UTC instant for `projects.contractDate`, or null. */
  contractDate: Date | null;
  /** `numeric` string for `projects.expectedArr`, or null. */
  expectedArr: string | null;
  closeDate: string | null;
};

/**
 * Map a deal's properties onto PATH CEO fields.
 * Custom property wins when it has a value. Otherwise closedate / amount.
 */
export function mapHubSpotCeoFields(
  properties: HubSpotPropertyBag,
  opts?: { contractDateProperty?: string | null; arrProperty?: string | null },
): MappedHubSpotCeo {
  const contractProp = resolveHubSpotPropertyName(
    opts?.contractDateProperty,
    DEFAULT_HUBSPOT_CONTRACT_DATE_PROPERTY,
  );
  const arrProp = resolveHubSpotPropertyName(opts?.arrProperty, DEFAULT_HUBSPOT_ARR_PROPERTY);
  const closeDate = propString(properties, "closedate");
  const contractRaw = firstNonEmpty(
    propString(properties, contractProp),
    contractProp === DEFAULT_HUBSPOT_CONTRACT_DATE_PROPERTY ? null : closeDate,
  );
  const arrRaw = firstNonEmpty(
    propString(properties, arrProp),
    arrProp === DEFAULT_HUBSPOT_ARR_PROPERTY ? null : propString(properties, "amount"),
  );
  const contractDateIso = hubspotValueToIsoDay(contractRaw);
  return {
    contractDateIso,
    contractDate: contractDateIso ? parseDateInput(contractDateIso) : null,
    expectedArr: hubspotAmountToExpectedArr(arrRaw),
    closeDate,
  };
}

export function isContractDateEmpty(value: Date | string | null | undefined): boolean {
  if (value == null) return true;
  if (typeof value === "string" && !value.trim()) return true;
  if (value instanceof Date) return Number.isNaN(value.getTime());
  return Number.isNaN(new Date(value).getTime());
}

/** Blank is empty. `0` / `0.00` is a staff-entered amount and must be kept. */
export function isExpectedArrEmpty(value: string | number | null | undefined): boolean {
  if (value == null) return true;
  if (typeof value === "number") return !Number.isFinite(value);
  return !value.trim();
}

export type CeoFieldSnapshot = {
  contractDate: Date | string | null | undefined;
  expectedArr: string | number | null | undefined;
};

export type PulledCeoFields = {
  contractDate: Date | null;
  expectedArr: string | null;
};

/** Fill only PATH fields that are still empty. Never overwrites staff values. */
export function fillEmptyCeoFields(
  existing: CeoFieldSnapshot,
  pulled: PulledCeoFields | null | undefined,
): { contractDate?: Date; expectedArr?: string } {
  const patch: { contractDate?: Date; expectedArr?: string } = {};
  if (!pulled) return patch;
  if (isContractDateEmpty(existing.contractDate) && pulled.contractDate) {
    patch.contractDate = pulled.contractDate;
  }
  if (isExpectedArrEmpty(existing.expectedArr) && pulled.expectedArr) {
    patch.expectedArr = pulled.expectedArr;
  }
  return patch;
}

/**
 * Deal URL save. Clearing the URL returns no CEO keys, so contract date and
 * expected ARR stay as staff left them. Token-unset pulls pass nulls and
 * therefore do not write those columns either.
 */
export function ceoFieldsForDealSave(input: {
  nextUrl: string | null;
  existing: CeoFieldSnapshot;
  pulled: PulledCeoFields | null;
}): { hubspotDealUrl: string | null; contractDate?: Date; expectedArr?: string } {
  if (!input.nextUrl) return { hubspotDealUrl: null };
  return {
    hubspotDealUrl: input.nextUrl,
    ...fillEmptyCeoFields(input.existing, input.pulled),
  };
}
