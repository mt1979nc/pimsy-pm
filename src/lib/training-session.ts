/**
 * Training session identity — client-safe, no Postgres.
 *
 * PATH has no separate calendar/session table. A “Training N” playbook parent
 * (plus Schedule / Recording Link children) is the session. Booked slots live
 * on `task.session_at` so playbook `startDate` / `dueDate` stay timeline math.
 */
import { fmtDateTime } from "@/lib/dates";

export type TrainingFamily =
  | "core"
  | "billing"
  | "auth"
  | "payroll"
  | "client_payment"
  | "eprescribe"
  | "efax"
  | "labs"
  | "evv"
  | "bed"
  | "emar"
  | "inventory"
  | "other";

export type TrainingRole = "session" | "schedule" | "recording" | "add_date";

export type TrainingRef = {
  role: TrainingRole;
  family: TrainingFamily;
  sessionNumber: number | null;
  /** Short label for UI, e.g. "Training 1" or "Billing Training 1". */
  sessionLabel: string;
};

const FAMILY_PREFIX: Record<string, TrainingFamily> = {
  billing: "billing",
  auth: "auth",
  payroll: "payroll",
  "client payment": "client_payment",
  "client payments": "client_payment",
  core: "core",
};

function collapse(title: string): string {
  return title.replace(/\s+/g, " ").trim();
}

function familyFromPrefix(raw: string | undefined | null): TrainingFamily {
  const key = (raw ?? "").toLowerCase().trim();
  return FAMILY_PREFIX[key] ?? "core";
}

function labelFor(family: TrainingFamily, n: number | null): string {
  const numbered = n != null ? String(n) : "";
  switch (family) {
    case "billing":
      return numbered ? `Billing Training ${numbered}` : "Billing Training";
    case "auth":
      return numbered ? `Auth Training ${numbered}` : "Auth Training";
    case "payroll":
      return numbered ? `Payroll Training ${numbered}` : "Payroll Training";
    case "client_payment":
      return numbered ? `Client Payment Training ${numbered}` : "Client Payment Training";
    case "eprescribe":
      return "ePrescribe training";
    case "efax":
      return "eFax Training";
    case "labs":
      return "Labs Training";
    case "evv":
      return "EVV Training";
    case "bed":
      return "Bed Management Training";
    case "emar":
      return "eMAR Training";
    case "inventory":
      return "Inventory Management Training";
    default:
      return numbered ? `Training ${numbered}` : "Training";
  }
}

const PREFIX = "(billing|auth|payroll|client payments?)";

/**
 * Classify a live or playbook task title. Null when the row is not a training
 * session / schedule / recording-link / add-date housekeeping item.
 */
export function parseTrainingRef(title: string): TrainingRef | null {
  const n = collapse(title);
  if (!n) return null;

  if (/^add date to training task title$/i.test(n)) {
    return { role: "add_date", family: "core", sessionNumber: 1, sessionLabel: labelFor("core", 1) };
  }

  let m = n.match(new RegExp(`^schedule\\s+(?:${PREFIX}\\s+)?training\\s+(\\d+)\\b`, "i"));
  if (m) {
    const family = familyFromPrefix(m[1]);
    const sessionNumber = Number.parseInt(m[2]!, 10);
    return { role: "schedule", family, sessionNumber, sessionLabel: labelFor(family, sessionNumber) };
  }

  if (/^schedule\s+e-?prescribe\s+training\b/i.test(n)) {
    return {
      role: "schedule",
      family: "eprescribe",
      sessionNumber: null,
      sessionLabel: labelFor("eprescribe", null),
    };
  }

  m = n.match(new RegExp(`^(?:${PREFIX}\\s+)?training\\s+(\\d+)\\s+recording\\s+link$`, "i"));
  if (m) {
    const family = familyFromPrefix(m[1]);
    const sessionNumber = Number.parseInt(m[2]!, 10);
    return { role: "recording", family, sessionNumber, sessionLabel: labelFor(family, sessionNumber) };
  }

  const specialtyRecording: Array<[RegExp, TrainingFamily]> = [
    [/^bed management training link$/i, "bed"],
    [/^emar training link$/i, "emar"],
    [/^inventory management training link$/i, "inventory"],
    [/^efax training$/i, "efax"],
    [/^labs training$/i, "labs"],
    [/^evv training$/i, "evv"],
  ];
  for (const [re, family] of specialtyRecording) {
    if (re.test(n) && /link$/i.test(n)) {
      return { role: "recording", family, sessionNumber: null, sessionLabel: labelFor(family, null) };
    }
  }

  if (/^training:\s*complex clinical\b/i.test(n)) {
    return {
      role: "session",
      family: "eprescribe",
      sessionNumber: null,
      sessionLabel: "ePrescribe training",
    };
  }

  m = n.match(new RegExp(`^(?:${PREFIX}\\s+)?training\\s+(\\d+)\\b`, "i"));
  if (m) {
    const family = familyFromPrefix(m[1]);
    const sessionNumber = Number.parseInt(m[2]!, 10);
    return { role: "session", family, sessionNumber, sessionLabel: labelFor(family, sessionNumber) };
  }

  const specialtySession: Array<[RegExp, TrainingFamily]> = [
    [/^bed management$/i, "bed"],
    [/^emar$/i, "emar"],
    [/^inventory management$/i, "inventory"],
    [/^efax training$/i, "efax"],
    [/^labs training$/i, "labs"],
    [/^evv training$/i, "evv"],
  ];
  for (const [re, family] of specialtySession) {
    if (re.test(n)) {
      return { role: "session", family, sessionNumber: null, sessionLabel: labelFor(family, null) };
    }
  }

  return null;
}

export function trainingKey(ref: Pick<TrainingRef, "family" | "sessionNumber">): string {
  return `${ref.family}:${ref.sessionNumber ?? "x"}`;
}

export function isTrainingSessionParent(title: string): boolean {
  return parseTrainingRef(title)?.role === "session";
}

export function isScheduleTrainingTask(title: string): boolean {
  return parseTrainingRef(title)?.role === "schedule";
}

export function isRecordingLinkTask(title: string): boolean {
  return parseTrainingRef(title)?.role === "recording";
}

export function isAddDateToTitleTask(title: string): boolean {
  return parseTrainingRef(title)?.role === "add_date";
}

export function canBookTrainingSession(title: string): boolean {
  const role = parseTrainingRef(title)?.role;
  return role === "session" || role === "schedule";
}

export function findNextSession<T extends { title: string }>(fromTitle: string, tasks: T[]): T | null {
  const ref = parseTrainingRef(fromTitle);
  if (!ref || ref.role !== "session" || ref.sessionNumber == null) return null;
  const want = ref.sessionNumber + 1;
  return (
    tasks.find((t) => {
      const r = parseTrainingRef(t.title);
      return r?.role === "session" && r.family === ref.family && r.sessionNumber === want;
    }) ?? null
  );
}

function lastIntCapture(match: RegExpMatchArray): number | null {
  for (let i = match.length - 1; i >= 1; i--) {
    const cap = match[i];
    if (cap && /^\d+$/.test(cap)) return Number.parseInt(cap, 10);
  }
  return null;
}

function familyFromMatchPrefix(match: RegExpMatchArray): TrainingFamily {
  for (let i = 1; i < match.length; i++) {
    const cap = match[i];
    if (cap && !/^\d+$/.test(cap)) return familyFromPrefix(cap);
  }
  return "core";
}

/** Parse “Core Training — Session 2” / “Training 1 recording” style names. */
export function parseRecordingNameRef(name: string): Pick<TrainingRef, "family" | "sessionNumber"> | null {
  const n = collapse(name);
  if (!n) return null;

  let m = n.match(new RegExp(`(?:${PREFIX}|core)\\s+training\\b[\\s\\S]*?(\\d+)`, "i"));
  if (m) {
    const sessionNumber = lastIntCapture(m);
    if (sessionNumber != null) {
      return { family: familyFromMatchPrefix(m), sessionNumber };
    }
  }

  m = n.match(new RegExp(`(?:${PREFIX}\\s+)?training\\s*(?:session\\s*)?(\\d+)\\b`, "i"));
  if (m) {
    const sessionNumber = lastIntCapture(m);
    if (sessionNumber != null) {
      return { family: familyFromMatchPrefix(m), sessionNumber };
    }
  }

  m = n.match(/\bsession\s*(\d+)\b/i);
  if (m) {
    const sessionNumber = lastIntCapture(m);
    if (sessionNumber != null) return { family: "core", sessionNumber };
  }

  return null;
}

export function matchRecordingNameToSessions<T extends { id: string; title: string }>(
  name: string,
  sessions: T[],
): T | null {
  const parsed = parseRecordingNameRef(name);
  if (!parsed || parsed.sessionNumber == null) return null;
  const exact = sessions.find((t) => {
    const r = parseTrainingRef(t.title);
    return r?.role === "session" && r.family === parsed.family && r.sessionNumber === parsed.sessionNumber;
  });
  if (exact) return exact;
  if (parsed.family !== "core") {
    return (
      sessions.find((t) => {
        const r = parseTrainingRef(t.title);
        return r?.role === "session" && r.family === "core" && r.sessionNumber === parsed.sessionNumber;
      }) ?? null
    );
  }
  return (
    sessions.find((t) => {
      const r = parseTrainingRef(t.title);
      return r?.role === "session" && r.sessionNumber === parsed.sessionNumber;
    }) ?? null
  );
}

/** Zoom cloud recording paths only — not join/booking URLs. */
export function looksLikeZoomRecording(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  const isZoom = host === "zoom.us" || host.endsWith(".zoom.us");
  if (!isZoom) return false;
  return path.includes("/rec/") || path.includes("/recording");
}

export function shouldTreatLinkAsRecording(taskTitle: string, url: URL): boolean {
  const ref = parseTrainingRef(taskTitle);
  if (ref?.role === "recording") return true;
  if (ref?.role === "session" && looksLikeZoomRecording(url)) return true;
  return false;
}

export function normalizeRecordingUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    let path = u.pathname.replace(/\/+$/, "") || "/";
    u.pathname = path;
    return u.toString();
  } catch {
    return url.trim();
  }
}

export function scheduledSessionLabel(sessionAt: Date | string | null | undefined): string | null {
  if (!sessionAt) return null;
  const d = typeof sessionAt === "string" ? new Date(sessionAt) : sessionAt;
  if (Number.isNaN(d.getTime())) return null;
  return `Scheduled ${fmtDateTime(d)}`;
}

export function trainingSessionsFromTasks<T extends { id: string; title: string }>(
  tasks: T[],
): Array<T & { ref: TrainingRef }> {
  const out: Array<T & { ref: TrainingRef }> = [];
  for (const t of tasks) {
    const ref = parseTrainingRef(t.title);
    if (ref?.role === "session") out.push({ ...t, ref });
  }
  out.sort((a, b) => {
    if (a.ref.family !== b.ref.family) return a.ref.family.localeCompare(b.ref.family);
    return (a.ref.sessionNumber ?? 0) - (b.ref.sessionNumber ?? 0);
  });
  return out;
}
