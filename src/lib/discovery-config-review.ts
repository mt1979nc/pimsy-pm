/**
 * Customer Discovery file intake → Configuration review tasks.
 *
 * Pure helpers (no Postgres, rollup, or library server imports) so staff task
 * list UI can show the Review required badge without bundling the DB client.
 *
 * Trigger: a **customer** (portal) upload on a Discovery-phase task — typically
 * Submit Documents, 3–20 work documents whose filenames are form names.
 * Staff uploads on the same tasks do not spawn Configuration rows.
 */

import { phaseMatchesExposeTarget } from "@/lib/dock-phase-visibility";

export const REVIEW_REQUIRED_LABEL = "Review required";

/** Cap for one portal submit. Alexander’s Discovery packet is typically 3–20. */
export const MAX_DISCOVERY_BATCH_FILES = 25;

export function isDiscoveryPhaseName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  if (n === "discovery") return true;
  if (n.startsWith("discovery ")) return true;
  return false;
}

/** Site Configuration / Configuration — same matching as the Dock eyelid. */
export function isConfigurationPhaseName(name: string | null | undefined): boolean {
  if (!name) return false;
  return phaseMatchesExposeTarget(name, "Site Configuration");
}

export function shouldSpawnConfigurationReview(opts: {
  isCustomer: boolean;
  phaseName: string | null | undefined;
}): boolean {
  return opts.isCustomer && isDiscoveryPhaseName(opts.phaseName);
}

/**
 * Filename → specialist task title.
 * `Authorization_Form.pdf` → `Authorization Form`. Extension stripped; underscores
 * and hyphens become spaces. Mixed case and acronyms (`ROI.pdf`) are preserved.
 */
export function cleanUploadedFileTitle(filename: string): string {
  const base = filename.replace(/^.*[/\\]/, "").trim();
  const withoutExt = base.replace(/\.[A-Za-z0-9]{1,8}$/, "");
  const spaced = withoutExt
    .replace(/[_]+/g, " ")
    .replace(/[-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return spaced || "Untitled document";
}

export function normalizeReviewTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Files from a multi-select input (`name="file"` and/or `name="files"`). */
export function collectUploadFiles(formData: FormData): File[] {
  const raw = [...formData.getAll("file"), ...formData.getAll("files")];
  const out: File[] = [];
  const seen = new Set<File>();
  for (const item of raw) {
    if (!(item instanceof File) || item.size === 0) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

export function showReviewRequiredBadge(task: {
  reviewRequired?: boolean | null;
  status?: string | null;
  notApplicable?: boolean | null;
}): boolean {
  if (!task.reviewRequired) return false;
  if (task.notApplicable) return false;
  if (task.status === "DONE" || task.status === "CANCELLED") return false;
  return true;
}

// ---------------------------------------------------------------------------
// Discovery Wizard workbook → Configuration consumer tasks
// ---------------------------------------------------------------------------

/**
 * Titles that host the Discovery Wizard (Click Here) or receive its Excel dump.
 * Fan-out is keyed off these rows — not every Discovery upload.
 */
export const DISCOVERY_WIZARD_SOURCE_TITLES = [
  "Organization Details Form",
  "Organization Details",
  "Discovery org details",
  "Org details",
  "Guided Discovery Meeting",
  "Guided Discovery",
  "Schedule: Workflow Guided Discovery",
  "Schedule Workflow Guided Discovery",
  "Workflow Guided Discovery",
] as const;

/**
 * Site Configuration playbook rows that consume wizard tabs
 * (organization, locations, users, cptCodes, userCodeRates).
 * Full workbook on each consumer is intentional — no xlsx parser in PATH.
 */
export const DISCOVERY_WIZARD_CONSUMER_TITLES = [
  "Org Info",
  "Division Setup",
  "Business Hours",
  "Create Users",
  "Supervision Setup",
  "Billing Code Setup",
  "User Codes / Rates",
] as const;

const WIZARD_CONSUMER_ALIASES = [
  "Organization Info",
  "User Codes and Rates",
  "User Codes",
  "User Rates",
] as const;

const SPREADSHEET_EXT = /\.(xlsx|xlsm|xlsb|xls)$/i;

export function normalizeTaskTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const WIZARD_SOURCE_KEYS = new Set(
  DISCOVERY_WIZARD_SOURCE_TITLES.map((t) => normalizeTaskTitleKey(t)),
);
const WIZARD_CONSUMER_KEYS = new Set(
  [...DISCOVERY_WIZARD_CONSUMER_TITLES, ...WIZARD_CONSUMER_ALIASES].map((t) =>
    normalizeTaskTitleKey(t),
  ),
);

export function isWizardSourceTaskTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return WIZARD_SOURCE_KEYS.has(normalizeTaskTitleKey(title));
}

export function isWizardConsumerTaskTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return WIZARD_CONSUMER_KEYS.has(normalizeTaskTitleKey(title));
}

export function isSpreadsheetFilename(name: string | null | undefined): boolean {
  if (!name) return false;
  const base = name.replace(/^.*[/\\]/, "").trim();
  return SPREADSHEET_EXT.test(base);
}

/**
 * Filenames that look like the wizard dump even when they land on Submit Documents.
 * Ordinary billed sheets (`Sliding_Fee_Scale.xlsx`) stay review-required spawns.
 */
export function isWizardWorkbookFilename(name: string | null | undefined): boolean {
  if (!isSpreadsheetFilename(name)) return false;
  const base = name!.replace(/^.*[/\\]/, "").replace(/\.[A-Za-z0-9]{1,8}$/, "");
  const key = normalizeTaskTitleKey(base);
  return /wizard|guided discovery|organization details|org details|discovery workbook/.test(
    key,
  );
}

const WORKBOOK_LINK_HOST =
  /sharepoint\.com$|onedrive\.live\.com$|1drv\.ms$|office\.com$|officeapps\.live\.com$/i;

export function isWorkbookLink(url: string, name?: string | null): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (name && (isSpreadsheetFilename(name) || isWizardWorkbookFilename(name))) return true;
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (host === "zoom.us" || host.endsWith(".zoom.us") || host.includes("zoom.com")) return false;
  if (host.endsWith("azurestaticapps.net")) return false;
  if (host === "teams.microsoft.com" || host.endsWith(".teams.microsoft.com")) return false;
  const path = decodeURIComponent(parsed.pathname);
  if (isSpreadsheetFilename(path)) return true;
  const search = parsed.search.toLowerCase();
  if (WORKBOOK_LINK_HOST.test(host) && /(\.xlsx|\.xlsm|\.xlsb|\.xls|xlsx)/i.test(`${path} ${search}`)) {
    return true;
  }
  return false;
}

/**
 * Attach this file/link onto Configuration consumers (and skip spawning a
 * review-required row for it). Any spreadsheet on a wizard source task fans
 * out; a wizard-named workbook fans out from any Discovery task.
 */
export function shouldFanOutWizardWorkbook(opts: {
  sourceTitle: string | null | undefined;
  filename?: string | null;
  url?: string | null;
  linkName?: string | null;
}): boolean {
  if (opts.filename) {
    if (isWizardWorkbookFilename(opts.filename)) return true;
    if (isWizardSourceTaskTitle(opts.sourceTitle) && isSpreadsheetFilename(opts.filename)) {
      return true;
    }
  }
  if (opts.url) {
    return (
      isWizardSourceTaskTitle(opts.sourceTitle) &&
      isWorkbookLink(opts.url, opts.linkName ?? opts.filename)
    );
  }
  return false;
}

/** @deprecated Use shouldFanOutWizardWorkbook. */
export const shouldAttachWizardWorkbook = shouldFanOutWizardWorkbook;

export type WizardWebhookJson = {
  projectCode: string;
  url: string;
  name?: string;
};

/**
 * Power Automate JSON body. Project key may be `projectCode`, `acronym`,
 * `code`, `prismClientId`, or `crmAcronym`.
 */
export function parseWizardWebhookJson(
  body: unknown,
): { ok: true; data: WizardWebhookJson } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Expected a JSON object." };
  }
  const o = body as Record<string, unknown>;
  const projectCode = String(
    o.projectCode ?? o.acronym ?? o.code ?? o.prismClientId ?? o.crmAcronym ?? "",
  ).trim();
  if (!projectCode) {
    return { ok: false, error: "Missing projectCode (or acronym / code)." };
  }
  const url = typeof o.url === "string" ? o.url.trim() : "";
  if (!url) {
    return { ok: false, error: "Missing url. Send a workbook link or POST a multipart file." };
  }
  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : undefined;
  return { ok: true, data: { projectCode, url, name } };
}
