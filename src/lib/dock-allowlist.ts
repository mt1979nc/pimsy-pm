/**
 * Parse a Dock WIP allowlist of customer/project acronyms.
 *
 * Canonical fixture: `content/dock-wip-allowlist.json` (Dock Implementation WIP
 * as of 2026-09-14). Also accepts CLI JSON/CSV overlays:
 *   - JSON array of strings
 *   - JSON `{ "acronyms": [...], "aliases": [{ "from": "RAC", "to": "TANC" }] }`
 *   - JSON Dock snapshot `{ "workspaces": [{ "acronym": "BHC" }] }`
 *   - CSV with an `acronym` header, or one acronym per line
 *
 * Alias `from` keys are also keep-allowlist. RAC and TANC are both listed on
 * the shipped fixture until Alexander consolidates — do not delete either.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeKey } from "@/lib/demo-entities";

/** Shipped Dock Implementation WIP inventory (2026-09-14). */
export const DEFAULT_DOCK_WIP_ALLOWLIST_REL = "content/dock-wip-allowlist.json";

export type DockAcronymAlias = {
  from: string;
  to: string;
  names: string[];
  note: string;
  /** Keep both codes on the book; do not auto-rename. */
  keepBothUntilConsolidated: boolean;
};

export type DockAllowlistDocument = {
  acronyms: Set<string>;
  /** PATH/Prism codes that mean the same Dock workspace. */
  aliases: DockAcronymAlias[];
};

export function defaultDockWipAllowlistPath(cwd = process.cwd()): string {
  return resolve(cwd, DEFAULT_DOCK_WIP_ALLOWLIST_REL);
}

export function loadRepoDockAllowlistDocument(cwd = process.cwd()): DockAllowlistDocument {
  const abs = defaultDockWipAllowlistPath(cwd);
  return parseDockAllowlistDocument(readFileSync(abs, "utf8"), abs);
}

/** Canonical Dock acronyms plus alias `from` keys (safe for prune keep). */
export function loadRepoDockWipAllowlist(cwd = process.cwd()): Set<string> {
  return expandAllowlist(loadRepoDockAllowlistDocument(cwd));
}

export function expandAllowlist(doc: DockAllowlistDocument): Set<string> {
  const out = new Set(doc.acronyms);
  for (const alias of doc.aliases) {
    if (alias.from) out.add(alias.from);
    if (alias.to) out.add(alias.to);
  }
  return out;
}

export function parseDockAllowlist(raw: string, fileHint = "allowlist"): Set<string> {
  return expandAllowlist(parseDockAllowlistDocument(raw, fileHint));
}

export function parseDockAllowlistDocument(raw: string, fileHint = "allowlist"): DockAllowlistDocument {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) {
    throw new Error(`${fileHint} is empty — pass a JSON or CSV of Dock WIP acronyms.`);
  }

  if (text.startsWith("{") || text.startsWith("[")) {
    let data: unknown;
    try {
      data = JSON.parse(text) as unknown;
    } catch (err) {
      throw new Error(`${fileHint} is not valid JSON: ${(err as Error).message}`);
    }
    const doc = documentFromJson(data);
    if (doc.acronyms.size === 0 && doc.aliases.length === 0) {
      throw new Error(
        `${fileHint} JSON had no acronyms. Use ["BHC","CEDAR"], { "acronyms": [...] }, or { "workspaces": [{ "acronym": "BHC" }] }.`,
      );
    }
    return doc;
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (lines.length === 0) {
    throw new Error(`${fileHint} CSV/text had no acronym rows.`);
  }

  const header = lines[0]!.toLowerCase();
  const looksCsv = header.includes(",");
  const acronyms = new Set<string>();

  if (looksCsv) {
    const cols = splitCsvLine(lines[0]!);
    const idx = cols.findIndex((c) => {
      const n = c.trim().toLowerCase();
      return n === "acronym" || n === "crmacronym" || n === "code" || n === "prismclientid";
    });
    const col = idx >= 0 ? idx : 0;
    for (const line of lines.slice(1)) {
      const cells = splitCsvLine(line);
      const key = normalizeKey(cells[col]);
      if (key) acronyms.add(key);
    }
  } else {
    for (const line of lines) {
      const key = normalizeKey(line.split(/[,;\t]/)[0]);
      if (key && key !== "ACRONYM") acronyms.add(key);
    }
  }

  if (acronyms.size === 0) {
    throw new Error(`${fileHint} had no usable acronyms.`);
  }
  return { acronyms, aliases: [] };
}

function documentFromJson(data: unknown): DockAllowlistDocument {
  const acronyms = new Set<string>();
  const aliases: DockAcronymAlias[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string") {
      const k = normalizeKey(v);
      if (k) acronyms.add(k);
    }
  };

  const collectRows = (rows: unknown[]) => {
    for (const row of rows) {
      if (typeof row === "string") push(row);
      else if (row && typeof row === "object") {
        const o = row as Record<string, unknown>;
        push(o.acronym ?? o.crmAcronym ?? o.code ?? o.prismClientId);
      }
    }
  };

  if (Array.isArray(data)) {
    collectRows(data);
    return { acronyms, aliases };
  }

  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.acronyms)) collectRows(o.acronyms);
    if (Array.isArray(o.workspaces)) collectRows(o.workspaces);
    if (Array.isArray(o.sites)) collectRows(o.sites);
    if (Array.isArray(o.aliases)) {
      for (const row of o.aliases) {
        const alias = aliasFromUnknown(row);
        if (alias) aliases.push(alias);
      }
    } else if (o.aliases && typeof o.aliases === "object" && !Array.isArray(o.aliases)) {
      for (const [from, value] of Object.entries(o.aliases as Record<string, unknown>)) {
        const alias = aliasFromUnknown(
          value && typeof value === "object"
            ? { from, ...(value as Record<string, unknown>) }
            : { from, to: value },
        );
        if (alias) aliases.push(alias);
      }
    }
  }
  return { acronyms, aliases };
}

function aliasFromUnknown(row: unknown): DockAcronymAlias | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const from = normalizeKey(typeof o.from === "string" ? o.from : undefined);
  const to = normalizeKey(
    typeof o.to === "string"
      ? o.to
      : typeof o.canonical === "string"
        ? o.canonical
        : undefined,
  );
  if (!from || !to || from === to) return null;
  const names = Array.isArray(o.names)
    ? o.names.filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    : Array.isArray(o.alsoKnownAs)
      ? o.alsoKnownAs.filter((n): n is string => typeof n === "string" && n.trim().length > 0)
      : [];
  const note = typeof o.note === "string" ? o.note : "";
  const keepBothUntilConsolidated =
    o.keepBothUntilConsolidated === true || o.keepBoth === true;
  return { from, to, names, note, keepBothUntilConsolidated };
}

export function aliasForAcronym(
  keys: string[],
  aliases: readonly DockAcronymAlias[],
): DockAcronymAlias | null {
  const set = new Set(keys.map(normalizeKey).filter(Boolean));
  for (const alias of aliases) {
    if (set.has(alias.from)) return alias;
  }
  return null;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}
