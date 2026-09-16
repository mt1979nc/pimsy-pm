/**
 * PIMSY EHR login / session confirmation (training “users have logged in”).
 *
 * PATH already has:
 *   - Portal contacts (name, email) and PATH `lastSeenAt` (this app, not the EHR)
 *   - Site keys on About (`crmAcronym`, `crmKey`, `prismClientId`, `code`)
 *   - Forecast+ `userCount` (how many EHR users were scoped — not login proof)
 *   - PATH `audit_log` (staff actions in PATH — not EHR logins)
 *
 * PATH does **not** store EHR audit rows. Live who/duration comes from an
 * optional HTTP feed (`PIMSY_AUDIT_FEED_URL`). This environment has no EHR
 * credentials; until ops set the URL + token, the task card stays honest and
 * empty. Never invent PHI or fake production sessions.
 */
import { parseHttpUrl } from "@/lib/http-url";
import { normalizeOverlapTitle } from "@/lib/playbook-meta";

export const CONFIRM_USERS_LOGGED_IN_TITLE = "Confirm users have logged in (prior to training)";

export const DEFAULT_AUDIT_WINDOW_DAYS = 14;
const MAX_AUDIT_WINDOW_DAYS = 90;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_SESSIONS = 100;

const LOGIN_EVENT_TYPES = new Set([
  "login",
  "logon",
  "signin",
  "sign-in",
  "sign_in",
  "session",
  "loggedin",
  "logged-in",
  "userlogin",
  "user_login",
  "authentication",
]);

/** Patient-chart fields only. Do not treat tenant `clientId` / site acronym as PHI. */
const PHI_KEY_HINTS = [
  "patient",
  "phi",
  "mrn",
  "ssn",
  "chartid",
  "diagnosis",
  "dateofbirth",
];

export type PimsySiteLookup = {
  code: string;
  crmAcronym?: string | null;
  crmKey?: string | null;
  prismClientId?: string | null;
};

export type PathPortalContact = {
  id: string;
  name: string | null;
  email: string;
  lastSeenAt: Date | string | null;
};

export type PimsyLoginSession = {
  displayName: string | null;
  username: string | null;
  loggedInAt: string;
  loggedOutAt: string | null;
  durationSeconds: number | null;
};

export type PimsyAuditFeedConfig =
  | { configured: false }
  | { configured: true; url: string; token: string | null; windowDays: number };

export type PimsyAuditFeedStatus = "unconfigured" | "missing_site_key" | "ok" | "error";

export type PimsyLoginConfirmation = {
  siteKey: string | null;
  crmKey: string | null;
  expectedUserCount: number | null;
  windowDays: number;
  feed: {
    status: PimsyAuditFeedStatus;
    configured: boolean;
    message: string;
    fetchedAt: string | null;
  };
  contacts: Array<
    PathPortalContact & {
      matchedEhrSession: boolean;
    }
  >;
  sessions: PimsyLoginSession[];
};

export function isConfirmUsersLoggedInTitle(title: string): boolean {
  const key = normalizeOverlapTitle(title);
  if (!key) return false;
  return key.includes("confirm users have logged in");
}

export function pimsySiteKey(site: PimsySiteLookup): string | null {
  for (const raw of [site.crmAcronym, site.prismClientId, site.code]) {
    const trimmed = raw?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function parseAuditWindowDays(raw: string | undefined | null): number {
  const n = Number(raw ?? DEFAULT_AUDIT_WINDOW_DAYS);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_AUDIT_WINDOW_DAYS;
  return Math.min(Math.floor(n), MAX_AUDIT_WINDOW_DAYS);
}

export function readPimsyAuditFeedConfig(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): PimsyAuditFeedConfig {
  const urlRaw = env.PIMSY_AUDIT_FEED_URL?.trim() ?? "";
  if (!urlRaw) return { configured: false };
  const parsed = parseHttpUrl(urlRaw.replace(/\{siteKey\}|\{crmKey\}/gi, "placeholder"));
  if (!parsed.ok) return { configured: false };
  const token = env.PIMSY_AUDIT_FEED_TOKEN?.trim() || null;
  return {
    configured: true,
    url: urlRaw,
    token,
    windowDays: parseAuditWindowDays(env.PIMSY_AUDIT_FEED_WINDOW_DAYS),
  };
}

export function formatSessionDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}s`;
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringField(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const direct = row[key];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    const lower = key.toLowerCase();
    for (const [k, v] of Object.entries(row)) {
      if (k.toLowerCase() === lower && typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return null;
}

function numberField(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const match = Object.entries(row).find(([k]) => k.toLowerCase() === key.toLowerCase());
    if (!match) continue;
    const v = match[1];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function parseIso(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseClockDuration(raw: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const hms = trimmed.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (hms) {
    const h = Number(hms[1]);
    const m = Number(hms[2]);
    const s = Number(hms[3] ?? 0);
    if ([h, m, s].every((n) => Number.isFinite(n))) return h * 3600 + m * 60 + s;
  }
  const mins = trimmed.match(/^(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?$/i);
  if (mins) return Math.round(Number(mins[1]) * 60);
  const hours = trimmed.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?)?$/i);
  if (hours) return Math.round(Number(hours[1]) * 3600);
  return null;
}

function looksLikePhiRow(row: Record<string, unknown>): boolean {
  return Object.keys(row).some((key) => {
    const compact = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    return PHI_KEY_HINTS.some((hint) => compact.includes(hint.replace(/_/g, "")));
  });
}

function isLoginEvent(row: Record<string, unknown>): boolean {
  const event = stringField(row, ["eventType", "event", "action", "type", "activity"]);
  if (!event) return true;
  const compact = event.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (LOGIN_EVENT_TYPES.has(event.toLowerCase()) || LOGIN_EVENT_TYPES.has(compact)) return true;
  return compact.includes("login") || compact.includes("signin") || compact.includes("logon");
}

function sessionFromRow(raw: unknown): PimsyLoginSession | null {
  const row = asRecord(raw);
  if (!row) return null;
  if (looksLikePhiRow(row)) return null;
  if (!isLoginEvent(row)) return null;

  const displayName = stringField(row, ["displayName", "name", "fullName", "user", "User"]);
  const username = stringField(row, ["username", "userName", "login", "loginName", "email"]);
  const loggedInAt = parseIso(
    stringField(row, ["loggedInAt", "loginAt", "startedAt", "loginTime", "LoginTime", "timestamp", "at"]),
  );
  if (!loggedInAt) return null;
  if (!displayName && !username) return null;

  const loggedOutAt = parseIso(
    stringField(row, ["loggedOutAt", "logoutAt", "endedAt", "logoutTime", "LogoutTime"]),
  );
  let durationSeconds = numberField(row, ["durationSeconds", "durationSecs", "seconds"]);
  if (durationSeconds == null) {
    const minutes = numberField(row, ["durationMinutes", "durationMins", "minutes"]);
    if (minutes != null) durationSeconds = Math.round(minutes * 60);
  }
  if (durationSeconds == null) {
    durationSeconds = parseClockDuration(stringField(row, ["duration", "Duration", "sessionLength"]));
  }
  if (durationSeconds == null && loggedOutAt) {
    const ms = new Date(loggedOutAt).getTime() - new Date(loggedInAt).getTime();
    if (Number.isFinite(ms) && ms >= 0) durationSeconds = Math.round(ms / 1000);
  }

  return {
    displayName,
    username,
    loggedInAt,
    loggedOutAt,
    durationSeconds,
  };
}

function sessionsFromPayload(payload: unknown): PimsyLoginSession[] | null {
  if (payload == null) return [];
  if (Array.isArray(payload)) {
    return payload.map(sessionFromRow).filter((s): s is PimsyLoginSession => Boolean(s));
  }
  const obj = asRecord(payload);
  if (!obj) return null;
  const nested =
    obj.sessions ?? obj.logins ?? obj.events ?? obj.rows ?? obj.data ?? obj.items ?? obj.results;
  if (!Array.isArray(nested)) return [];
  return nested.map(sessionFromRow).filter((s): s is PimsyLoginSession => Boolean(s));
}

/** Parse a feed body. Invalid JSON shape → null (caller treats as error, not fake rows). */
export function parsePimsyAuditFeed(payload: unknown): PimsyLoginSession[] | null {
  const sessions = sessionsFromPayload(payload);
  if (sessions == null) return null;
  const byKey = new Map<string, PimsyLoginSession>();
  for (const session of sessions) {
    const key = [
      session.username ?? "",
      session.displayName ?? "",
      session.loggedInAt,
      String(session.durationSeconds ?? ""),
    ].join("|");
    if (!byKey.has(key)) byKey.set(key, session);
  }
  return [...byKey.values()]
    .sort((a, b) => b.loggedInAt.localeCompare(a.loggedInAt))
    .slice(0, MAX_SESSIONS);
}

function identityTokens(value: string | null | undefined): string[] {
  if (!value) return [];
  const lower = value.trim().toLowerCase();
  if (!lower) return [];
  const local = lower.includes("@") ? lower.slice(0, lower.indexOf("@")) : lower;
  const compact = local.replace(/[^a-z0-9]+/g, "");
  return [...new Set([lower, local, compact].filter((t) => t.length >= 2))];
}

export function contactMatchesEhrSession(
  contact: Pick<PathPortalContact, "name" | "email">,
  session: PimsyLoginSession,
): boolean {
  const contactTokens = [
    ...identityTokens(contact.email),
    ...identityTokens(contact.name),
  ];
  const sessionTokens = [
    ...identityTokens(session.username),
    ...identityTokens(session.displayName),
  ];
  for (const a of contactTokens) {
    for (const b of sessionTokens) {
      if (a === b) return true;
      if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
    }
  }
  return false;
}

function feedUrl(config: Extract<PimsyAuditFeedConfig, { configured: true }>, siteKey: string, crmKey: string | null, since: Date): URL | null {
  const filled = config.url
    .replace(/\{siteKey\}/gi, encodeURIComponent(siteKey))
    .replace(/\{crmKey\}/gi, encodeURIComponent(crmKey ?? siteKey));
  const parsed = parseHttpUrl(filled);
  if (!parsed.ok) return null;
  const url = parsed.url;
  url.searchParams.set("siteKey", siteKey);
  if (crmKey) url.searchParams.set("crmKey", crmKey);
  url.searchParams.set("since", since.toISOString());
  url.searchParams.set("windowDays", String(config.windowDays));
  return url;
}

export type PimsyAuditFetchResult =
  | { ok: true; sessions: PimsyLoginSession[]; fetchedAt: string }
  | { ok: false; error: string; fetchedAt: string };

export async function fetchPimsyAuditSessions(opts: {
  config: Extract<PimsyAuditFeedConfig, { configured: true }>;
  siteKey: string;
  crmKey?: string | null;
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<PimsyAuditFetchResult> {
  const fetchedAt = (opts.now ?? new Date()).toISOString();
  const since = new Date((opts.now ?? new Date()).getTime() - opts.config.windowDays * 86_400_000);
  const url = feedUrl(opts.config, opts.siteKey, opts.crmKey ?? null, since);
  if (!url) {
    return { ok: false, error: "PIMSY_AUDIT_FEED_URL is not a valid http(s) address.", fetchedAt };
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.config.token) headers.Authorization = `Bearer ${opts.config.token}`;

  try {
    const fetchImpl = opts.fetchImpl ?? fetch;
    const res = await fetchImpl(url, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `EHR audit feed returned HTTP ${res.status}. No login rows were invented.`,
        fetchedAt,
      };
    }
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      return { ok: false, error: "EHR audit feed did not return JSON.", fetchedAt };
    }
    const sessions = parsePimsyAuditFeed(payload);
    if (sessions == null) {
      return { ok: false, error: "EHR audit feed JSON was not a session list.", fetchedAt };
    }
    return { ok: true, sessions, fetchedAt };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const message =
      name === "TimeoutError" || name === "AbortError"
        ? "EHR audit feed timed out."
        : "EHR audit feed could not be reached.";
    return { ok: false, error: `${message} No login rows were invented.`, fetchedAt };
  }
}

function unconfiguredMessage(): string {
  return "No PIMSY EHR audit feed is configured in this environment (PIMSY_AUDIT_FEED_URL is empty). PATH portal last-seen is not an EHR login. Keep using the live PIMSY audit log until ops add a read-only feed URL and token.";
}

export async function buildPimsyLoginConfirmation(opts: {
  site: PimsySiteLookup;
  contacts: PathPortalContact[];
  expectedUserCount?: number | null;
  config?: PimsyAuditFeedConfig;
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<PimsyLoginConfirmation> {
  const config = opts.config ?? readPimsyAuditFeedConfig();
  const siteKey = pimsySiteKey(opts.site);
  const crmKey = opts.site.crmKey?.trim() || null;
  const windowDays = config.configured ? config.windowDays : DEFAULT_AUDIT_WINDOW_DAYS;
  const contacts = opts.contacts.map((c) => ({ ...c, matchedEhrSession: false }));

  const empty: PimsyLoginConfirmation = {
    siteKey,
    crmKey,
    expectedUserCount: opts.expectedUserCount ?? null,
    windowDays,
    feed: {
      status: "unconfigured",
      configured: false,
      message: unconfiguredMessage(),
      fetchedAt: null,
    },
    contacts,
    sessions: [],
  };

  if (!config.configured) return empty;

  if (!siteKey) {
    return {
      ...empty,
      feed: {
        status: "missing_site_key",
        configured: true,
        message:
          "The feed is configured, but this project has no CRM acronym, Prism client id, or site code to look up. Set those on About — do not guess a tenant.",
        fetchedAt: null,
      },
    };
  }

  const result = await fetchPimsyAuditSessions({
    config,
    siteKey,
    crmKey,
    now: opts.now,
    fetchImpl: opts.fetchImpl,
  });

  if (!result.ok) {
    return {
      ...empty,
      feed: {
        status: "error",
        configured: true,
        message: result.error,
        fetchedAt: result.fetchedAt,
      },
    };
  }

  const matched = contacts.map((c) => ({
    ...c,
    matchedEhrSession: result.sessions.some((s) => contactMatchesEhrSession(c, s)),
  }));

  const uniqueLogins = new Set(
    result.sessions.map((s) => (s.username || s.displayName || "").toLowerCase()).filter(Boolean),
  );
  const emptyFeed =
    result.sessions.length === 0
      ? `The EHR audit feed returned no login sessions in the last ${windowDays} days for ${siteKey}. That is a real empty result, not sample data.`
      : `Live EHR audit feed for ${siteKey}: ${uniqueLogins.size} user${uniqueLogins.size === 1 ? "" : "s"}, ${result.sessions.length} session${result.sessions.length === 1 ? "" : "s"} in the last ${windowDays} days.`;

  return {
    siteKey,
    crmKey,
    expectedUserCount: opts.expectedUserCount ?? null,
    windowDays,
    feed: {
      status: "ok",
      configured: true,
      message: emptyFeed,
      fetchedAt: result.fetchedAt,
    },
    contacts: matched,
    sessions: result.sessions,
  };
}
