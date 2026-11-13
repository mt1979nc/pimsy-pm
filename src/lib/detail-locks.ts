/**
 * Customer and site details edited in PATH. A field is path-managed only
 * after someone changes it. Prism import then leaves that field alone.
 */

export const CUSTOMER_LOCK_FIELDS = [
  "name",
  "practiceType",
  "website",
  "phone",
  "city",
  "state",
  "priorSystem",
  "seatCount",
  "logoUrl",
  "status",
] as const;

export const PROJECT_LOCK_FIELDS = ["acronym", "hubspotDealUrl", "contractDate", "expectedArr"] as const;

export type CustomerLockField = (typeof CUSTOMER_LOCK_FIELDS)[number];
export type ProjectLockField = (typeof PROJECT_LOCK_FIELDS)[number];

const CUSTOMER_STATUSES = ["PROSPECT", "ONBOARDING", "LIVE", "AT_RISK", "CHURNED"] as const;

export function detailText(value: string | number | null | undefined): string {
  return value == null ? "" : String(value).trim();
}

export function nextPathManagedFields(existing: readonly string[] | null | undefined, changed: readonly string[]): string[] {
  return [...new Set([...(existing ?? []), ...changed])];
}

export function changedDetailFields(
  before: Record<string, string>,
  after: Record<string, string>,
  fields: readonly string[],
): string[] {
  return fields.filter((field) => detailText(before[field]) !== detailText(after[field]));
}

export function isFieldLocked(locked: readonly string[] | null | undefined, field: string): boolean {
  return (locked ?? []).includes(field);
}

/** Drop customer columns Prism import must not write once PATH has edited them. */
export function lockedCustomerUpdate<T extends { name?: string; seatCount?: number; status?: string }>(
  patch: T,
  locked: readonly string[] | null | undefined,
): T {
  const out = { ...patch };
  if (isFieldLocked(locked, "name")) delete out.name;
  if (isFieldLocked(locked, "seatCount")) delete out.seatCount;
  if (isFieldLocked(locked, "status")) delete out.status;
  return out;
}

export function acronymKey(value: string): string {
  return value.trim().toUpperCase();
}

export function acronymColumns(input: {
  code: string;
  crmAcronym: string | null;
  prismClientId: string | null;
  next: string;
  /** Another project, including an archived one, already uses this code. */
  codeTaken: boolean;
}): { crmAcronym: string; code?: string; prismClientId?: string } {
  const old = acronymKey(input.crmAcronym || input.prismClientId || input.code);
  const next = acronymKey(input.next);
  const patch: { crmAcronym: string; code?: string; prismClientId?: string } = { crmAcronym: next };
  if (acronymKey(input.code) === old && !input.codeTaken) patch.code = next;
  if (!input.prismClientId || acronymKey(input.prismClientId) === old) patch.prismClientId = next;
  return patch;
}

export function acronymTaken(
  acronym: string,
  selfId: string,
  rows: readonly {
    id: string;
    code: string | null;
    crmAcronym: string | null;
    prismClientId: string | null;
    archivedAt?: Date | string | null;
  }[],
): boolean {
  const key = acronymKey(acronym);
  if (!key) return false;
  return rows.some((row) => {
    if (row.id === selfId || row.archivedAt) return false;
    return [row.code, row.crmAcronym, row.prismClientId].some((value) => value && acronymKey(value) === key);
  });
}

export function customerDetailError(input: {
  name: string;
  website: string;
  logoUrl: string;
  hubspotDealUrl: string;
  seatCount: string;
  status: string;
  contractDate: string;
  expectedArr: string;
  acronym: string;
}): string | null {
  if (!input.name.trim()) return "Customer name is required.";
  if (input.name.trim().length > 200) return "Customer name is too long.";
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{1,19}$/.test(input.acronym.trim())) {
    return "Acronym must be 2–20 letters or numbers.";
  }
  if (input.status && !CUSTOMER_STATUSES.includes(input.status as (typeof CUSTOMER_STATUSES)[number])) {
    return "Choose a customer status.";
  }
  for (const [label, value] of [
    ["Website", input.website],
    ["Logo URL", input.logoUrl],
    ["CRM link", input.hubspotDealUrl],
  ] as const) {
    const text = value.trim();
    if (text && !/^https?:\/\//i.test(text)) return `${label} must start with http:// or https://.`;
  }
  if (input.seatCount.trim()) {
    const seats = Number.parseInt(input.seatCount, 10);
    if (!Number.isFinite(seats) || seats < 0 || String(seats) !== input.seatCount.trim()) {
      return "Seats must be a whole number.";
    }
  }
  if (input.contractDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(input.contractDate.trim())) {
    return "Contract date must be a real date.";
  }
  const arr = input.expectedArr.trim();
  if (arr && !/^\d+(\.\d{1,2})?$/.test(arr.replace(/[$,\s]/g, ""))) {
    return "Expected ARR is a dollar amount, like 32400.";
  }
  return null;
}
