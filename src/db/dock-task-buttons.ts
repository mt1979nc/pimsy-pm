/**
 * Dock Implementation **task action buttons** (Dock: Task Actions / button
 * dependencies), ported from live PWMI (Project Wellness) Workflow Guided
 * Discovery → Discovery on 2026-09-15.
 *
 * Dock puts a customizable CTA on the checklist row and in the task card
 * Action slot. Labels below are copied from that workspace — not guessed.
 *
 * Destinations we can wire without inventing URLs:
 *   link     — Organization Details Form / Guided Discovery → Discovery Wizard
 *   form     — Clinical Workflow / Billing Questionnaire / Documentation
 *              “Open form” (Dock native forms have no public URL in this repo;
 *              PATH uses the playbook sheet when present)
 *   upload   — Dock File Request (“Upload files”)
 *
 * No Storylane, Inbed, ClaimMD, DrFirst bamboo, or survey URLs are invented.
 */
import {
  DEFAULT_LIBRARY_ASSETS,
  DISCOVERY_WIZARD_URL,
  PIMSY_DESKTOP_INSTALL_URL,
  libraryDefsForTaskTitle,
} from "@/db/dock-default-attachments";
import { ZENDESK_AGENT_SEARCH } from "@/lib/zendesk";
import { normalizeOverlapTitle } from "@/lib/playbook-meta";
import { LIVE_SITE_ATTACHMENT_NAME, LIVE_SITE_OPEN_LABEL } from "@/lib/accessing-pimsy";

/** Dock PWMI Organization Details Form Action label (capital H). */
export const DOCK_TASK_ACTION_LABEL = "Click Here";

export const DOCK_CLINICAL_FORM_LABEL = "Click Here to Submit Clinical Workflow Form";
export const DOCK_BILLING_QUESTIONNAIRE_LABEL = "Click Here to Submit Billing Questionnaire";
export const DOCK_UPLOAD_FILES_LABEL = "Upload files";
export const DOCK_OPEN_FORM_LABEL = "Open form";

export type DockTaskActionKind = "link" | "form" | "download" | "upload";

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

function isReviewTitle(title: string): boolean {
  return /^\s*review\b/i.test(title);
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
  if (isReviewTitle(title)) return false;
  return hasPhrase(n(title), "clinical workflow");
}

export function isGuidedDiscoveryTitle(title: string): boolean {
  return hasPhrase(n(title), "guided discovery");
}

export function isBillingQuestionnaireTitle(title: string): boolean {
  if (isReviewTitle(title)) return false;
  return hasPhrase(n(title), "billing questionnaire");
}

export function isBillingSpreadsheetTitle(title: string): boolean {
  return hasPhrase(n(title), "billing spreadsheet");
}

export function isRcmIntakeTitle(title: string): boolean {
  const key = n(title);
  return key.includes("rcm") && key.includes("intake");
}

export function isDocumentationAndFormsTitle(title: string): boolean {
  const key = n(title);
  return key === n("Documentation & Forms") || key === n("Documentation and Forms");
}

/**
 * Dock File Request tasks: blue **Upload files** (PWMI: spreadsheet, logos,
 * letterhead, submit documents). Exact / near-exact titles so staff “Logos”
 * stays clean.
 */
const FILE_REQUEST_TITLES = [
  "Submit Documents",
  "Upload Company Logo(s)",
  "Upload Company Logos",
  "Letterhead",
  "Submit Import Files",
  "Final Data Submission",
];

export function isDockFileRequestTitle(title: string): boolean {
  if (isBillingSpreadsheetTitle(title) && !isReviewTitle(title)) return true;
  const key = n(title);
  if (!key) return false;
  return FILE_REQUEST_TITLES.some((t) => n(t) === key);
}

/** Wizard Click Here — org-details and Guided Discovery only (PWMI). */
export function isDiscoveryWizardTaskTitle(title: string): boolean {
  if (isReviewTitle(title)) return false;
  return isOrganizationDetailsTitle(title) || isGuidedDiscoveryTitle(title);
}

export function isZendeskCompanySetupTitle(title: string): boolean {
  const key = n(title);
  return key.includes("zendesk") && key.includes("company") && key.includes("setup");
}

export function isZendeskUsersToOrgTitle(title: string): boolean {
  const key = n(title);
  return key.includes("zendesk") && key.includes("users") && key.includes("org");
}

export function isAccessingPimsyTitle(title: string): boolean {
  const key = n(title);
  return key === n("Accessing Pimsy") || key === n("Accessing PIMSY") || key === n("Access Pimsy");
}

export const DOCK_ZENDESK_OPEN_LABEL = "Open Zendesk";
export const DOCK_DESKTOP_INSTALL_LABEL = "Install desktop app";
export const DOCK_BOOKMARK_LABEL = LIVE_SITE_OPEN_LABEL;

const WIZARD_ACTION: DockTaskActionDef = {
  id: "discovery-wizard",
  kind: "link",
  label: DOCK_TASK_ACTION_LABEL,
  resourceName: "Discovery Wizard",
  url: DISCOVERY_WIZARD_URL,
  librarySlug: "discovery-wizard",
};

const CLINICAL_FORM_ACTION: DockTaskActionDef = {
  id: "clinical-workflow-form",
  kind: "form",
  label: DOCK_CLINICAL_FORM_LABEL,
  resourceName: "Clinical Workflow Form",
  librarySlug: "clinical-workflows-sheet",
};

const BILLING_QUESTIONNAIRE_FORM_ACTION: DockTaskActionDef = {
  id: "billing-questionnaire-form",
  kind: "form",
  label: DOCK_BILLING_QUESTIONNAIRE_LABEL,
  resourceName: "Billing Questionnaire",
  librarySlug: "billing-questionnaire",
};

const OPEN_FORM_ACTION: DockTaskActionDef = {
  id: "open-form",
  kind: "form",
  label: DOCK_OPEN_FORM_LABEL,
  resourceName: "Form",
};

const UPLOAD_ACTION: DockTaskActionDef = {
  id: "file-request",
  kind: "upload",
  label: DOCK_UPLOAD_FILES_LABEL,
  resourceName: "Upload files",
};

const ZENDESK_ORG_ACTION: DockTaskActionDef = {
  id: "zendesk-org-setup",
  kind: "link",
  label: DOCK_ZENDESK_OPEN_LABEL,
  resourceName: "Zendesk organization search",
  url: ZENDESK_AGENT_SEARCH,
};

const ZENDESK_USERS_ACTION: DockTaskActionDef = {
  id: "zendesk-users-org",
  kind: "link",
  label: DOCK_ZENDESK_OPEN_LABEL,
  resourceName: "Zendesk user / email search",
  url: ZENDESK_AGENT_SEARCH,
};

const DESKTOP_INSTALL_ACTION: DockTaskActionDef = {
  id: "pimsy-desktop-install",
  kind: "link",
  label: DOCK_DESKTOP_INSTALL_LABEL,
  resourceName: "PIMSY desktop application",
  url: PIMSY_DESKTOP_INSTALL_URL,
  librarySlug: "pimsy-desktop-install",
};

const BOOKMARK_ACTION: DockTaskActionDef = {
  id: "pimsy-bookmark",
  kind: "link",
  label: DOCK_BOOKMARK_LABEL,
  resourceName: LIVE_SITE_ATTACHMENT_NAME,
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

/**
 * Dock action buttons for a live or template task title (PWMI Discovery).
 * One primary CTA per most tasks; Accessing Pimsy may also show a bookmark
 * when that URL exists. Review / specialist titles stay download-only.
 */
export function dockTaskActionsForTitle(title: string): DockTaskActionDef[] {
  if (isZendeskCompanySetupTitle(title)) {
    return [ZENDESK_ORG_ACTION];
  }
  if (isZendeskUsersToOrgTitle(title)) {
    return [ZENDESK_USERS_ACTION];
  }
  if (isAccessingPimsyTitle(title)) {
    return [DESKTOP_INSTALL_ACTION, BOOKMARK_ACTION];
  }
  if (isDiscoveryWizardTaskTitle(title)) {
    return [WIZARD_ACTION];
  }
  if (isClinicalWorkflowsTitle(title)) {
    return [CLINICAL_FORM_ACTION];
  }
  if (isBillingQuestionnaireTitle(title)) {
    return [BILLING_QUESTIONNAIRE_FORM_ACTION];
  }
  if (isDocumentationAndFormsTitle(title)) {
    return [OPEN_FORM_ACTION];
  }
  if (isDockFileRequestTitle(title)) {
    return [UPLOAD_ACTION];
  }

  const defs = libraryDefsForTaskTitle(title);
  const slugs = new Set(defs.map((d) => d.slug));

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
  if (slugs.has("billing-questionnaire")) {
    const dl = downloadAction("billing-questionnaire");
    return dl ? [dl] : [];
  }
  return [];
}

export function hasDockTaskAction(title: string): boolean {
  return dockTaskActionsForTitle(title).length > 0;
}
