/**
 * Turn a Dock board extract into the dock-wip.json / dock-threads.json shapes.
 * Exclusions match the ingest: actual end <= today (America/Chicago), DRAFT
 * Impl, test workspaces, RCM-only, GROK E2E.
 */
import {
  DOCK_IMPLEMENTATION_WIP_URL,
  dockWorkspaceExclusionReason,
  normalizeAcronym,
  normalizeWaitingOn,
  type DockExclusionReason,
  type DockWaitingOn,
} from "@/lib/dock-delivery";

export type ScrapedCells = { cells: Record<string, string> };

export type RawThreadCard = {
  url?: string;
  title?: string;
  text?: string;
  account?: string;
  acronym?: string;
  type?: string;
  lastActivity?: string;
  snippet?: string | null;
  lastPoster?: string;
  internal?: boolean | null;
  waitingOn?: string;
};

const STAFF = new Set(
  [
    "alexander morse",
    "danielle piper",
    "jeremy reals",
    "morgan davis",
    "mindy douglas",
    "anna stokes",
    "dave shepard",
    "david shepard",
    "kori hale",
    "marisa thompson",
  ].map((name) => name.toLowerCase()),
);

const SKIP_WORDS = new Set(["the", "of", "and", "for", "a", "an"]);

function cell(cells: Record<string, string>, ...names: string[]): string {
  const entries = Object.entries(cells).map(([key, value]) => [key.trim().toLowerCase(), value.trim()] as const);
  for (const name of names) {
    const exact = entries.find(([key]) => key === name);
    if (exact?.[1]) return exact[1];
  }
  for (const name of names) {
    const partial = entries.find(([key]) => key.includes(name));
    if (partial?.[1]) return partial[1];
  }
  return "";
}

function nameKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function inferAcronym(name: string): string {
  const trimmed = name.trim();
  if (/^[A-Z0-9]{2,12}$/.test(trimmed)) return trimmed;
  const words = trimmed.split(/[^A-Za-z0-9]+/).filter((word) => word && !SKIP_WORDS.has(word.toLowerCase()));
  return words
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 12);
}

function parseOwners(raw: string): string[] {
  return raw
    .split(/[,/|·\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function parseCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "—" || trimmed === "-" || trimmed === "–") return null;
  const match = trimmed.match(/\d+/);
  if (!match) return null;
  return Number(match[0]);
}

function parseDay(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "—" || trimmed === "-") return null;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  if (iso) return iso[1]!;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

/** PIMSY staff last posted → ball is with the customer. A customer last posted → PIMSY. */
export function classifyWaitingOn(lastPoster: string | null | undefined, explicit?: string | null): DockWaitingOn {
  if (explicit && explicit.trim()) {
    const normalized = normalizeWaitingOn(explicit);
    if (normalized !== "unknown") return normalized;
    if (/^unknown$/i.test(explicit.trim())) return "unknown";
  }
  const poster = (lastPoster ?? "").trim().toLowerCase();
  if (!poster) return "unknown";
  if (poster.includes("@pimsyehr.com") || STAFF.has(poster) || /\bpimsy\b/.test(poster)) return "customer";
  return "pimsy";
}

export type MappedWorkspace = {
  name: string;
  acronym: string;
  owners: string[];
  targetEnd: string | null;
  actualEnd: string | null;
  overdueTaskCount: number | null;
  status: string | null;
  acronymInferred: boolean;
  product?: string;
  rcmOnly?: boolean;
};

export function mapWipRows(
  rows: ScrapedCells[],
  opts: { asOf: Date; accountAcronyms?: ReadonlyMap<string, string> },
): { workspaces: MappedWorkspace[]; excluded: { name: string; acronym: string; reason: DockExclusionReason }[] } {
  const workspaces: MappedWorkspace[] = [];
  const excluded: { name: string; acronym: string; reason: DockExclusionReason }[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const name = cell(row.cells, "account", "workspace", "site", "name");
    if (!name) continue;
    const explicit = normalizeAcronym(cell(row.cells, "acronym", "code", "abbreviation"));
    const fromThreads = opts.accountAcronyms?.get(nameKey(name)) ?? "";
    const acronym = explicit || normalizeAcronym(fromThreads) || inferAcronym(name);
    const overdueHeader = Object.keys(row.cells).some((key) => key.toLowerCase().includes("overdue"));
    const overdueRaw = cell(row.cells, "overdue", "overdue tasks", "overdue task count");
    const workspace: MappedWorkspace = {
      name,
      acronym,
      owners: parseOwners(cell(row.cells, "owner", "owners")),
      targetEnd: parseDay(cell(row.cells, "target end", "target")),
      actualEnd: parseDay(cell(row.cells, "actual end", "actual")),
      overdueTaskCount: overdueHeader ? parseCount(overdueRaw) : null,
      status: cell(row.cells, "status", "trend") || null,
      acronymInferred: !explicit && !fromThreads,
      product: cell(row.cells, "product", "track") || undefined,
    };
    if (/^rcm$/i.test(workspace.product ?? "")) workspace.rcmOnly = true;
    const reason = dockWorkspaceExclusionReason(
      {
        name: workspace.name,
        acronym: workspace.acronym,
        actualEnd: workspace.actualEnd,
        product: workspace.product,
        rcmOnly: workspace.rcmOnly,
      },
      opts.asOf,
    );
    if (reason) {
      excluded.push({ name: workspace.name, acronym: workspace.acronym || "(none)", reason });
      continue;
    }
    if (seen.has(workspace.acronym)) continue;
    seen.add(workspace.acronym);
    workspaces.push(workspace);
  }

  return { workspaces, excluded };
}

function lineValue(text: string, label: RegExp): string {
  const match = text.match(label);
  return match?.[1]?.trim() ?? "";
}

export function mapThreadCards(
  cards: RawThreadCard[],
  opts: { includedAcronyms?: ReadonlySet<string> },
): {
  threads: {
    id: number;
    account: string;
    acronym: string;
    type: string | null;
    title: string;
    lastActivity: string | null;
    snippet: string | null;
    internal: boolean | null;
    lastPoster: string | null;
    waitingOn: DockWaitingOn;
    url: string | null;
  }[];
} {
  const threads = [];
  let id = 1;
  const seen = new Set<string>();
  for (const card of cards) {
    const text = card.text ?? "";
    const account = (card.account || lineValue(text, /account[:\s]+([^\n]+)/i) || "").trim();
    const explicitAcronym = normalizeAcronym(card.acronym || lineValue(text, /acronym[:\s]+([A-Za-z0-9]+)/i));
    const acronym = explicitAcronym || (account ? inferAcronym(account) : "");
    if (!acronym) continue;
    if (opts.includedAcronyms && !opts.includedAcronyms.has(acronym)) continue;
    const title = (card.title || lineValue(text, /title[:\s]+([^\n]+)/i) || "(untitled)").trim();
    const url = (card.url || "").trim() || null;
    const dedupe = url || `${acronym}|${title}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const lastPoster = (card.lastPoster || lineValue(text, /last poster[:\s]+([^\n]+)/i) || "").trim() || null;
    const type = (card.type || (/\btask comment\b/i.test(text) ? "Task Comment" : /\bmessage\b/i.test(text) ? "Message" : "")).trim() || null;
    const lastActivity =
      card.lastActivity || text.match(/\b\d+\s*[hdw]\b/i)?.[0]?.replace(/\s+/g, "") || null;
    const waitingSource =
      card.waitingOn ||
      (/\bwaiting on customer\b/i.test(text) ? "customer" : /\bwaiting on pimsy\b/i.test(text) ? "pimsy" : "");
    threads.push({
      id: id++,
      account: account || acronym,
      acronym,
      type,
      title,
      lastActivity,
      snippet: card.snippet === undefined ? lineValue(text, /snippet[:\s]+([^\n]+)/i) || null : card.snippet,
      internal: card.internal ?? (/\binternal\b/i.test(text) ? true : null),
      lastPoster,
      waitingOn: classifyWaitingOn(lastPoster, waitingSource),
      url,
    });
  }
  return { threads };
}

export function buildScrapeFiles(input: {
  rows: ScrapedCells[];
  cards: RawThreadCard[];
  asOf?: Date;
  retrievedAt?: string;
  sourceUrl?: string;
  footers?: string[];
  headers?: string[];
}): {
  wip: Record<string, unknown>;
  threads: Record<string, unknown>;
  excluded: { name: string; acronym: string; reason: DockExclusionReason }[];
} {
  const asOf = input.asOf ?? new Date();
  const retrievedAt = input.retrievedAt ?? asOf.toISOString();
  const sourceUrl = input.sourceUrl ?? DOCK_IMPLEMENTATION_WIP_URL;
  const cardsFirst = mapThreadCards(input.cards, {});
  const accountAcronyms = new Map<string, string>();
  for (const thread of cardsFirst.threads) {
    accountAcronyms.set(nameKey(thread.account), thread.acronym);
  }
  const mapped = mapWipRows(input.rows, { asOf, accountAcronyms });
  const included = new Set(mapped.workspaces.map((workspace) => workspace.acronym));
  const threads = mapThreadCards(input.cards, { includedAcronyms: included }).threads;
  const bySite: Record<string, unknown> = {};
  for (const workspace of mapped.workspaces) {
    const siteThreads = threads.filter((thread) => thread.acronym === workspace.acronym);
    bySite[workspace.acronym] = {
      count: siteThreads.length,
      waiting_on_pimsy: siteThreads.filter((thread) => thread.waitingOn === "pimsy").length,
      waiting_on_customer: siteThreads.filter((thread) => thread.waitingOn === "customer").length,
      unknown: siteThreads.filter((thread) => thread.waitingOn === "unknown").length,
      threads: siteThreads,
    };
  }
  const headers = input.headers ?? [];
  const overdueVisible = headers.some((header) => header.toLowerCase().includes("overdue"));
  return {
    excluded: mapped.excluded,
    wip: {
      retrievedAt,
      sourceUrl,
      filters: {
        view: "Implementation WIP",
        savedViewUrl: sourceUrl,
        exclusions: "Actual end date <= today (America/Chicago); DRAFT Impl. Billing/RCM; test workspaces; RCM-only; GROK E2E",
        pagination: { footers: input.footers ?? [] },
        columns: headers,
        overdueColumnVisible: overdueVisible,
      },
      totalIncluded: mapped.workspaces.length,
      workspaces: mapped.workspaces,
    },
    threads: {
      retrievedAt,
      sourceUrl,
      totals: {
        threads: threads.length,
        waiting_on_pimsy: threads.filter((thread) => thread.waitingOn === "pimsy").length,
        waiting_on_customer: threads.filter((thread) => thread.waitingOn === "customer").length,
        unknown: threads.filter((thread) => thread.waitingOn === "unknown").length,
        sites_with_open_threads: Object.values(bySite).filter((site) => (site as { count: number }).count > 0).length,
      },
      by_site: bySite,
      threads,
    },
  };
}
