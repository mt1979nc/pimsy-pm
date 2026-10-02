/**
 * Dock Implementation WIP → PATH analytics.
 *
 * Dock stays the delivery system. These helpers turn the morning scrape
 * (`dock-wip.json` + `dock-threads.json`) into a snapshot the Prism page
 * can read. They never create PATH tasks, playbook rows, or customers.
 *
 * PATH match is by acronym, case-insensitive:
 *   1. `projects.crmAcronym`
 *   2. else `projects.code`
 * Prefer a crmAcronym hit over a code-only hit. Then prefer a row that is
 * not archived and not completed/cancelled. Ties break by code, then id.
 */

export const DOCK_IMPLEMENTATION_WIP_URL = "https://pimsyehr.dock.us/spaces/views/WFEopP9nDBAC";

/** Latest ingest wins. Older snapshots are deleted past this count. */
export const DOCK_DELIVERY_KEEP_SNAPSHOTS = 8;

/** Page warns when the scrape timestamp is older than this. */
export const DOCK_DELIVERY_STALE_MS = 24 * 60 * 60 * 1000;

export type DockWaitingOn = "pimsy" | "customer" | "unknown";

export type DockExclusionReason =
  | "no-acronym"
  | "grok-e2e"
  | "draft-impl"
  | "test-workspace"
  | "rcm-only"
  | "actual-end";

export type DockExcludedSite = {
  acronym: string;
  name: string;
  reason: DockExclusionReason;
};

export type DockDeliverySiteDraft = {
  acronym: string;
  name: string;
  owners: string[];
  targetEnd: string | null;
  actualEnd: string | null;
  overdueTaskCount: number | null;
  status: string | null;
  acronymInferred: boolean;
  waitingOnPimsy: number;
  waitingOnCustomer: number;
  waitingUnknown: number;
  openThreadCount: number;
};

export type DockDeliveryThreadDraft = {
  acronym: string;
  dockThreadKey: string;
  type: string | null;
  title: string;
  waitingOn: DockWaitingOn;
  lastPoster: string | null;
  lastActivity: string | null;
  snippet: string | null;
  url: string | null;
  internal: boolean | null;
};

export type DockDeliveryTotals = {
  wipSites: number;
  overdueTaskSum: number | null;
  overdueUnknownSites: number;
  openThreads: number;
  waitingOnPimsy: number;
  waitingOnCustomer: number;
  waitingUnknown: number;
  unlistedThreads: number;
  excluded: DockExcludedSite[];
};

export type DockDeliveryDraft = {
  retrievedAt: Date;
  wipRetrievedAt: Date | null;
  threadsRetrievedAt: Date | null;
  sourceUrl: string | null;
  filters: unknown;
  totals: DockDeliveryTotals;
  contentHash: string;
  sites: DockDeliverySiteDraft[];
  threads: DockDeliveryThreadDraft[];
};

export type DockDeliveryBuildResult =
  | { ok: true; draft: DockDeliveryDraft }
  | { ok: false; error: string };

export type PathProjectRef = {
  id: string;
  name: string;
  code: string;
  crmAcronym: string | null;
  status: string;
  archivedAt: Date | string | null;
};

export type DockPathMatch = {
  id: string;
  name: string;
  code: string;
  via: "crmAcronym" | "code";
  /** Other PATH projects that also matched this acronym. */
  extra: number;
};

export type DockDeliveryTableThread = {
  key: string;
  type: string | null;
  title: string;
  waitingOn: DockWaitingOn;
  lastPoster: string | null;
  lastActivity: string | null;
  snippet: string | null;
  url: string | null;
  internal: boolean | null;
};

export type DockDeliveryTableRow = {
  acronym: string;
  name: string;
  owners: string[];
  targetEnd: string | null;
  actualEnd: string | null;
  overdueTaskCount: number | null;
  status: string | null;
  acronymInferred: boolean;
  waitingOnPimsy: number;
  waitingOnCustomer: number;
  waitingUnknown: number;
  openThreadCount: number;
  path: DockPathMatch | null;
  threads: DockDeliveryTableThread[];
};

export type DockSortKey =
  | "acronym"
  | "name"
  | "overdue"
  | "threads"
  | "pimsy"
  | "customer"
  | "status"
  | "owners";

export type DockSort = { key: DockSortKey; dir: "asc" | "desc" };

export const DEFAULT_DOCK_SORT: DockSort = { key: "overdue", dir: "desc" };

const DRAFT_IMPL_RE = /\bdraft\s+impl\b/i;
const TEST_WORKSPACE_RE = [
  /\bmt\s+tests?\b/i,
  /\bmt\s+testing\b/i,
  /\btest\s+dock\b/i,
  /\bprocess[- ]improvement\b/i,
];

type Loose = Record<string, unknown>;

function asObj(value: unknown): Loose | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Loose;
}

function asText(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function asStringArray(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item : String(item ?? "")))
    : typeof value === "string"
      ? value.split(/[,/|·\n]+/)
      : [];
  const out: string[] = [];
  for (const item of raw) {
    const trimmed = item.trim().slice(0, 80);
    if (!trimmed || out.includes(trimmed)) continue;
    out.push(trimmed);
    if (out.length >= 20) break;
  }
  return out;
}

/** Blank, em dash, and non-numeric cells stay null so the UI can show "—". */
export function parseOverdueCount(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—" || trimmed === "-" || trimmed === "–" || /^n\/?a$/i.test(trimmed)) return null;
  const n = Number(trimmed.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.trunc(n));
}

export function normalizeAcronym(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toUpperCase();
}

export function normalizeWaitingOn(value: unknown): DockWaitingOn {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw) return "unknown";
  const token = raw.replace(/[\s-]+/g, "_");
  if (token === "pimsy" || token === "waiting_on_pimsy" || token === "us" || token === "staff") return "pimsy";
  if (token === "customer" || token === "waiting_on_customer" || token === "client" || token === "account") {
    return "customer";
  }
  if (token.includes("pimsy")) return "pimsy";
  if (token.includes("customer") || token.includes("client")) return "customer";
  return "unknown";
}

export function chicagoCalendarDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** `YYYY-MM-DD` from a date-only string or an instant, in America/Chicago. */
export function calendarDayKey(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return chicagoCalendarDay(value);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  if (iso && !trimmed.includes("T")) return iso[1]!;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return iso?.[1] ?? null;
  return chicagoCalendarDay(parsed);
}

function parseInstant(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isDockDeliveryStale(retrievedAt: Date | string, now = new Date()): boolean {
  const time = new Date(retrievedAt).getTime();
  if (Number.isNaN(time)) return true;
  return now.getTime() - time > DOCK_DELIVERY_STALE_MS;
}

function nameBlob(input: { name?: string | null; acronym?: string | null }): string {
  return `${input.name ?? ""} ${input.acronym ?? ""}`.trim();
}

function isGrokE2E(input: { name?: string | null; acronym?: string | null }): boolean {
  const blob = nameBlob(input).toLowerCase();
  if (/\bgrok\b/.test(blob) && /\be2e\b/.test(blob)) return true;
  const acronym = normalizeAcronym(input.acronym).replace(/[^A-Z0-9]/g, "");
  return acronym === "GROK" || acronym.startsWith("GROK");
}

function isRcmOnly(input: {
  name?: string | null;
  product?: string | null;
  track?: string | null;
  type?: string | null;
  rcmOnly?: boolean | null;
}): boolean {
  if (input.rcmOnly === true) return true;
  const product = `${input.product ?? ""} ${input.track ?? ""} ${input.type ?? ""}`.trim();
  if (/^rcm$/i.test(product)) return true;
  const blob = `${input.name ?? ""} ${product}`;
  if (/\brcm[-\s]?only\b/i.test(blob)) return true;
  return /^\s*(billing\s*\/\s*rcm|rcm\s*\/\s*billing|rcm)\s*$/i.test(input.name ?? "");
}

/**
 * Ops exclusions for the Implementation WIP board.
 * Actual end is compared as a calendar day in America/Chicago: on or before
 * `asOf` drops the site. Null overdue counts are not an exclusion.
 */
export function dockWorkspaceExclusionReason(
  input: {
    name?: string | null;
    acronym?: string | null;
    actualEnd?: string | null;
    product?: string | null;
    track?: string | null;
    type?: string | null;
    rcmOnly?: boolean | null;
  },
  asOf: Date,
): DockExclusionReason | null {
  const acronym = normalizeAcronym(input.acronym);
  if (!acronym) return "no-acronym";
  if (isGrokE2E(input)) return "grok-e2e";
  if (DRAFT_IMPL_RE.test(nameBlob(input))) return "draft-impl";
  if (TEST_WORKSPACE_RE.some((re) => re.test(nameBlob(input)))) return "test-workspace";
  if (isRcmOnly(input)) return "rcm-only";
  const actual = calendarDayKey(input.actualEnd);
  if (actual && actual <= chicagoCalendarDay(asOf)) return "actual-end";
  return null;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Fingerprint for idempotent ingest. Not a password hash. */
export function dockContentHash(value: unknown): string {
  const text = stableStringify(value);
  const seeds = [0x811c9dc5, 0x811c9dc5 ^ 0x9e3779b9, 0x811c9dc5 ^ 0x85ebca6b, 0x811c9dc5 ^ 0xc2b2ae35];
  return seeds
    .map((seed) => {
      let hash = seed;
      for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
      }
      return (hash >>> 0).toString(16).padStart(8, "0");
    })
    .join("");
}

export function dockThreadKey(input: {
  url?: string | null;
  acronym: string;
  title: string;
  type?: string | null;
  id?: string | number | null;
}): string {
  const url = (input.url ?? "").trim();
  if (url) {
    const id = input.id == null || input.id === "" ? "" : String(input.id);
    return (id ? `url:${url}#${id}` : `url:${url}`).slice(0, 2000);
  }
  return `h:${dockContentHash([input.acronym, input.type ?? "", input.title, input.id ?? ""])}`;
}

function countOrZero(value: unknown): number {
  return parseOverdueCount(value) ?? 0;
}

function tally(threads: DockDeliveryThreadDraft[]): {
  total: number;
  pimsy: number;
  customer: number;
  unknown: number;
} {
  let pimsy = 0;
  let customer = 0;
  let unknown = 0;
  for (const thread of threads) {
    if (thread.waitingOn === "pimsy") pimsy += 1;
    else if (thread.waitingOn === "customer") customer += 1;
    else unknown += 1;
  }
  return { total: threads.length, pimsy, customer, unknown };
}

function panelCounts(
  bySite: Loose,
  acronym: string,
): { total: number; pimsy: number; customer: number; unknown: number } | null {
  let raw: unknown = bySite[acronym] ?? bySite[acronym.toLowerCase()];
  if (raw == null) {
    const hit = Object.entries(bySite).find(([key]) => normalizeAcronym(key) === acronym);
    raw = hit?.[1];
  }
  const site = asObj(raw);
  if (!site) return null;
  const total = site.count == null ? null : countOrZero(site.count);
  if (total == null) return null;
  return {
    total,
    pimsy: countOrZero(site.waiting_on_pimsy),
    customer: countOrZero(site.waiting_on_customer),
    unknown: countOrZero(site.unknown),
  };
}

function readThread(row: Loose, fallbackAcronym?: string): DockDeliveryThreadDraft | null {
  const acronym = normalizeAcronym(row.acronym) || normalizeAcronym(fallbackAcronym);
  if (!acronym) return null;
  const title = asText(row.title, 300) ?? "(untitled)";
  const url = asText(row.url, 2000);
  const type = asText(row.type, 80);
  const id = typeof row.id === "number" || typeof row.id === "string" ? row.id : null;
  return {
    acronym,
    dockThreadKey: `${acronym}:${dockThreadKey({ url, acronym, title, type, id })}`.slice(0, 2000),
    type,
    title,
    waitingOn: normalizeWaitingOn(row.waitingOn),
    lastPoster: asText(row.lastPoster, 120),
    lastActivity: asText(row.lastActivity, 40),
    snippet: asText(row.snippet, 500),
    url,
    internal: typeof row.internal === "boolean" ? row.internal : null,
  };
}

function collectThreads(file: Loose): DockDeliveryThreadDraft[] {
  const bySite = asObj(file.by_site) ?? {};
  const rows: DockDeliveryThreadDraft[] = [];
  if (Array.isArray(file.threads)) {
    for (const item of file.threads) {
      const row = asObj(item);
      if (!row) continue;
      const thread = readThread(row);
      if (thread) rows.push(thread);
    }
  }
  for (const [key, value] of Object.entries(bySite)) {
    const site = asObj(value);
    if (!site || !Array.isArray(site.threads)) continue;
    for (const item of site.threads) {
      const row = asObj(item);
      if (!row) continue;
      const thread = readThread(row, key);
      if (thread) rows.push(thread);
    }
  }
  const seen = new Set<string>();
  const unique: DockDeliveryThreadDraft[] = [];
  for (const thread of rows) {
    const key = `${thread.acronym}\n${thread.dockThreadKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(thread);
  }
  return unique;
}

function readWorkspace(row: Loose): {
  name: string;
  acronym: string;
  owners: string[];
  targetEnd: string | null;
  actualEnd: string | null;
  overdueTaskCount: number | null;
  status: string | null;
  acronymInferred: boolean;
  product: string | null;
  track: string | null;
  type: string | null;
  rcmOnly: boolean;
} | null {
  const name = asText(row.name, 200) ?? "";
  const acronym = normalizeAcronym(row.acronym);
  if (!name && !acronym) return null;
  return {
    name: name || acronym,
    acronym,
    owners: asStringArray(row.owners),
    targetEnd: calendarDayKey(row.targetEnd),
    actualEnd: calendarDayKey(row.actualEnd),
    overdueTaskCount: parseOverdueCount(row.overdueTaskCount),
    status: asText(row.status, 80),
    acronymInferred: row.acronymInferred === true,
    product: asText(row.product, 80),
    track: asText(row.track, 80),
    type: asText(row.type, 80),
    rcmOnly: row.rcmOnly === true,
  };
}

function mergeSite(current: ReturnType<typeof readWorkspace>, next: NonNullable<ReturnType<typeof readWorkspace>>) {
  if (!current) return next;
  return {
    ...current,
    name: current.name.length >= next.name.length ? current.name : next.name,
    owners: asStringArray([...current.owners, ...next.owners]),
    targetEnd: current.targetEnd ?? next.targetEnd,
    actualEnd: current.actualEnd ?? next.actualEnd,
    overdueTaskCount: current.overdueTaskCount ?? next.overdueTaskCount,
    status: current.status ?? next.status,
    acronymInferred: current.acronymInferred && next.acronymInferred,
    product: current.product ?? next.product,
    track: current.track ?? next.track,
    type: current.type ?? next.type,
    rcmOnly: current.rcmOnly || next.rcmOnly,
  };
}

export function buildDockDeliverySnapshot(
  wip: unknown,
  threads: unknown,
  opts?: { now?: Date },
): DockDeliveryBuildResult {
  const wipObj = asObj(wip);
  const threadsObj = asObj(threads);
  if (!wipObj) return { ok: false, error: "WIP JSON must be an object with workspaces[]." };
  if (!threadsObj) return { ok: false, error: "Threads JSON must be an object with threads[] and by_site." };
  if (!Array.isArray(wipObj.workspaces)) return { ok: false, error: "WIP JSON is missing workspaces[]." };
  if (wipObj.workspaces.length > 500) return { ok: false, error: "WIP JSON has more than 500 workspaces." };

  const now = opts?.now ?? new Date();
  const wipRetrievedAt = parseInstant(wipObj.retrievedAt);
  const threadsRetrievedAt = parseInstant(threadsObj.retrievedAt);
  const retrievedAt = [wipRetrievedAt, threadsRetrievedAt]
    .filter((date): date is Date => date != null)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  if (!retrievedAt) return { ok: false, error: "WIP or threads JSON needs a retrievedAt timestamp." };

  const excluded: DockExcludedSite[] = [];
  const included = new Map<string, NonNullable<ReturnType<typeof readWorkspace>>>();

  for (const item of wipObj.workspaces) {
    const row = asObj(item);
    if (!row) continue;
    const workspace = readWorkspace(row);
    if (!workspace) continue;
    const reason = dockWorkspaceExclusionReason(workspace, now);
    if (reason) {
      excluded.push({
        acronym: workspace.acronym || "(none)",
        name: workspace.name || "(unnamed)",
        reason,
      });
      continue;
    }
    included.set(workspace.acronym, mergeSite(included.get(workspace.acronym) ?? null, workspace));
  }

  const allThreads = collectThreads(threadsObj);
  if (allThreads.length > 5000) return { ok: false, error: "Threads JSON has more than 5000 threads." };

  const bySite = asObj(threadsObj.by_site) ?? {};
  const threadsByAcronym = new Map<string, DockDeliveryThreadDraft[]>();
  let unlistedThreads = 0;
  for (const thread of allThreads) {
    if (!included.has(thread.acronym)) {
      unlistedThreads += 1;
      continue;
    }
    const list = threadsByAcronym.get(thread.acronym) ?? [];
    list.push(thread);
    threadsByAcronym.set(thread.acronym, list);
  }

  const sites: DockDeliverySiteDraft[] = [];
  const storedThreads: DockDeliveryThreadDraft[] = [];
  for (const workspace of included.values()) {
    const rows = threadsByAcronym.get(workspace.acronym) ?? [];
    const fromRows = tally(rows);
    const panel = panelCounts(bySite, workspace.acronym);
    const counts = panel && panel.total > fromRows.total ? panel : fromRows;
    sites.push({
      acronym: workspace.acronym,
      name: workspace.name,
      owners: workspace.owners,
      targetEnd: workspace.targetEnd,
      actualEnd: workspace.actualEnd,
      overdueTaskCount: workspace.overdueTaskCount,
      status: workspace.status,
      acronymInferred: workspace.acronymInferred,
      waitingOnPimsy: counts.pimsy,
      waitingOnCustomer: counts.customer,
      waitingUnknown: counts.unknown,
      openThreadCount: counts.total,
    });
    storedThreads.push(...rows);
  }

  sites.sort((a, b) => a.acronym.localeCompare(b.acronym));
  storedThreads.sort((a, b) => a.acronym.localeCompare(b.acronym) || a.dockThreadKey.localeCompare(b.dockThreadKey));

  const knownOverdue = sites.map((site) => site.overdueTaskCount).filter((n): n is number => n != null);
  const totals: DockDeliveryTotals = {
    wipSites: sites.length,
    overdueTaskSum: knownOverdue.length > 0 ? knownOverdue.reduce((sum, n) => sum + n, 0) : null,
    overdueUnknownSites: sites.filter((site) => site.overdueTaskCount == null).length,
    openThreads: sites.reduce((sum, site) => sum + site.openThreadCount, 0),
    waitingOnPimsy: sites.reduce((sum, site) => sum + site.waitingOnPimsy, 0),
    waitingOnCustomer: sites.reduce((sum, site) => sum + site.waitingOnCustomer, 0),
    waitingUnknown: sites.reduce((sum, site) => sum + site.waitingUnknown, 0),
    unlistedThreads,
    excluded,
  };

  const contentHash = dockContentHash({
    sites,
    threads: storedThreads,
  });

  return {
    ok: true,
    draft: {
      retrievedAt,
      wipRetrievedAt,
      threadsRetrievedAt,
      sourceUrl: asText(wipObj.sourceUrl, 500) ?? asText(threadsObj.sourceUrl, 500),
      filters: wipObj.filters ?? null,
      totals,
      contentHash,
      sites,
      threads: storedThreads,
    },
  };
}

export function matchDockAcronym(acronym: string, projects: readonly PathProjectRef[]): DockPathMatch | null {
  const key = normalizeAcronym(acronym);
  if (!key) return null;
  const hits = projects.filter(
    (project) => normalizeAcronym(project.crmAcronym) === key || normalizeAcronym(project.code) === key,
  );
  if (hits.length === 0) return null;
  const scored = hits.map((project) => {
    const via: DockPathMatch["via"] = normalizeAcronym(project.crmAcronym) === key ? "crmAcronym" : "code";
    let score = via === "crmAcronym" ? 100 : 0;
    if (!project.archivedAt) score += 20;
    const status = project.status.toUpperCase();
    if (status !== "COMPLETED" && status !== "CANCELLED") score += 10;
    return { project, via, score };
  });
  scored.sort(
    (a, b) => b.score - a.score || a.project.code.localeCompare(b.project.code) || a.project.id.localeCompare(b.project.id),
  );
  const best = scored[0]!;
  return {
    id: best.project.id,
    name: best.project.name,
    code: best.project.code,
    via: best.via,
    extra: scored.length - 1,
  };
}

export function nextDockSort(current: DockSort, key: DockSortKey): DockSort {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  const numeric = key === "overdue" || key === "threads" || key === "pimsy" || key === "customer";
  return { key, dir: numeric ? "desc" : "asc" };
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

/** Null overdue counts stay last in both directions. */
export function sortDockRows<T extends Pick<
  DockDeliveryTableRow,
  "acronym" | "name" | "overdueTaskCount" | "openThreadCount" | "waitingOnPimsy" | "waitingOnCustomer" | "status" | "owners"
>>(rows: readonly T[], sort: DockSort): T[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  const value = (row: T): number | string | null => {
    switch (sort.key) {
      case "acronym":
        return row.acronym;
      case "name":
        return row.name;
      case "overdue":
        return row.overdueTaskCount;
      case "threads":
        return row.openThreadCount;
      case "pimsy":
        return row.waitingOnPimsy;
      case "customer":
        return row.waitingOnCustomer;
      case "status":
        return row.status ?? "";
      case "owners":
        return row.owners.join(", ");
    }
  };
  return [...rows].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (sort.key === "overdue") {
      if (av == null && bv == null) return compareText(a.acronym, b.acronym);
      if (av == null) return 1;
      if (bv == null) return -1;
    }
    let cmp = 0;
    if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
    else cmp = compareText(String(av ?? ""), String(bv ?? ""));
    if (cmp !== 0) return cmp * dir;
    return compareText(a.acronym, b.acronym);
  });
}
