/**
 * CEO implementation book — pure helpers.
 *
 * Client-safe: no Postgres. The query lives in ceo-book-query.ts.
 * Column rules match the weekly CEO sheet. Empty stored values stay empty;
 * the table renders "—" for them.
 */

import type { CeoStatus } from "@/db/schema";
import { mentionPlainText } from "@/lib/mentions";

export const CEO_STATUSES = [
  "NOT_YET_STARTED",
  "PAUSED",
  "IN_PROCESS_ON_TRACK",
  "IN_PROCESS_OFF_TRACK",
  "LIVE",
] as const satisfies readonly CeoStatus[];

export const CEO_STATUS_LABELS: Record<CeoStatus, string> = {
  NOT_YET_STARTED: "Not yet started",
  PAUSED: "Paused",
  IN_PROCESS_ON_TRACK: "In Process - On track",
  IN_PROCESS_OFF_TRACK: "In Process - Off track",
  LIVE: "Live",
};

/** Scan order: problems first, live last, unset just above live. */
const CEO_STATUS_RANK: Record<CeoStatus, number> = {
  IN_PROCESS_OFF_TRACK: 0,
  IN_PROCESS_ON_TRACK: 1,
  PAUSED: 2,
  NOT_YET_STARTED: 3,
  LIVE: 5,
};

const UNSET_STATUS_RANK = 4;

export type CeoProductType = "EHR" | "RCM" | "EHR+RCM";

/**
 * Sheet product type from the playbook path and whether the site has an RCM track.
 *
 * RCM-only: RCM legacy, or a Prism RCM path that has no EHR tasks.
 * EHR+RCM: EHR+RCM path, Add RCM onto an EHR site, or any other RCM track.
 * Otherwise EHR.
 */
export function ceoProductType(input: {
  playbookPath?: string | null;
  hasRcmTrack: boolean;
  ehrTaskCountTotal?: number | null;
}): CeoProductType {
  const path = input.playbookPath ?? null;
  const ehrTasks = input.ehrTaskCountTotal ?? 0;
  if (path === "RCM_LEGACY") return "RCM";
  if (path === "RCM_PRISM" && ehrTasks === 0) return "RCM";
  if (input.hasRcmTrack || path === "EHR_RCM") return "EHR+RCM";
  return "EHR";
}

/** Project-member roles that count as the sheet's Assigned IS. */
const ASSIGNED_IS_ROLES = new Set([
  "IMPLEMENTATION_SPECIALIST",
  "SPECIALIST",
  "LEAD",
]);

type BookPerson = {
  id: string;
  name: string | null;
  email: string | null;
  role?: string | null;
};

function personLabel(person: { name: string | null; email: string | null }): string {
  return (person.name ?? "").trim() || (person.email ?? "").trim();
}

/**
 * Assigned IS: the project lead, then other members on the IS / lead role.
 * Customers, billing, and RCM-only roles stay off this column.
 */
export function assignedImplementationSpecialists(input: {
  lead: BookPerson | null;
  members: Array<{ role: string; user: BookPerson | null }>;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (person: BookPerson | null | undefined) => {
    if (!person?.id || seen.has(person.id)) return;
    if (person.role === "CUSTOMER") return;
    const label = personLabel(person);
    if (!label) return;
    seen.add(person.id);
    out.push(label);
  };

  push(input.lead);
  const extras = input.members
    .filter((member) => {
      if (!member.user || member.user.role === "CUSTOMER") return false;
      return ASSIGNED_IS_ROLES.has(member.role);
    })
    .map((member) => member.user!)
    .sort((a, b) => personLabel(a).localeCompare(personLabel(b)));
  for (const person of extras) push(person);
  return out;
}

export function formatAssignedIs(names: string[]): string {
  return names.length > 0 ? names.join(", ") : "—";
}

const COMMENT_PREVIEW_MAX = 160;

export function ceoCommentText(summary: string | null | undefined): {
  preview: string | null;
  full: string | null;
} {
  if (!summary?.trim()) return { preview: null, full: null };
  const full = mentionPlainText(summary).replace(/\s+/g, " ").trim();
  if (!full) return { preview: null, full: null };
  if (full.length <= COMMENT_PREVIEW_MAX) return { preview: full, full };
  return { preview: `${full.slice(0, COMMENT_PREVIEW_MAX - 1).trimEnd()}…`, full };
}

export function parseCeoStatus(raw: string | null | undefined): CeoStatus | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  return (CEO_STATUSES as readonly string[]).includes(value) ? (value as CeoStatus) : null;
}

export function isCeoStatusToken(raw: string | null | undefined): boolean {
  const value = (raw ?? "").trim();
  if (!value) return true;
  return (CEO_STATUSES as readonly string[]).includes(value);
}

/** Dollars for the Expected ARR cell. Empty stays null. */
export function parseExpectedArr(
  raw: string | null | undefined,
): { ok: true; value: string | null } | { ok: false; error: string } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || trimmed === "—") return { ok: true, value: null };
  const cleaned = trimmed.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return { ok: false, error: "Expected ARR is a dollar amount, like 32400 or 6973.46." };
  }
  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount > 9_999_999_999.99) {
    return { ok: false, error: "Expected ARR is too large." };
  }
  return { ok: true, value: amount.toFixed(2) };
}

/** Edit-box value. Whole dollars drop the trailing .00. */
export function expectedArrInputValue(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return "";
  if (Number.isInteger(amount)) return String(amount);
  return amount.toFixed(2).replace(/\.?0+$/, "");
}

export function formatExpectedArr(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export type CeoBookSortRow = {
  ceoStatus: CeoStatus | null;
  /** UTC calendar day `YYYY-MM-DD`, or null when current go-live is empty. */
  currentGoLiveSort: string | null;
  abbreviation: string;
};

/** Display row for the executive table. Strings only — safe to pass into a client component. */
export type CeoBookRow = CeoBookSortRow & {
  id: string;
  name: string;
  productType: CeoProductType;
  contractDateInput: string;
  expectedArrInput: string;
  initialGoLive: string;
  currentGoLive: string;
  actualGoLive: string;
  assignedIs: string;
  commentPreview: string | null;
  commentFull: string | null;
  excludeFromAnalytics: boolean;
};

export function compareCeoBookRows(a: CeoBookSortRow, b: CeoBookSortRow): number {
  const ar = a.ceoStatus ? CEO_STATUS_RANK[a.ceoStatus] : UNSET_STATUS_RANK;
  const br = b.ceoStatus ? CEO_STATUS_RANK[b.ceoStatus] : UNSET_STATUS_RANK;
  if (ar !== br) return ar - br;
  if (a.currentGoLiveSort !== b.currentGoLiveSort) {
    if (!a.currentGoLiveSort) return 1;
    if (!b.currentGoLiveSort) return -1;
    return a.currentGoLiveSort.localeCompare(b.currentGoLiveSort);
  }
  return a.abbreviation.localeCompare(b.abbreviation);
}

export function summarizeCeoBook(rows: Array<{ ceoStatus: CeoStatus | null }>): string {
  const counts = new Map<string, number>();
  for (const status of CEO_STATUSES) counts.set(status, 0);
  counts.set("UNSET", 0);
  for (const row of rows) counts.set(row.ceoStatus ?? "UNSET", (counts.get(row.ceoStatus ?? "UNSET") ?? 0) + 1);
  const parts = [
    ...CEO_STATUSES.map((status) => `${CEO_STATUS_LABELS[status]} ${counts.get(status) ?? 0}`),
    `Not set ${counts.get("UNSET") ?? 0}`,
  ];
  return parts.join(" · ");
}
