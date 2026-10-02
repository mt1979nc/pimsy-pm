/**
 * Pure helpers for filling the CEO executive book from Alexander's sheet.
 *
 * Match key: uppercase Abbreviation against crmAcronym, then prismClientId,
 * then code — the same three fields listCeoBook uses for the displayed
 * abbreviation. Empty sheet cells do not clear PATH. Assigned IS is ignored.
 */

import type { CeoStatus } from "@/db/schema";
import { CEO_STATUSES, parseCeoComments, parseExpectedArr } from "@/lib/ceo-book";
import { parseDateInput, toDateInput } from "@/lib/dates";

const SHEET_STATUS_LABELS: Record<string, CeoStatus> = {
  live: "LIVE",
  paused: "PAUSED",
  "in process - on track": "IN_PROCESS_ON_TRACK",
  "in process - off track": "IN_PROCESS_OFF_TRACK",
};

export const EXECUTIVE_SHEET_FIELDS = [
  "contractDate",
  "expectedArr",
  "initialGoLiveDate",
  "targetGoLiveDate",
  "actualGoLiveDate",
  "ceoStatus",
  "ceoComments",
] as const;

export type ExecutiveSheetField = (typeof EXECUTIVE_SHEET_FIELDS)[number];

export const EXECUTIVE_SHEET_FIELD_LABELS: Record<ExecutiveSheetField, string> = {
  contractDate: "Contract Date",
  expectedArr: "Expected ARR",
  initialGoLiveDate: "Initial Go Live Target",
  targetGoLiveDate: "Current Go Live Target",
  actualGoLiveDate: "Actual Go Live",
  ceoStatus: "Status",
  ceoComments: "Comments",
};

const REQUIRED_COLUMNS = [
  "Name",
  "Abbreviation",
  "Contract Date",
  "Expected ARR",
  "Initial Go Live Target",
  "Current Go Live Target",
  "Actual Go Live",
  "Status",
  "Comments",
] as const;

export type ExecutiveSheetRow = {
  /** 1-based CSV record number. The header is record 1. */
  rowNumber: number;
  name: string;
  /** Uppercase abbreviation. Empty when the sheet cell is blank. */
  abbreviation: string;
  contractDateRaw: string;
  expectedArrRaw: string;
  initialGoLiveRaw: string;
  currentGoLiveRaw: string;
  actualGoLiveRaw: string;
  statusRaw: string;
  commentsRaw: string;
};

export type ParsedSheetDate =
  | { kind: "empty" }
  | { kind: "date"; iso: string; date: Date; normalizedFrom?: string }
  | { kind: "invalid"; raw: string; detail: string };

export type MappedSheetStatus =
  | { kind: "empty" }
  | { kind: "status"; status: CeoStatus }
  | { kind: "unknown"; raw: string };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Sheet typo: `11/2//2026` (month/day, doubled slash, year). */
const DOUBLED_SLASH_DATE = /^(\d{1,2})\/(\d{1,2})\/\/(\d{4})$/;

function calendarNoon(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

function isoFromParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** ISO `YYYY-MM-DD`, or the one doubled-slash US date in the cleaned sheet. */
export function parseSheetDate(raw: string | null | undefined): ParsedSheetDate {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { kind: "empty" };

  const iso = ISO_DATE.exec(trimmed);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const date = calendarNoon(year, month, day);
    if (!date) return { kind: "invalid", raw: trimmed, detail: "not a real calendar day" };
    return { kind: "date", iso: trimmed, date };
  }

  const slash = DOUBLED_SLASH_DATE.exec(trimmed);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    const year = Number(slash[3]);
    const date = calendarNoon(year, month, day);
    if (!date) return { kind: "invalid", raw: trimmed, detail: "not a real calendar day" };
    return {
      kind: "date",
      iso: isoFromParts(year, month, day),
      date,
      normalizedFrom: trimmed,
    };
  }

  return { kind: "invalid", raw: trimmed, detail: "not a YYYY-MM-DD date" };
}

/** Sheet label → CeoStatus. Anything else is unknown and must not be written. */
export function mapSheetCeoStatus(raw: string | null | undefined): MappedSheetStatus {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { kind: "empty" };
  if ((CEO_STATUSES as readonly string[]).includes(trimmed)) {
    return { kind: "status", status: trimmed as CeoStatus };
  }
  const key = trimmed.toLowerCase().replace(/\s+/g, " ");
  const status = SHEET_STATUS_LABELS[key];
  if (!status) return { kind: "unknown", raw: trimmed };
  return { kind: "status", status };
}

export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (!(row.length === 1 && row[0] === "")) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }

  if (inQuotes) throw new Error("Executive sheet CSV ended inside a quoted field.");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function parseExecutiveSheetCsv(text: string): ExecutiveSheetRow[] {
  const table = parseCsv(text);
  if (table.length === 0) throw new Error("Executive sheet CSV is empty.");
  const header = table[0]!.map((cell) => cell.trim());
  const missing = REQUIRED_COLUMNS.filter((name) => !header.includes(name));
  if (missing.length > 0) {
    throw new Error(`Executive sheet CSV is missing columns: ${missing.join(", ")}`);
  }
  const index = (name: string) => header.indexOf(name);
  const nameIdx = index("Name");
  const abbrIdx = index("Abbreviation");
  const contractIdx = index("Contract Date");
  const arrIdx = index("Expected ARR");
  const initialIdx = index("Initial Go Live Target");
  const currentIdx = index("Current Go Live Target");
  const actualIdx = index("Actual Go Live");
  const statusIdx = index("Status");
  const commentsIdx = index("Comments");

  const rows: ExecutiveSheetRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const cells = table[i]!;
    const values = [
      cells[nameIdx],
      cells[abbrIdx],
      cells[contractIdx],
      cells[arrIdx],
      cells[initialIdx],
      cells[currentIdx],
      cells[actualIdx],
      cells[statusIdx],
      cells[commentsIdx],
    ];
    if (values.every((value) => !(value ?? "").trim())) continue;
    rows.push({
      rowNumber: i + 1,
      name: (cells[nameIdx] ?? "").trim(),
      abbreviation: (cells[abbrIdx] ?? "").trim().toUpperCase(),
      contractDateRaw: (cells[contractIdx] ?? "").trim(),
      expectedArrRaw: (cells[arrIdx] ?? "").trim(),
      initialGoLiveRaw: (cells[initialIdx] ?? "").trim(),
      currentGoLiveRaw: (cells[currentIdx] ?? "").trim(),
      actualGoLiveRaw: (cells[actualIdx] ?? "").trim(),
      statusRaw: (cells[statusIdx] ?? "").trim(),
      commentsRaw: (cells[commentsIdx] ?? "").trim(),
    });
  }
  return rows;
}

export function dedupeExecutiveSheetRows(rows: readonly ExecutiveSheetRow[]): {
  rows: ExecutiveSheetRow[];
  duplicates: { abbreviation: string; keptRow: number; droppedRows: number[] }[];
} {
  const byAbbreviation = new Map<string, ExecutiveSheetRow[]>();
  for (const row of rows) {
    if (!row.abbreviation) continue;
    const list = byAbbreviation.get(row.abbreviation) ?? [];
    list.push(row);
    byAbbreviation.set(row.abbreviation, list);
  }

  const duplicates: { abbreviation: string; keptRow: number; droppedRows: number[] }[] = [];
  const kept: ExecutiveSheetRow[] = [];
  for (const row of rows) {
    if (!row.abbreviation) {
      kept.push(row);
      continue;
    }
    const list = byAbbreviation.get(row.abbreviation)!;
    const last = list[list.length - 1]!;
    if (list.length > 1 && row.rowNumber !== last.rowNumber) continue;
    kept.push(row);
    if (list.length > 1 && row.rowNumber === last.rowNumber) {
      duplicates.push({
        abbreviation: row.abbreviation,
        keptRow: last.rowNumber,
        droppedRows: list.slice(0, -1).map((item) => item.rowNumber),
      });
    }
  }
  return { rows: kept, duplicates };
}

export type ExecutiveStored = {
  contractDate: Date | string | null;
  expectedArr: string | number | null;
  initialGoLiveDate: Date | string | null;
  targetGoLiveDate: Date | string | null;
  actualGoLiveDate: Date | string | null;
  ceoStatus: CeoStatus | null;
  ceoComments: string | null;
};

export const EMPTY_EXECUTIVE_STORED: ExecutiveStored = {
  contractDate: null,
  expectedArr: null,
  initialGoLiveDate: null,
  targetGoLiveDate: null,
  actualGoLiveDate: null,
  ceoStatus: null,
  ceoComments: null,
};

export type PlannedCell =
  | { field: ExecutiveSheetField; action: "update"; from: string | null; to: string; note?: string }
  | { field: ExecutiveSheetField; action: "skip-empty" }
  | { field: ExecutiveSheetField; action: "skip-invalid"; raw: string; detail: string }
  | { field: ExecutiveSheetField; action: "unchanged"; value: string };

function storedDateIso(value: Date | string | null | undefined): string | null {
  const iso = toDateInput(value ?? null);
  return iso || null;
}

function storedArr(value: string | number | null | undefined): string | null {
  if (value == null || value === "") return null;
  const amount = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(amount)) return null;
  return amount.toFixed(2);
}

function planDate(
  field: ExecutiveSheetField,
  raw: string,
  stored: Date | string | null,
): PlannedCell {
  const parsed = parseSheetDate(raw);
  if (parsed.kind === "empty") return { field, action: "skip-empty" };
  if (parsed.kind === "invalid") {
    return { field, action: "skip-invalid", raw: parsed.raw, detail: parsed.detail };
  }
  const current = storedDateIso(stored);
  if (current === parsed.iso) return { field, action: "unchanged", value: parsed.iso };
  return {
    field,
    action: "update",
    from: current,
    to: parsed.iso,
    note: parsed.normalizedFrom ? `normalized ${parsed.normalizedFrom}` : undefined,
  };
}

export function planExecutiveSheetUpdate(row: ExecutiveSheetRow, stored: ExecutiveStored): PlannedCell[] {
  const cells: PlannedCell[] = [
    planDate("contractDate", row.contractDateRaw, stored.contractDate),
    planArr(row.expectedArrRaw, stored.expectedArr),
    planDate("initialGoLiveDate", row.initialGoLiveRaw, stored.initialGoLiveDate),
    planDate("targetGoLiveDate", row.currentGoLiveRaw, stored.targetGoLiveDate),
    planDate("actualGoLiveDate", row.actualGoLiveRaw, stored.actualGoLiveDate),
    planStatus(row.statusRaw, stored.ceoStatus),
    planComments(row.commentsRaw, stored.ceoComments),
  ];
  return cells;
}

function planArr(raw: string, stored: string | number | null): PlannedCell {
  const parsed = parseExpectedArr(raw);
  if (!parsed.ok) {
    return { field: "expectedArr", action: "skip-invalid", raw: raw.trim(), detail: parsed.error };
  }
  if (parsed.value == null) return { field: "expectedArr", action: "skip-empty" };
  const current = storedArr(stored);
  if (current === parsed.value) return { field: "expectedArr", action: "unchanged", value: parsed.value };
  return { field: "expectedArr", action: "update", from: current, to: parsed.value };
}

function planStatus(raw: string, stored: CeoStatus | null): PlannedCell {
  const mapped = mapSheetCeoStatus(raw);
  if (mapped.kind === "empty") return { field: "ceoStatus", action: "skip-empty" };
  if (mapped.kind === "unknown") {
    return {
      field: "ceoStatus",
      action: "skip-invalid",
      raw: mapped.raw,
      detail: "unrecognized status; left unchanged",
    };
  }
  const current = stored ?? null;
  if (current === mapped.status) return { field: "ceoStatus", action: "unchanged", value: mapped.status };
  return { field: "ceoStatus", action: "update", from: current, to: mapped.status };
}

function planComments(raw: string, stored: string | null): PlannedCell {
  const next = parseCeoComments(raw);
  if (!next) return { field: "ceoComments", action: "skip-empty" };
  const current = parseCeoComments(stored);
  if (current === next) return { field: "ceoComments", action: "unchanged", value: next };
  return { field: "ceoComments", action: "update", from: current, to: next };
}

export type ExecutiveUpdateValues = {
  contractDate?: Date;
  expectedArr?: string;
  initialGoLiveDate?: Date;
  targetGoLiveDate?: Date;
  actualGoLiveDate?: Date;
  ceoStatus?: CeoStatus;
  ceoComments?: string;
};

/** Values to write. Null when every sheet cell was empty, invalid, or already stored. */
export function executiveUpdateValues(cells: readonly PlannedCell[]): ExecutiveUpdateValues | null {
  const updates = cells.filter(
    (cell): cell is Extract<PlannedCell, { action: "update" }> => cell.action === "update",
  );
  if (updates.length === 0) return null;
  const out: ExecutiveUpdateValues = {};
  for (const cell of updates) {
    switch (cell.field) {
      case "contractDate":
      case "initialGoLiveDate":
      case "targetGoLiveDate":
      case "actualGoLiveDate": {
        const date = parseDateInput(cell.to);
        if (!date) throw new Error(`Refusing to write an invalid ${cell.field}: ${cell.to}`);
        out[cell.field] = date;
        break;
      }
      case "expectedArr":
        out.expectedArr = cell.to;
        break;
      case "ceoStatus":
        out.ceoStatus = cell.to as CeoStatus;
        break;
      case "ceoComments":
        out.ceoComments = cell.to;
        break;
      default: {
        const unexpected: never = cell.field;
        throw new Error(`Unexpected executive sheet field ${unexpected}`);
      }
    }
  }
  return out;
}

export type ExecutiveMatchCandidate = {
  id: string;
  code: string;
  name: string;
  customerName: string | null;
  crmAcronym: string | null;
  prismClientId: string | null;
  type: string;
  status: string;
  archivedAt: Date | string | null;
  prismStatus: string | null;
  excludeFromAnalytics: boolean;
  customerExcluded: boolean;
  stored: ExecutiveStored;
};

/** 0 = crmAcronym, 1 = prismClientId, 2 = code, 99 = no match. */
export function executiveMatchRank(candidate: ExecutiveMatchCandidate, acronym: string): number {
  const key = acronym.trim().toUpperCase();
  if (!key) return 99;
  if ((candidate.crmAcronym ?? "").trim().toUpperCase() === key) return 0;
  if ((candidate.prismClientId ?? "").trim().toUpperCase() === key) return 1;
  if (candidate.code.trim().toUpperCase() === key) return 2;
  return 99;
}

export function isActiveImplementation(candidate: ExecutiveMatchCandidate): boolean {
  return !candidate.archivedAt && candidate.type === "IMPLEMENTATION" && candidate.status !== "CANCELLED";
}

/** Same gates as listCeoBook with analytics exclusions applied. */
export function isOnExecutiveBook(candidate: ExecutiveMatchCandidate): boolean {
  if (!isActiveImplementation(candidate)) return false;
  if (candidate.prismStatus === "pipeline") return false;
  if (candidate.excludeFromAnalytics || candidate.customerExcluded) return false;
  return true;
}

export type ExecutivePick =
  | { kind: "unmatched" }
  | {
      kind: "match";
      project: ExecutiveMatchCandidate;
      alternates: ExecutiveMatchCandidate[];
      tier: "executive-book" | "implementation";
    }
  | {
      kind: "ambiguous";
      tier: "executive-book" | "implementation";
      candidates: ExecutiveMatchCandidate[];
    }
  | { kind: "ineligible"; candidates: ExecutiveMatchCandidate[] };

function byCode(a: ExecutiveMatchCandidate, b: ExecutiveMatchCandidate): number {
  return a.code.localeCompare(b.code) || a.id.localeCompare(b.id);
}

function preferAbbreviation(
  tier: ExecutiveMatchCandidate[],
  key: string,
): { chosen: ExecutiveMatchCandidate[]; rest: ExecutiveMatchCandidate[] } {
  let best = 99;
  for (const row of tier) best = Math.min(best, executiveMatchRank(row, key));
  const chosen = tier.filter((row) => executiveMatchRank(row, key) === best).sort(byCode);
  const rest = tier.filter((row) => executiveMatchRank(row, key) !== best).sort(byCode);
  return { chosen, rest };
}

/**
 * Prefer the project that would appear on the Executive book.
 * If several still tie on the abbreviation field, skip them.
 */
export function pickExecutiveProject(
  acronym: string,
  candidates: readonly ExecutiveMatchCandidate[],
): ExecutivePick {
  const key = acronym.trim().toUpperCase();
  if (!key) return { kind: "unmatched" };
  const matches = candidates.filter((candidate) => executiveMatchRank(candidate, key) < 99);
  if (matches.length === 0) return { kind: "unmatched" };

  const book = matches.filter(isOnExecutiveBook);
  if (book.length > 0) {
    const { chosen, rest } = preferAbbreviation(book, key);
    const outside = matches.filter((candidate) => !book.includes(candidate)).sort(byCode);
    if (chosen.length === 1) {
      return {
        kind: "match",
        project: chosen[0]!,
        alternates: [...rest, ...outside].sort(byCode),
        tier: "executive-book",
      };
    }
    return { kind: "ambiguous", tier: "executive-book", candidates: chosen };
  }

  const active = matches.filter(isActiveImplementation);
  if (active.length > 0) {
    const { chosen, rest } = preferAbbreviation(active, key);
    const outside = matches.filter((candidate) => !active.includes(candidate)).sort(byCode);
    if (chosen.length === 1) {
      return {
        kind: "match",
        project: chosen[0]!,
        alternates: [...rest, ...outside].sort(byCode),
        tier: "implementation",
      };
    }
    return { kind: "ambiguous", tier: "implementation", candidates: chosen };
  }

  return { kind: "ineligible", candidates: [...matches].sort(byCode) };
}
