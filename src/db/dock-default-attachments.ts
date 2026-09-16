/**
 * Default files / links Dock attaches to Implementation template tasks
 * (Discovery Wizard, billing sheets, questionnaires).
 *
 * Discovery Wizard is the live Azure Static Web Apps URL from the 2026-09-14
 * Dock inventory — a LINK on the matching PATH tasks, never only a URL stuffed
 * into the task description.
 *
 * Spreadsheet binaries are not in git. Placeholders live under
 * `content/default-attachments/`. Drop the real Dock files once into
 * `content/template-attachments/` (see that folder's README) or replace them
 * from Templates → File library. Do not invent PHI or fake xlsx bytes.
 */
import { normalizeOverlapTitle } from "@/lib/playbook-meta";

export const DISCOVERY_WIZARD_URL = "https://calm-mud-0fe119810.7.azurestaticapps.net/";

export type DefaultLibraryDef = {
  slug: string;
  name: string;
  kind?: "FILE" | "LINK";
  url?: string;
  /** Placeholder markdown shipped in `content/default-attachments/`. */
  fileName?: string;
  /** Real Dock binary drop name under `content/template-attachments/`. */
  packFileName?: string;
  mimeType?: string;
  description: string;
  adminNotes: string;
  visibility: "INTERNAL" | "SHARED";
  isPlaceholder?: boolean;
  /**
   * Dock/PATH task titles this file should auto-attach to. Matching is
   * normalized (punctuation-insensitive) so em-dashes and Dock short titles
   * still hit the playbook row.
   */
  attachToTitles: string[];
};

export const DEFAULT_LIBRARY_ASSETS: DefaultLibraryDef[] = [
  {
    slug: "discovery-wizard",
    name: "Discovery Wizard",
    kind: "LINK",
    url: DISCOVERY_WIZARD_URL,
    isPlaceholder: false,
    description:
      "Guided discovery workbook (live PATH/Dock Discovery Wizard). Opens as a task attachment — not a description footnote.",
    adminNotes:
      "Live URL from Dock PWMI Organization Details Form (2026-09-15). Attaches as a LINK on Guided Discovery / Workflow Guided Discovery and Organization Details Form. Clinical Workflows is a Dock Form, not this wizard. Replace the URL here only if the Azure Static Web App moves.",
    visibility: "SHARED",
    attachToTitles: [
      "Guided Discovery Meeting",
      "Guided Discovery",
      "Organization Details Form",
      "Organization Details",
      "Discovery org details",
      "Discovery: Organization Details",
      "Org details",
      "Org Details Form",
      "Schedule: Workflow Guided Discovery",
      "Workflow Guided Discovery",
      "Schedule Workflow Guided Discovery",
    ],
  },
  {
    slug: "billing-spreadsheet",
    name: "Billing spreadsheet — accepted payers & modifiers",
    kind: "FILE",
    fileName: "Billing-Spreadsheet-Accepted-Payers-Modifiers.md",
    packFileName: "Billing-Spreadsheet-Accepted-Payers-Modifiers.xlsx",
    mimeType: "text/markdown",
    isPlaceholder: true,
    description: "Payer / modifier sheet the practice fills out during Discovery.",
    adminNotes:
      "Replace with the Dock billing spreadsheet (xlsx) via File library or content/template-attachments/. Stays on “Complete & Upload Billing Spreadsheet — Accepted Payers, Modifiers”.",
    visibility: "SHARED",
    attachToTitles: [
      "Complete & Upload Billing Spreadsheet — Accepted Payers, Modifiers",
      "Complete & Upload Billing Spreadsheet",
      "Complete and Upload Billing Spreadsheet — Accepted Payers, Modifiers",
      "Complete and Upload Billing Spreadsheet",
      "Billing Spreadsheet — Accepted Payers, Modifiers",
      "Billing Spreadsheet",
    ],
  },
  {
    slug: "billing-questionnaire",
    name: "Billing questionnaire",
    kind: "FILE",
    fileName: "Billing-Questionnaire.md",
    packFileName: "Billing-Questionnaire.xlsx",
    mimeType: "text/markdown",
    isPlaceholder: true,
    description:
      "Submit the billing questionnaire, then upload the completed files on the Discovery task. Site Configuration reviews the data sheet.",
    adminNotes:
      "Replace with the Dock billing questionnaire (xlsx/pdf/docx). Practice submits the questionnaire and uploads files on Billing Questionnaire; specialists review on Review Billing Questionnaire Data Sheet (Site Configuration).",
    visibility: "SHARED",
    attachToTitles: [
      "Billing Questionnaire",
      "Review Billing Questionnaire Data Sheet",
      "Review Billing Questionnaire",
      "Billing Questionnaire Data Sheet",
    ],
  },
  {
    slug: "clinical-workflows-sheet",
    name: "Clinical workflows data sheet",
    kind: "FILE",
    fileName: "Clinical-Workflows-Data-Sheet.md",
    packFileName: "Clinical-Workflows-Data-Sheet.xlsx",
    mimeType: "text/markdown",
    isPlaceholder: true,
    description: "Clinical workflow capture sheet used in Discovery / configuration.",
    adminNotes: "Replace with the Dock clinical workflows sheet via File library or the content pack.",
    visibility: "SHARED",
    attachToTitles: [
      "Clinical Workflows",
      "Discovery clinical workflows",
      "Clinical workflow form",
      "Review Clinical Workflow Data Sheet",
      "Review Clinical Workflows Data Sheet",
      "Clinical Workflow Data Sheet",
    ],
  },
  {
    slug: "organization-details-form",
    name: "Organization details form",
    kind: "FILE",
    fileName: "Organization-Details-Form.md",
    packFileName: "Organization-Details-Form.xlsx",
    mimeType: "text/markdown",
    isPlaceholder: true,
    description: "Org / division / hours capture form.",
    adminNotes: "Replace with the Dock organization details form if it is a separate file.",
    visibility: "SHARED",
    attachToTitles: [
      "Organization Details Form",
      "Organization Details",
      "Discovery org details",
      "Discovery: Organization Details",
      "Org details",
      "Org Details Form",
    ],
  },
  {
    slug: "rcm-intake-questionnaire",
    name: "RCM intake questionnaire",
    kind: "FILE",
    fileName: "RCM-Intake-Questionnaire.md",
    packFileName: "RCM-Intake-Questionnaire.xlsx",
    mimeType: "text/markdown",
    isPlaceholder: true,
    description: "Intake form for existing-EHR sites adding the RCM track.",
    adminNotes:
      "Replace with the Dock RCM intake questionnaire. Attaches on Complete RCM intake questionnaire.",
    visibility: "SHARED",
    attachToTitles: [
      "Complete RCM intake questionnaire",
      "RCM intake questionnaire",
      "RCM intake",
    ],
  },
];

export function libraryDefsForTaskTitle(title: string): DefaultLibraryDef[] {
  const key = normalizeOverlapTitle(title);
  if (!key) return [];
  return DEFAULT_LIBRARY_ASSETS.filter((a) =>
    a.attachToTitles.some((t) => attachmentTitleMatches(key, t)),
  );
}

export function librarySlugsForTaskTitle(title: string): string[] {
  return libraryDefsForTaskTitle(title).map((a) => a.slug);
}

const TITLE_STOPWORDS = new Set(["and", "the", "a", "an", "of", "to", "for", "or", "if", "in", "on", "at"]);

function significantTokens(normalized: string): string[] {
  return normalized.split(" ").filter((w) => w.length > 0 && !TITLE_STOPWORDS.has(w));
}

/**
 * Exact normalized match, or the shorter significant-token list is a subset
 * of the longer (Dock short titles like "Billing Spreadsheet"). Require two
 * content words so "RCM" or "Forms" does not attach every catalog file.
 */
export function attachmentTitleMatches(liveNormalized: string, catalogTitle: string): boolean {
  const catalog = normalizeOverlapTitle(catalogTitle);
  if (!catalog || !liveNormalized) return false;
  if (liveNormalized === catalog) return true;
  const live = significantTokens(liveNormalized);
  const cat = significantTokens(catalog);
  if (live.length === 0 || cat.length === 0) return false;
  const shorter = live.length <= cat.length ? live : cat;
  const longer = live.length <= cat.length ? cat : live;
  if (shorter.length < 2) return false;
  return shorter.every((t) => longer.includes(t));
}

export function normalizeAttachmentUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
  } catch {
    return url.trim().replace(/\/+$/, "").toLowerCase();
  }
}

/** Host + path only — wizard launch query params are not a different resource. */
export function attachmentUrlIdentity(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.protocol}//${u.host.toLowerCase()}${path}`;
  } catch {
    return url.trim().replace(/\/+$/, "").toLowerCase();
  }
}

export function fileCoversLibraryAsset(
  files: Array<{ libraryAssetId: string | null; kind: string; url: string | null }>,
  lib: { id: string; kind: string; url: string | null },
): boolean {
  if (files.some((f) => f.libraryAssetId === lib.id)) return true;
  if (lib.kind === "LINK" && lib.url) {
    const want = attachmentUrlIdentity(lib.url);
    return files.some(
      (f) => f.kind === "LINK" && f.url && attachmentUrlIdentity(f.url) === want,
    );
  }
  return false;
}

/** True when this task already has the catalog default (clone or equivalent LINK). */
export function alreadyHasLibraryCoverage(
  files: Array<{ libraryAssetId: string | null; kind: string; url: string | null }>,
  def: DefaultLibraryDef,
  lib?: { id: string; kind: string; url: string | null } | null,
): boolean {
  if (lib && fileCoversLibraryAsset(files, lib)) return true;
  const url = def.url ?? lib?.url ?? null;
  if ((def.kind ?? lib?.kind) === "LINK" && url) {
    const want = attachmentUrlIdentity(url);
    return files.some(
      (f) => f.kind === "LINK" && f.url && attachmentUrlIdentity(f.url) === want,
    );
  }
  return false;
}
