/**
 * Dock Implementation **task action buttons** (Dock: Task Actions / button
 * dependencies), ported in-repo.
 *
 * Dock puts a customizable CTA on the checklist row and in the task card.
 * Alexander’s 2026-09-15 report: Discovery org-details shows a blue
 * **Click here** that opens the wizard. That is not a Links & files chip.
 *
 * Kinds we can wire without guessing URLs:
 *   link     — known URL (Discovery Wizard only)
 *   download — playbook library file
 *   upload   — Dock File Request (logos, letterhead, submit documents, …)
 *
 * No Storylane, Inbed, ClaimMD, DrFirst bamboo, or survey URLs are invented.
 */
import {
  DEFAULT_LIBRARY_ASSETS,
  DISCOVERY_WIZARD_URL,
  libraryDefsForTaskTitle,
} from "@/db/dock-default-attachments";
import { normalizeOverlapTitle } from "@/lib/playbook-meta";

export const DOCK_TASK_ACTION_LABEL = "Click here";

export type DockTaskActionKind = "link" | "download" | "upload";

export type DockTaskActionDef = {
  id: string;
  kind: DockTaskActionKind;
  label: string;
  resourceName: string;
  url?: string;
  librarySlug?: string;
};

function n(title: string): string {
  return normalizeOverlapTitle(title);
}

function hasPhrase(normalized: string, phrase: string): boolean {
  return normalized.includes(n(phrase));
}

/** Dock / PATH names for the Organization Details Form (wizard CTA). */
export function isOrganizationDetailsTitle(title: string): boolean {
  const key = n(title);
  if (!key) return false;
  if (hasPhrase(key, "organization details")) return true;
  if (hasPhrase(key, "org details")) return true;
  if (hasPhrase(key, "discovery org") && key.includes("details")) return true;
  return false;
}

export function isClinicalWorkflowsTitle(title: string): boolean {
  if (/^\s*review\b/i.test(title)) return false;
  return hasPhrase(n(title), "clinical workflow");
}

export function isGuidedDiscoveryTitle(title: string): boolean {
  return hasPhrase(n(title), "guided discovery");
}

export function isBillingQuestionnaireTitle(title: string): boolean {
  return hasPhrase(n(title), "billing questionnaire");
}

export function isBillingSpreadsheetTitle(title: string): boolean {
  return hasPhrase(n(title), "billing spreadsheet");
}

export function isRcmIntakeTitle(title: string): boolean {
  const key = n(title);
  return key.includes("rcm") && key.includes("intake");
}

/**
 * Dock File Request tasks: the button opens an upload, not a known URL.
 * Exact / near-exact titles only so staff rows like “Logos” stay clean.
 */
const FILE_REQUEST_TITLES = [
  "Documentation & Forms",
  "Submit Documents",
  "Upload Company Logo(s)",
  "Upload Company Logos",
  "Letterhead",
  "Submit Import Files",
  "Final Data Submission",
];

export function isDockFileRequestTitle(title: string): boolean {
  const key = n(title);
  if (!key) return false;
  return FILE_REQUEST_TITLES.some((t) => n(t) === key);
}

export function isDiscoveryWizardTaskTitle(title: string): boolean {
  if (/^\s*review\b/i.test(title)) return false;
  return (
    isOrganizationDetailsTitle(title) ||
    isClinicalWorkflowsTitle(title) ||
    isGuidedDiscoveryTitle(title)
  );
}

const WIZARD_ACTION: DockTaskActionDef = {
  id: "discovery-wizard",
  kind: "link",
  label: DOCK_TASK_ACTION_LABEL,
  resourceName: "Discovery Wizard",
  url: DISCOVERY_WIZARD_URL,
  librarySlug: "discovery-wizard",
};

function downloadAction(slug: string): DockTaskActionDef | null {
  const def = DEFAULT_LIBRARY_ASSETS.find((a) => a.slug === slug);
  if (!def || (def.kind ?? "FILE") === "LINK") return null;
  return {
    id: slug,
    kind: "download",
    label: DOCK_TASK_ACTION_LABEL,
    resourceName: def.name,
    librarySlug: slug,
  };
}

const UPLOAD_ACTION: DockTaskActionDef = {
  id: "file-request",
  kind: "upload",
  label: DOCK_TASK_ACTION_LABEL,
  resourceName: "Upload files",
};

/**
 * Dock action buttons for a live or template task title.
 *
 * One primary **Click here** per task (Dock’s checklist CTA). Wizard tasks
 * open the Discovery Wizard. Sheet tasks download. File-request tasks upload.
 * Review / specialist titles keep download only (no upload CTA).
 */
export function dockTaskActionsForTitle(title: string): DockTaskActionDef[] {
  if (isDiscoveryWizardTaskTitle(title)) {
    return [WIZARD_ACTION];
  }

  const defs = libraryDefsForTaskTitle(title);
  const slugs = new Set(defs.map((d) => d.slug));
  const reviewOnly = /^\s*review\b/i.test(title);

  if (slugs.has("billing-spreadsheet") || isBillingSpreadsheetTitle(title)) {
    const dl = downloadAction("billing-spreadsheet");
    return dl ? [dl] : [];
  }
  if (slugs.has("billing-questionnaire") || isBillingQuestionnaireTitle(title)) {
    const dl = downloadAction("billing-questionnaire");
    return dl ? [dl] : [];
  }
  if (slugs.has("rcm-intake-questionnaire") || isRcmIntakeTitle(title)) {
    const dl = downloadAction("rcm-intake-questionnaire");
    return dl ? [dl] : [];
  }
  if (slugs.has("clinical-workflows-sheet")) {
    const dl = downloadAction("clinical-workflows-sheet");
    return dl ? [dl] : [];
  }
  if (slugs.has("organization-details-form")) {
    const dl = downloadAction("organization-details-form");
    return dl ? [dl] : [];
  }
  if (isDockFileRequestTitle(title) && !reviewOnly) {
    return [UPLOAD_ACTION];
  }
  return [];
}

export function hasDockTaskAction(title: string): boolean {
  return dockTaskActionsForTitle(title).length > 0;
}
