/**
 * Field-level diff between a Prism SQL dump and the PATH book.
 * Dry-run only. Nothing here writes.
 *
 * Prism SQL is the source for customers, slips, and completed work.
 * PATH is the source for users and logins. PATH-only people are listed
 * and are not removed.
 */

import type { PrismDump } from "@/lib/prism-dump";
import { acronymKey } from "@/lib/prism-dump";

export type PrismBookTeam = {
  key: string;
  name: string;
  hours: number;
  canLead: boolean;
  exempt: boolean;
  director: boolean;
  active: boolean;
};

export type PrismBookEngagement = {
  acronym: string;
  status: string;
  owner: string | null;
  coOwner: string | null;
  split: number;
  kickoff: string | null;
  goLive: string | null;
  initialGoLive: string | null;
  customHpw: number | null;
  users: number | null;
  locations: number | null;
  slipCount: number;
};

export type PrismBookCompleted = {
  acronym: string;
  kickoff: string | null;
  goLive: string | null;
  initialGoLive: string | null;
};

export type PrismBook = {
  team: PrismBookTeam[];
  engagements: PrismBookEngagement[];
  completed: PrismBookCompleted[];
};

export type DiffChange = "same" | "add" | "path-only" | "update";

export type DiffLine = {
  kind: "team" | "engagement" | "completed";
  key: string;
  change: DiffChange;
  fields: string[];
};

export type PrismDiffReport = {
  lines: DiffLine[];
  summary: string;
};

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function day(value: string | null | undefined): string {
  return (value ?? "").slice(0, 10);
}

function field(label: string, pathValue: string | number | boolean | null, prismValue: string | number | boolean | null): string | null {
  const left = pathValue == null || pathValue === "" ? "—" : String(pathValue);
  const right = prismValue == null || prismValue === "" ? "—" : String(prismValue);
  if (left === right) return null;
  return `${label} ${left} → ${right}`;
}

export function prismBookFromDump(dump: PrismDump): PrismBook {
  return {
    team: [...dump.team, ...dump.formerTeam].map((member) => ({
      key: norm(member.teamId) || norm(member.email) || norm(member.name),
      name: member.name,
      hours: member.hoursPerWeek,
      canLead: member.flags.canLead,
      exempt: member.flags.capacityExempt,
      director: member.flags.director,
      active: member.active,
    })),
    engagements: dump.customers.map((row) => ({
      acronym: acronymKey(row.acct),
      status: row.status,
      owner: row.owner,
      coOwner: row.owner2,
      split: row.split,
      kickoff: day(row.kickoffDate),
      goLive: day(row.goliveDate),
      initialGoLive: day(row.initialGolive),
      customHpw: row.customHpw,
      users: row.users,
      locations: row.locations,
      slipCount: row.slipLog.length,
    })),
    completed: dump.completed.map((row) => ({
      acronym: acronymKey(row.acct),
      kickoff: day(row.kickoffDate),
      goLive: day(row.goliveDate),
      initialGoLive: day(row.initialGolive),
    })),
  };
}

function indexBy<T>(rows: T[], key: (row: T) => string): Map<string, T> {
  const out = new Map<string, T>();
  for (const row of rows) {
    const id = key(row);
    if (id) out.set(id, row);
  }
  return out;
}

export function diffPrismBooks(prism: PrismBook, path: PrismBook): PrismDiffReport {
  const lines: DiffLine[] = [];

  const pathTeam = indexBy(path.team, (row) => norm(row.key));
  const seenTeam = new Set<string>();
  for (const row of prism.team) {
    const key = norm(row.key);
    if (!key) continue;
    seenTeam.add(key);
    const current = pathTeam.get(key);
    if (!current) {
      lines.push({ kind: "team", key: row.name || key, change: "add", fields: [`${row.hours}h/wk`] });
      continue;
    }
    const fields = [
      field("hours", current.hours, row.hours),
      field("lead", current.canLead, row.canLead),
      field("exempt", current.exempt, row.exempt),
      field("director", current.director, row.director),
      field("active", current.active, row.active),
    ].filter((item): item is string => item != null);
    lines.push({
      kind: "team",
      key: row.name || current.name || key,
      change: fields.length ? "update" : "same",
      fields,
    });
  }
  for (const row of path.team) {
    const key = norm(row.key);
    if (!key || seenTeam.has(key)) continue;
    lines.push({
      kind: "team",
      key: row.name || key,
      change: "path-only",
      fields: ["kept — PATH is the source for logins"],
    });
  }

  const pathEng = indexBy(path.engagements, (row) => row.acronym);
  const seenEng = new Set<string>();
  for (const row of prism.engagements) {
    if (!row.acronym) continue;
    seenEng.add(row.acronym);
    const current = pathEng.get(row.acronym);
    if (!current) {
      lines.push({ kind: "engagement", key: row.acronym, change: "add", fields: [row.status] });
      continue;
    }
    const fields = [
      field("status", current.status, row.status),
      field("owner", norm(current.owner), norm(row.owner)),
      field("co-owner", norm(current.coOwner), norm(row.coOwner)),
      field("split", current.split, row.split),
      field("kickoff", day(current.kickoff), day(row.kickoff)),
      field("go-live", day(current.goLive), day(row.goLive)),
      field("initial go-live", day(current.initialGoLive), day(row.initialGoLive)),
      field("hrs/wk", current.customHpw, row.customHpw),
      field("users", current.users, row.users),
      field("locations", current.locations, row.locations),
      field("slips", current.slipCount, row.slipCount),
    ].filter((item): item is string => item != null);
    lines.push({
      kind: "engagement",
      key: row.acronym,
      change: fields.length ? "update" : "same",
      fields,
    });
  }
  for (const row of path.engagements) {
    if (!row.acronym || seenEng.has(row.acronym)) continue;
    lines.push({
      kind: "engagement",
      key: row.acronym,
      change: "path-only",
      fields: ["not in this Prism dump — not removed"],
    });
  }

  const pathDone = indexBy(path.completed, (row) => row.acronym);
  const seenDone = new Set<string>();
  for (const row of prism.completed) {
    if (!row.acronym) continue;
    seenDone.add(row.acronym);
    const current = pathDone.get(row.acronym);
    if (!current) {
      lines.push({ kind: "completed", key: row.acronym, change: "add", fields: [] });
      continue;
    }
    const fields = [
      field("kickoff", day(current.kickoff), day(row.kickoff)),
      field("go-live", day(current.goLive), day(row.goLive)),
      field("initial go-live", day(current.initialGoLive), day(row.initialGoLive)),
    ].filter((item): item is string => item != null);
    lines.push({
      kind: "completed",
      key: row.acronym,
      change: fields.length ? "update" : "same",
      fields,
    });
  }
  for (const row of path.completed) {
    if (!row.acronym || seenDone.has(row.acronym)) continue;
    lines.push({
      kind: "completed",
      key: row.acronym,
      change: "path-only",
      fields: ["not in this Prism dump — not removed"],
    });
  }

  return { lines, summary: summarize(lines) };
}

function summarize(lines: DiffLine[]): string {
  const parts = ["team", "engagement", "completed"].map((kind) => {
    const rows = lines.filter((line) => line.kind === kind);
    const add = rows.filter((line) => line.change === "add").length;
    const update = rows.filter((line) => line.change === "update").length;
    const same = rows.filter((line) => line.change === "same").length;
    const kept = rows.filter((line) => line.change === "path-only").length;
    return `${kind} +${add} ~${update} =${same} kept ${kept}`;
  });
  return parts.join("; ");
}

export function formatPrismDiffReport(report: PrismDiffReport): string {
  const mark: Record<DiffChange, string> = { add: "+", update: "~", same: "=", "path-only": "." };
  const body = report.lines
    .filter((line) => line.change !== "same")
    .map((line) => {
      const detail = line.fields.length ? ` — ${line.fields.join("; ")}` : "";
      return `  ${mark[line.change]} [${line.kind}] ${line.key}${detail}`;
    });
  return [`Prism → PATH diff (dry-run, nothing written)`, report.summary, ...body].join("\n");
}
