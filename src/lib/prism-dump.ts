/**
 * Prism Azure SQL / getState dump — parse + normalize.
 *
 * Accepts:
 *  - Canonical dump from `scripts/dump-prism-sql.ts`
 *  - Raw table rows (Team / Customers / CompletedImplementations / FormerTeam)
 *  - Prism `getState` document (team + customers + completed)
 *
 * Does not connect to anything. Mapping to PM is `src/lib/prism-import.ts`.
 */

import { parseDateInput } from "@/lib/dates";
import { isPrismStatus, type PrismStatus } from "@/lib/prism-status";
import { prismSelToServiceLines } from "@/lib/service-line-map";

export const PRISM_DUMP_VERSION = 1 as const;

export type PrismTeamFlags = {
  capacityExempt: boolean;
  canLead: boolean;
  director: boolean;
};

export type PrismDumpTeamMember = {
  teamId: string;
  name: string;
  hoursPerWeek: number;
  flags: PrismTeamFlags;
  email?: string | null;
  active: boolean;
};

export type PrismDumpSlip = {
  from: string | null;
  to: string | null;
  days: number | null;
  cause: "CUSTOMER" | "PIMSY" | null;
  note: string | null;
};

export type PrismDumpCustomer = {
  id: string;
  acct: string;
  owner: string | null;
  owner2: string | null;
  split: number;
  users: number;
  fp: number;
  locations: number;
  trainingsPerWeek: number;
  sel: Record<string, boolean>;
  serviceLines: string[];
  status: PrismStatus;
  note: string | null;
  kickoffDate: string | null;
  goliveDate: string | null;
  initialGolive: string | null;
  stateComp: boolean;
  supportStruct: boolean;
  customHpw: number | null;
  slipLog: PrismDumpSlip[];
  dockWorkspaceId: string | null;
};

export type PrismDumpCompleted = {
  id: string;
  acct: string;
  era: "legacy" | "current" | string | null;
  owner: string | null;
  users: number;
  complexity: string | null;
  estimatedHours: number | null;
  kickoffDate: string | null;
  goliveDate: string | null;
  initialGolive: string | null;
  forecastDays: number | null;
};

export type PrismDump = {
  version: typeof PRISM_DUMP_VERSION;
  exportedAt: string | null;
  source: string;
  team: PrismDumpTeamMember[];
  formerTeam: PrismDumpTeamMember[];
  customers: PrismDumpCustomer[];
  completed: PrismDumpCompleted[];
};

export class PrismDumpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrismDumpError";
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asString(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asBool(v: unknown): boolean {
  if (v === true || v === 1 || v === "1" || v === "true" || v === "True") return true;
  return false;
}

function parseJsonField(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  }
  return null;
}

function isoDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const raw = asString(v);
  if (!raw) return null;
  const parsed = parseDateInput(raw.slice(0, 10) === raw ? raw : raw);
  if (!parsed) {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
}

function normalizeTeamId(v: unknown): string {
  return (asString(v) ?? "").trim().toLowerCase();
}

function normalizeAcronym(v: unknown): string {
  return (asString(v) ?? "").trim().toUpperCase();
}

function parseFlags(raw: unknown): PrismTeamFlags {
  const obj = asRecord(parseJsonField(raw) ?? raw) ?? {};
  const canLead = obj.canLead === undefined && obj.can_lead === undefined ? true : asBool(obj.canLead ?? obj.can_lead);
  return {
    capacityExempt: asBool(obj.capacityExempt ?? obj.capacity_exempt),
    canLead,
    director: asBool(obj.director ?? obj.isDirector ?? obj.is_director),
  };
}

function parseSlipCause(v: unknown): "CUSTOMER" | "PIMSY" | null {
  const s = (asString(v) ?? "").toLowerCase();
  if (s === "customer") return "CUSTOMER";
  if (s === "pimsy" || s === "internal") return "PIMSY";
  return null;
}

function parseSlipLog(raw: unknown): PrismDumpSlip[] {
  const list = asArray(parseJsonField(raw) ?? raw);
  const out: PrismDumpSlip[] = [];
  for (const item of list) {
    const row = asRecord(item);
    if (!row) continue;
    out.push({
      from: isoDate(row.from ?? row.fromDate ?? row.from_date),
      to: isoDate(row.to ?? row.toDate ?? row.to_date),
      days: asNumber(row.days),
      cause: parseSlipCause(row.cause),
      note: asString(row.note),
    });
  }
  return out;
}

function parseSel(raw: unknown): Record<string, boolean> {
  const obj = asRecord(parseJsonField(raw) ?? raw) ?? {};
  const sel: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (asBool(v)) sel[k] = true;
  }
  return sel;
}

function parsePrismStatus(v: unknown): PrismStatus {
  const s = (asString(v) ?? "active").toLowerCase();
  if (s === "prekickoff" || s === "pre_kickoff") return "pre-kickoff";
  if (isPrismStatus(s)) return s;
  if (s === "stalled" || s === "special") return "active";
  return "active";
}

function parseTeamMember(raw: unknown, active: boolean): PrismDumpTeamMember | null {
  const row = asRecord(raw);
  if (!row) return null;
  const teamId = normalizeTeamId(row.teamId ?? row.TeamId ?? row.id ?? row.key);
  const name = asString(row.name ?? row.Name);
  if (!teamId || !name) return null;
  const hours = asNumber(row.hoursPerWeek ?? row.HoursPerWeek ?? row.hours) ?? 30;
  return {
    teamId,
    name,
    hoursPerWeek: hours > 0 ? hours : 30,
    flags: parseFlags(row.flags ?? row.Flags),
    email: asString(row.email ?? row.Email)?.toLowerCase() ?? null,
    active,
  };
}

function parseCustomerFromData(raw: unknown, tableRow?: Record<string, unknown>): PrismDumpCustomer | null {
  const data = asRecord(parseJsonField(raw) ?? raw) ?? {};
  const id = normalizeAcronym(
    data.id ?? data.CustomerId ?? tableRow?.CustomerId ?? tableRow?.customerId ?? tableRow?.id,
  );
  const acct = asString(data.acct ?? data.AccountName ?? tableRow?.AccountName ?? tableRow?.accountName ?? data.id);
  if (!id || !acct) return null;
  const sel = parseSel(data.sel);
  const statusRaw = data.status ?? tableRow?.Status ?? tableRow?.status;
  const note = asString(data.note ?? tableRow?.note) ?? (parsePrismStatus(statusRaw) === "active" && String(statusRaw).toLowerCase() === "stalled" ? "stalled" : null);
  const users = Math.max(1, Math.round(asNumber(data.users) ?? 1));
  const split = asNumber(data.split) ?? 100;
  const custom = asNumber(data.customHpw ?? data.customHoursPerWeek);
  return {
    id,
    acct,
    owner: normalizeTeamId(data.owner ?? tableRow?.Owner ?? tableRow?.owner) || null,
    owner2: normalizeTeamId(data.owner2) || null,
    split: split >= 1 && split <= 100 ? split : 100,
    users,
    fp: Math.max(0, Math.round(asNumber(data.fp) ?? 25)),
    locations: Math.max(1, Math.round(asNumber(data.locations) ?? 1)),
    trainingsPerWeek: Math.max(0, Math.round(asNumber(data.trainingsPerWeek) ?? 2)),
    sel,
    serviceLines: prismSelToServiceLines(sel),
    status: parsePrismStatus(statusRaw),
    note,
    kickoffDate: isoDate(data.kickoffDate ?? data.kickoff),
    goliveDate: isoDate(data.goliveDate ?? data.goLiveDate ?? data.currentGolive),
    initialGolive: isoDate(data.initialGolive ?? data.initialGoLive),
    stateComp: asBool(data.stateComp ?? data.stateCompliance),
    supportStruct: data.supportStruct === undefined ? true : asBool(data.supportStruct),
    customHpw: custom != null && custom >= 0 ? custom : null,
    slipLog: parseSlipLog(data.slipLog),
    dockWorkspaceId: asString(data.dockWorkspaceId ?? tableRow?.DockWorkspaceId ?? tableRow?.dockWorkspaceId),
  };
}

function parseCompleted(raw: unknown, tableRow?: Record<string, unknown>): PrismDumpCompleted | null {
  const data = asRecord(parseJsonField(raw) ?? raw) ?? {};
  const id = normalizeAcronym(
    data.id ?? data.CustomerId ?? tableRow?.CustomerId ?? tableRow?.customerId ?? tableRow?.id,
  );
  const acct = asString(data.acct ?? data.AccountName ?? tableRow?.AccountName ?? tableRow?.accountName ?? id);
  if (!id || !acct) return null;
  const eraRaw = asString(data.era ?? tableRow?.Era ?? tableRow?.era)?.toLowerCase() ?? null;
  const era = eraRaw === "legacy" || eraRaw === "current" ? eraRaw : eraRaw;
  return {
    id,
    acct,
    era,
    owner: normalizeTeamId(data.owner ?? tableRow?.Owner) || null,
    users: Math.max(1, Math.round(asNumber(data.users) ?? 1)),
    complexity: asString(data.complexity ?? data.complexityTier),
    estimatedHours: asNumber(data.estimatedHours ?? data.hours),
    kickoffDate: isoDate(data.kickoffDate ?? data.kickoff),
    goliveDate: isoDate(data.goliveDate ?? data.actualGoLive ?? data.goLiveDate),
    initialGolive: isoDate(data.initialGolive ?? data.initialGoLive),
    forecastDays: asNumber(data.forecastDays),
  };
}

function pickArray(root: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    if (key in root) return asArray(root[key]);
  }
  return [];
}

/**
 * Normalize any supported Prism dump / getState / table-export into one shape.
 */
export function parsePrismDump(input: unknown): PrismDump {
  const root = asRecord(input);
  if (!root) throw new PrismDumpError("Dump must be a JSON object.");

  const nested = asRecord(root.state) ?? asRecord(root.State);
  const doc = nested ?? root;

  const teamRows = pickArray(doc, ["team", "Team", "teams"]);
  const formerRows = pickArray(doc, ["formerTeam", "FormerTeam", "former_team"]);
  const customerRows = pickArray(doc, ["customers", "Customers", "active"]);
  const completedRows = pickArray(doc, [
    "completed",
    "CompletedImplementations",
    "completedImplementations",
    "completions",
  ]);

  if (teamRows.length + customerRows.length + completedRows.length === 0) {
    throw new PrismDumpError(
      "Dump has no team, customers, or completed rows. Expected Prism getState or dump-prism-sql output.",
    );
  }

  const team: PrismDumpTeamMember[] = [];
  const seenTeam = new Set<string>();
  for (const row of teamRows) {
    const member = parseTeamMember(row, true);
    if (!member || seenTeam.has(member.teamId)) continue;
    seenTeam.add(member.teamId);
    team.push(member);
  }

  const formerTeam: PrismDumpTeamMember[] = [];
  for (const row of formerRows) {
    const member = parseTeamMember(row, false);
    if (!member || seenTeam.has(member.teamId)) continue;
    seenTeam.add(member.teamId);
    formerTeam.push(member);
  }

  const customers: PrismDumpCustomer[] = [];
  const seenCust = new Set<string>();
  for (const row of customerRows) {
    const rec = asRecord(row) ?? {};
    const parsed = parseCustomerFromData(rec.Data ?? rec.data ?? rec, rec);
    if (!parsed || seenCust.has(parsed.id)) continue;
    seenCust.add(parsed.id);
    customers.push(parsed);
  }

  const completed: PrismDumpCompleted[] = [];
  const seenDone = new Set<string>();
  for (const row of completedRows) {
    const rec = asRecord(row) ?? {};
    const parsed = parseCompleted(rec.Data ?? rec.data ?? rec, rec);
    if (!parsed || seenDone.has(parsed.id) || seenCust.has(parsed.id)) continue;
    seenDone.add(parsed.id);
    completed.push(parsed);
  }

  return {
    version: PRISM_DUMP_VERSION,
    exportedAt: asString(root.exportedAt ?? root.exported_at ?? doc.exportedAt) ?? null,
    source: asString(root.source ?? doc.source) ?? "prism-dump",
    team,
    formerTeam,
    customers,
    completed,
  };
}

export function parsePrismDumpJson(text: string): PrismDump {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new PrismDumpError("File is not valid JSON.");
  }
  return parsePrismDump(parsed);
}

/** Known Prism TeamId → Outlook email. Used when the dump has no email column. */
export const PRISM_TEAM_EMAILS: Record<string, string> = {
  am: "alexander@pimsyehr.com",
  dp: "danielle@pimsyehr.com",
  jr: "jeremy@pimsyehr.com",
  md: "morgan@pimsyehr.com",
  mind: "mindy@pimsyehr.com",
  dave: "david@pimsyehr.com",
  anna: "anna@pimsyehr.com",
  kori: "kori@pimsyehr.com",
};

export function emailForTeamMember(m: PrismDumpTeamMember): string | null {
  if (m.email) return m.email.toLowerCase();
  return PRISM_TEAM_EMAILS[m.teamId] ?? null;
}

export const PROTECTED_USER_EMAILS = [
  "demo.manager@pimsyehr.com",
  "demo.specialist@pimsyehr.com",
  "contact@riverbend-counseling.example.com",
] as const;

export const PROTECTED_PROJECT_CODES = ["IMP-9001"] as const;

export function isProtectedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return (PROTECTED_USER_EMAILS as readonly string[]).includes(email.trim().toLowerCase());
}

export function isProtectedProjectCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return (PROTECTED_PROJECT_CODES as readonly string[]).includes(code.trim().toUpperCase());
}

export function acronymKey(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase();
}
