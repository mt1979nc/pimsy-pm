/**
 * Parse a Dock WIP allowlist of customer/project acronyms.
 *
 * The parent supplies the live Dock list (JSON or CSV). This module does not
 * invent that list. Accepts:
 *   - JSON array of strings
 *   - JSON `{ "acronyms": [...] }`
 *   - JSON Dock snapshot `{ "workspaces": [{ "acronym": "BHC" }] }`
 *   - CSV with an `acronym` header, or one acronym per line
 */
import { normalizeKey } from "@/lib/demo-entities";

export function parseDockAllowlist(raw: string, fileHint = "allowlist"): Set<string> {
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
    const found = acronymsFromJson(data);
    if (found.size === 0) {
      throw new Error(
        `${fileHint} JSON had no acronyms. Use ["BHC","CEDAR"], { "acronyms": [...] }, or { "workspaces": [{ "acronym": "BHC" }] }.`,
      );
    }
    return found;
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (lines.length === 0) {
    throw new Error(`${fileHint} CSV/text had no acronym rows.`);
  }

  const header = lines[0]!.toLowerCase();
  const looksCsv = header.includes(",");
  const out = new Set<string>();

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
      if (key) out.add(key);
    }
  } else {
    for (const line of lines) {
      const key = normalizeKey(line.split(/[,;\t]/)[0]);
      if (key && key !== "ACRONYM") out.add(key);
    }
  }

  if (out.size === 0) {
    throw new Error(`${fileHint} had no usable acronyms.`);
  }
  return out;
}

function acronymsFromJson(data: unknown): Set<string> {
  const out = new Set<string>();
  const push = (v: unknown) => {
    if (typeof v === "string") {
      const k = normalizeKey(v);
      if (k) out.add(k);
    }
  };

  if (Array.isArray(data)) {
    for (const row of data) {
      if (typeof row === "string") push(row);
      else if (row && typeof row === "object") {
        const o = row as Record<string, unknown>;
        push(o.acronym ?? o.crmAcronym ?? o.code ?? o.prismClientId);
      }
    }
    return out;
  }

  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.acronyms)) return acronymsFromJson(o.acronyms);
    if (Array.isArray(o.workspaces)) return acronymsFromJson(o.workspaces);
    if (Array.isArray(o.sites)) return acronymsFromJson(o.sites);
  }
  return out;
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
