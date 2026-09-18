/**
 * @mention tokens for comments and project updates.
 *
 * Stored in the body as `@[Morgan](user:id)` so display does not need a join.
 * Client-safe: no Postgres. Do not import `@/db` from here.
 */

export type MentionCandidate = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  kind: "staff" | "customer";
};

export type MentionToken = {
  label: string;
  userId: string;
  index: number;
  length: number;
};

export type MentionPart =
  | { type: "text"; text: string }
  | { type: "mention"; label: string; userId: string };

const TOKEN_RE = /@\[([^\]]+)\]\(user:([0-9a-z]+)\)/g;

export function peopleToMentionCandidates(
  people: { id: string; name?: string | null; email?: string | null; role?: string | null }[],
): MentionCandidate[] {
  const seen = new Set<string>();
  const out: MentionCandidate[] = [];
  for (const p of people) {
    if (!p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({
      id: p.id,
      name: p.name ?? null,
      email: p.email ?? "",
      role: p.role ?? "MEMBER",
      kind: p.role === "CUSTOMER" ? "customer" : "staff",
    });
  }
  return out;
}

export function mentionToken(label: string, userId: string): string {
  const safe = label.replace(/[[\]]/g, "").trim() || "someone";
  return `@[${safe}](user:${userId})`;
}

export function parseMentionTokens(text: string): MentionToken[] {
  return Array.from(text.matchAll(new RegExp(TOKEN_RE.source, "g"))).map((m) => ({
    label: m[1]!,
    userId: m[2]!,
    index: m.index ?? 0,
    length: m[0].length,
  }));
}

export function uniqueMentionUserIds(text: string): string[] {
  return [...new Set(parseMentionTokens(text).map((t) => t.userId))];
}

export function mentionPlainText(text: string): string {
  return text.replace(new RegExp(TOKEN_RE.source, "g"), "@$1");
}

export function splitMentionText(text: string): MentionPart[] {
  const tokens = parseMentionTokens(text);
  if (tokens.length === 0) return text ? [{ type: "text", text }] : [];
  const parts: MentionPart[] = [];
  let i = 0;
  for (const t of tokens) {
    if (t.index > i) parts.push({ type: "text", text: text.slice(i, t.index) });
    parts.push({ type: "mention", label: t.label, userId: t.userId });
    i = t.index + t.length;
  }
  if (i < text.length) parts.push({ type: "text", text: text.slice(i) });
  return parts;
}

function firstAndLast(c: MentionCandidate): { first: string; last: string } {
  const n = (c.name ?? "").trim();
  const parts = n ? n.split(/\s+/) : [];
  const first = parts[0] || (c.email.split("@")[0] || "someone");
  const last = parts.slice(1).join(" ");
  return { first, last };
}

/** Short picker labels: first name, or "First L" when that first name is shared. */
export function shortNamesFor(candidates: MentionCandidate[]): Map<string, string> {
  const rows = candidates.map((c) => ({ id: c.id, ...firstAndLast(c) }));
  const firstCount = new Map<string, number>();
  for (const r of rows) {
    const k = r.first.toLowerCase();
    firstCount.set(k, (firstCount.get(k) ?? 0) + 1);
  }
  const out = new Map<string, string>();
  for (const r of rows) {
    if ((firstCount.get(r.first.toLowerCase()) ?? 0) === 1) {
      out.set(r.id, r.first);
    } else if (r.last) {
      out.set(r.id, `${r.first} ${r.last[0]!.toUpperCase()}`);
    } else {
      out.set(r.id, r.first);
    }
  }
  return out;
}

export function filterMentionCandidates(
  candidates: MentionCandidate[],
  query: string,
  visibility: "INTERNAL" | "SHARED" = "SHARED",
): MentionCandidate[] {
  const names = shortNamesFor(candidates);
  const q = query.trim().toLowerCase();
  return candidates
    .filter((c) => (visibility === "INTERNAL" ? c.kind !== "customer" : true))
    .filter((c) => {
      if (!q) return true;
      const hay = [c.name, c.email, names.get(c.id)].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => (names.get(a.id) ?? a.email).localeCompare(names.get(b.id) ?? b.email))
    .slice(0, 8);
}

function isInsideMentionToken(text: string, index: number): boolean {
  return parseMentionTokens(text).some((t) => index >= t.index && index < t.index + t.length);
}

/** Open the picker when the cursor sits after `@query` that is not already a token. */
export function mentionTrigger(
  text: string,
  cursor: number,
): { start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const m = /(?:^|[\s([{"'])@([^\s@[\]()]*)$/.exec(before);
  if (!m) return null;
  const query = m[1] ?? "";
  const start = before.length - query.length - 1;
  if (isInsideMentionToken(text, start)) return null;
  return { start, query };
}

export function insertMentionAt(
  text: string,
  triggerStart: number,
  cursor: number,
  token: string,
): { next: string; cursor: number } {
  const after = text.slice(cursor);
  const spaced = after.startsWith(" ") ? after : ` ${after}`;
  const next = `${text.slice(0, triggerStart)}${token}${spaced}`;
  return { next, cursor: triggerStart + token.length + 1 };
}

export function newMentionUserIds(previousText: string, nextText: string): string[] {
  const before = new Set(uniqueMentionUserIds(previousText));
  return uniqueMentionUserIds(nextText).filter((id) => !before.has(id));
}
