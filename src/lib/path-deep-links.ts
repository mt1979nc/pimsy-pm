/**
 * Durable PATH deep links for wizard / Power Automate / email / booking flows.
 *
 * Staff and customers reach the same object on different routes. A generic
 * wizard URL (the calm-mud Static Web App) has no project or task, and a
 * `/projects/…` link 404s for a customer. `/go?project=CODE&task=…` is the
 * durable contract: PATH decides portal vs staff after sign-in.
 *
 * Client-safe: no Postgres, `@/db` barrel, rollup, or mailer.
 */

import { DISCOVERY_WIZARD_URL, attachmentUrlIdentity } from "@/db/dock-default-attachments";
import { normalizeOverlapTitle } from "@/lib/playbook-meta";

export type PathAudience = "staff" | "portal";

export type PathDeepLinkDest =
  | "task"
  | "phase"
  | "project"
  | "about"
  | "messages"
  | "upload"
  | "learn";

/** Query keys Power Automate / the Discovery Wizard may send or receive. */
export const GO_QUERY = {
  project: "project",
  projectId: "projectId",
  task: "task",
  taskId: "taskId",
  phase: "phase",
  dest: "dest",
  step: "step",
  audience: "audience",
} as const;

export type PathGoQuery = {
  project?: string;
  projectId?: string;
  task?: string;
  taskId?: string;
  phase?: string;
  dest?: PathDeepLinkDest;
  step?: string;
  audience?: PathAudience;
};

export type ParsedAppHref = {
  audience: PathAudience;
  surface: PathDeepLinkDest | "other";
  projectId?: string;
  taskId?: string;
  phaseId?: string;
  threadId?: string;
  hash?: string;
};

/**
 * Same-origin app path only. Blocks `//evil`, schemes, and backslash tricks
 * so `/go` and sign-in `callbackUrl` cannot open the browser off PATH.
 */
export function isSafeAppPath(raw: string | null | undefined): raw is string {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return false;
  if (trimmed.startsWith("//")) return false;
  if (trimmed.startsWith("/\\")) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return false;
  if (trimmed.includes("\\")) return false;
  if (trimmed.includes("://")) return false;
  return true;
}

export function safeAppPath(raw: string | null | undefined): string | null {
  return isSafeAppPath(raw) ? raw.trim() : null;
}

export function staffProjectPath(projectId: string): string {
  return `/projects/${projectId}`;
}

export function portalProjectPath(projectId: string): string {
  return `/portal/projects/${projectId}`;
}

export function staffTaskPath(projectId: string, taskId: string): string {
  return `/projects/${projectId}/tasks/${taskId}`;
}

export function portalTaskPath(projectId: string, taskId: string): string {
  return `/portal/projects/${projectId}/tasks/${taskId}`;
}

export function staffPhasePath(projectId: string): string {
  return `/projects/${projectId}/tasks`;
}

export function portalPhasePath(projectId: string, phaseId: string): string {
  return `/portal/projects/${projectId}/phases/${phaseId}`;
}

export function staffAboutPath(projectId: string): string {
  return `/projects/${projectId}/about`;
}

export function portalAboutPath(projectId: string): string {
  return `/portal/projects/${projectId}/about`;
}

export function staffMessagesPath(projectId: string, threadId?: string): string {
  return threadId
    ? `/projects/${projectId}/messages/${threadId}`
    : `/projects/${projectId}/messages`;
}

export function portalMessagesPath(projectId: string, threadId?: string): string {
  return threadId
    ? `/portal/projects/${projectId}/messages/${threadId}`
    : `/portal/projects/${projectId}/messages`;
}

export function pathForAudience(
  audience: PathAudience,
  opts: {
    dest: PathDeepLinkDest;
    projectId: string;
    taskId?: string;
    phaseId?: string;
    threadId?: string;
  },
): string {
  const { dest, projectId, taskId, phaseId, threadId } = opts;
  if (dest === "learn") return audience === "portal" ? "/portal/learn" : "/learning";
  if (dest === "about") {
    return audience === "portal" ? portalAboutPath(projectId) : staffAboutPath(projectId);
  }
  if (dest === "messages") {
    return audience === "portal"
      ? portalMessagesPath(projectId, threadId)
      : staffMessagesPath(projectId, threadId);
  }
  if (dest === "phase") {
    if (audience === "portal" && phaseId) return portalPhasePath(projectId, phaseId);
    return staffPhasePath(projectId);
  }
  if ((dest === "task" || dest === "upload") && taskId) {
    const base = audience === "portal" ? portalTaskPath(projectId, taskId) : staffTaskPath(projectId, taskId);
    return dest === "upload" ? `${base}#upload` : base;
  }
  return audience === "portal" ? portalProjectPath(projectId) : staffProjectPath(projectId);
}

export function parseAppHref(href: string | null | undefined): ParsedAppHref | null {
  if (!href) return null;
  let path = href.trim();
  let hash: string | undefined;
  const hashAt = path.indexOf("#");
  if (hashAt >= 0) {
    hash = path.slice(hashAt + 1);
    path = path.slice(0, hashAt);
  }
  const qAt = path.indexOf("?");
  if (qAt >= 0) path = path.slice(0, qAt);
  if (!isSafeAppPath(path)) return null;

  const portalTask = /^\/portal\/projects\/([^/]+)\/tasks\/([^/]+)\/?$/.exec(path);
  if (portalTask) {
    return { audience: "portal", surface: "task", projectId: portalTask[1], taskId: portalTask[2], hash };
  }
  const portalPhase = /^\/portal\/projects\/([^/]+)\/phases\/([^/]+)\/?$/.exec(path);
  if (portalPhase) {
    return { audience: "portal", surface: "phase", projectId: portalPhase[1], phaseId: portalPhase[2], hash };
  }
  const portalAbout = /^\/portal\/projects\/([^/]+)\/about\/?$/.exec(path);
  if (portalAbout) {
    return { audience: "portal", surface: "about", projectId: portalAbout[1], hash };
  }
  const portalMsg = /^\/portal\/projects\/([^/]+)\/messages(?:\/([^/]+))?\/?$/.exec(path);
  if (portalMsg) {
    return {
      audience: "portal",
      surface: "messages",
      projectId: portalMsg[1],
      threadId: portalMsg[2],
      hash,
    };
  }
  const portalProject = /^\/portal\/projects\/([^/]+)\/?$/.exec(path);
  if (portalProject) {
    return { audience: "portal", surface: "project", projectId: portalProject[1], hash };
  }

  const staffTask = /^\/projects\/([^/]+)\/tasks\/([^/]+)\/?$/.exec(path);
  if (staffTask) {
    return { audience: "staff", surface: "task", projectId: staffTask[1], taskId: staffTask[2], hash };
  }
  const previewTask = /^\/projects\/([^/]+)\/customer-view\/tasks\/([^/]+)\/?$/.exec(path);
  if (previewTask) {
    return { audience: "staff", surface: "task", projectId: previewTask[1], taskId: previewTask[2], hash };
  }
  const staffAbout = /^\/projects\/([^/]+)\/about\/?$/.exec(path);
  if (staffAbout) {
    return { audience: "staff", surface: "about", projectId: staffAbout[1], hash };
  }
  const staffMsg = /^\/projects\/([^/]+)\/messages(?:\/([^/]+))?\/?$/.exec(path);
  if (staffMsg) {
    return { audience: "staff", surface: "messages", projectId: staffMsg[1], threadId: staffMsg[2], hash };
  }
  const staffProject = /^\/projects\/([^/]+)\/?$/.exec(path);
  if (staffProject) {
    return { audience: "staff", surface: "project", projectId: staffProject[1], hash };
  }
  return null;
}

function compact(value: string | null | undefined): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

function asDest(raw: string | null | undefined): PathDeepLinkDest | undefined {
  const key = (raw ?? "").trim().toLowerCase();
  if (key === "task" || key === "phase" || key === "project" || key === "about" || key === "messages" || key === "upload" || key === "learn") {
    return key;
  }
  if (key === "booking" || key === "schedule" || key === "zoom") return "about";
  if (key === "section" || key === "tab" || key === "area") return "phase";
  if (key === "form" || key === "wizard") return "task";
  return undefined;
}

function asAudience(raw: string | null | undefined): PathAudience | undefined {
  const key = (raw ?? "").trim().toLowerCase();
  if (key === "staff" || key === "internal" || key === "specialist") return "staff";
  if (key === "portal" || key === "customer" || key === "client") return "portal";
  return undefined;
}

export function parseGoQuery(params: URLSearchParams | Record<string, string | string[] | undefined | null>): PathGoQuery {
  const get = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) return compact(params.get(key) ?? undefined);
    const raw = params[key];
    if (Array.isArray(raw)) return compact(raw[0]);
    return compact(raw ?? undefined);
  };
  return {
    project: get(GO_QUERY.project) ?? get("code") ?? get("acronym") ?? get("site"),
    projectId: get(GO_QUERY.projectId),
    task: get(GO_QUERY.task) ?? get("taskTitle") ?? get("title"),
    taskId: get(GO_QUERY.taskId),
    phase: get(GO_QUERY.phase) ?? get("section") ?? get("tab"),
    dest: asDest(get(GO_QUERY.dest) ?? get("to")),
    step: get(GO_QUERY.step),
    audience: asAudience(get(GO_QUERY.audience)),
  };
}

export function buildGoPath(query: PathGoQuery): string {
  const params = new URLSearchParams();
  if (query.project) params.set(GO_QUERY.project, query.project);
  if (query.projectId) params.set(GO_QUERY.projectId, query.projectId);
  if (query.task) params.set(GO_QUERY.task, query.task);
  if (query.taskId) params.set(GO_QUERY.taskId, query.taskId);
  if (query.phase) params.set(GO_QUERY.phase, query.phase);
  if (query.dest) params.set(GO_QUERY.dest, query.dest);
  if (query.step) params.set(GO_QUERY.step, query.step);
  if (query.audience) params.set(GO_QUERY.audience, query.audience);
  const qs = params.toString();
  return qs ? `/go?${qs}` : "/go";
}

export function buildGoAbsoluteUrl(appOrigin: string, query: PathGoQuery): string {
  const origin = appOrigin.replace(/\/+$/, "");
  return `${origin}${buildGoPath(query)}`;
}

/**
 * Discovery Wizard steps (calm-mud SWA step bar, 2026-09-16). Each step maps
 * to PATH playbook titles — staff may land on Configuration consumers;
 * customers fall back to a SHARED Discovery task or the Discovery tab.
 */
export const WIZARD_STEP_TASK_TITLES: Record<string, string[]> = {
  org: [
    "Organization Details Form",
    "Organization Details",
    "Discovery org details",
    "Org details",
    "Org Info",
  ],
  users: ["Create Users", "Guided Discovery Meeting", "Organization Details Form"],
  codes: ["Billing Code Setup", "Billing Questionnaire", "Guided Discovery Meeting"],
  rates: [
    "User Codes / Rates",
    "User Codes",
    "Supervision Setup",
    "Schedule: Workflow Guided Discovery",
  ],
  locations: ["Division Setup", "Business Hours", "Organization Details Form"],
  review: ["Guided Discovery Meeting", "Organization Details Form", "Schedule: Workflow Guided Discovery"],
};

const WIZARD_STEP_ALIAS_RAW: Record<string, keyof typeof WIZARD_STEP_TASK_TITLES> = {
  "0": "org",
  "1": "users",
  "2": "codes",
  "3": "rates",
  "4": "review",
  "5": "review",
  org: "org",
  "org details": "org",
  "org-details": "org",
  organization: "org",
  "organization details": "org",
  general: "org",
  users: "users",
  user: "users",
  providers: "users",
  codes: "codes",
  cpt: "codes",
  "cpt codes": "codes",
  billing: "codes",
  rates: "rates",
  "user codes": "rates",
  "user codes/rates": "rates",
  "user codes rates": "rates",
  "user-codes": "rates",
  locations: "locations",
  location: "locations",
  hours: "locations",
  review: "review",
  submit: "review",
  complete: "review",
  done: "review",
  confirmation: "review",
};

const WIZARD_STEP_ALIASES: Record<string, keyof typeof WIZARD_STEP_TASK_TITLES> = (() => {
  const map: Record<string, keyof typeof WIZARD_STEP_TASK_TITLES> = {};
  for (const [raw, dest] of Object.entries(WIZARD_STEP_ALIAS_RAW)) {
    map[normalizeOverlapTitle(raw) || raw] = dest;
  }
  return map;
})();

export function normalizeWizardStep(step: string | null | undefined): keyof typeof WIZARD_STEP_TASK_TITLES | null {
  const key = normalizeOverlapTitle(step ?? "");
  if (!key) return null;
  return WIZARD_STEP_ALIASES[key] ?? null;
}

export function wizardStepTaskTitles(step: string | null | undefined): string[] {
  const norm = normalizeWizardStep(step);
  return norm ? WIZARD_STEP_TASK_TITLES[norm] : [];
}

export function inferGoDest(query: PathGoQuery): PathDeepLinkDest {
  if (query.dest) return query.dest;
  if (query.taskId || query.task) return "task";
  if (query.step) {
    const step = normalizeWizardStep(query.step);
    if (step === "locations") return "task";
    if (step) return "task";
  }
  if (query.phase) return "phase";
  return "project";
}

export type WizardLaunchContext = {
  projectId?: string | null;
  projectCode?: string | null;
  taskId?: string | null;
  taskTitle?: string | null;
  audience?: PathAudience | null;
  step?: string | null;
  /** Absolute PATH origin, e.g. https://path.azurewebsites.net — required for `return`. */
  appOrigin?: string | null;
};

export function discoveryWizardIdentity(url: string): string | null {
  try {
    new URL(url);
  } catch {
    return null;
  }
  return attachmentUrlIdentity(url);
}

export function isDiscoveryWizardUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const got = discoveryWizardIdentity(raw);
  const want = discoveryWizardIdentity(DISCOVERY_WIZARD_URL);
  return Boolean(got && want && got === want);
}

/**
 * Stamp the live wizard URL with PATH context. The SWA currently posts to
 * Power Automate without a site acronym; query params are how PATH (and a
 * later wizard build) identify the workspace. Never put PHI here.
 */
export function stampDiscoveryWizardUrl(base: string, ctx: WizardLaunchContext): string {
  if (!isDiscoveryWizardUrl(base)) return base;
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return base;
  }

  const projectId = compact(ctx.projectId);
  const projectCode = compact(ctx.projectCode);
  const taskId = compact(ctx.taskId);
  const taskTitle = compact(ctx.taskTitle);
  const step = compact(ctx.step);
  const audience = ctx.audience === "portal" || ctx.audience === "staff" ? ctx.audience : undefined;

  if (projectCode) url.searchParams.set("project", projectCode);
  if (projectId) url.searchParams.set("projectId", projectId);
  if (taskTitle) url.searchParams.set("task", taskTitle);
  if (taskId) url.searchParams.set("taskId", taskId);
  if (audience) url.searchParams.set("audience", audience);
  if (step) url.searchParams.set("step", step);

  const origin = compact(ctx.appOrigin)?.replace(/\/+$/, "");
  if (origin && /^https?:\/\//i.test(origin)) {
    const go = buildGoAbsoluteUrl(origin, {
      project: projectCode,
      projectId,
      task: taskTitle,
      taskId,
      dest: "task",
      step: step,
      audience,
    });
    url.searchParams.set("return", go);
    url.searchParams.set("go", go);
  }

  return url.toString();
}

export function wizardLaunchFromTaskHref(
  base: string,
  opts: {
    title: string;
    taskHref?: string | null;
    projectCode?: string | null;
    appOrigin?: string | null;
    step?: string | null;
  },
): string {
  const parsed = parseAppHref(opts.taskHref ?? null);
  return stampDiscoveryWizardUrl(base, {
    projectId: parsed?.projectId,
    projectCode: opts.projectCode,
    taskId: parsed?.taskId,
    taskTitle: opts.title,
    audience: parsed?.audience,
    step: opts.step,
    appOrigin: opts.appOrigin,
  });
}
