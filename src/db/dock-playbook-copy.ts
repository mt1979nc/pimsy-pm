/**
 * Dock Implementation template copy that PATH playbooks should mirror.
 *
 * Dock stores training “areas to cover” as checkbox lines in the task
 * description. PATH also promotes those to first-class checklist items.
 * Discovery Wizard / billing sheets are **clickable buttons on the task**
 * (LINK / FILE attachments), not description URLs. Customer upload-request
 * tasks also spell out download → complete → upload.
 *
 * There is no live Dock API in this repo. This catalog is the in-repo port
 * (2026-08-21 titles + 2026-09-14 THS/training/attachment inventory).
 * Do not invent PHI or guessed Storylane URLs.
 */
import { libraryDefsForTaskTitle } from "@/db/dock-default-attachments";
import {
  TRAINING_SESSION_DESCRIPTION,
  TRAINING_STORYLANE_DESCRIPTION,
  trainingDescriptionForTitle,
} from "@/db/dock-training-checklists";
import { isCustomerUploadRequestTitle } from "@/lib/playbook-resources";

export function isBlankDescription(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

const STALE_TRAINING_BLURBS = new Set(
  [
    TRAINING_SESSION_DESCRIPTION,
    `${TRAINING_SESSION_DESCRIPTION}\n\n${TRAINING_STORYLANE_DESCRIPTION}`,
  ].map((s) => s.trim()),
);

/** Short v1.13 blurbs replaced by download → complete → upload / Open-button copy. */
const STALE_ATTACHMENT_BLURBS = new Set(
  [
    "Complete and upload the attached billing spreadsheet (accepted payers and modifiers).",
    "Complete the attached billing questionnaire and upload the finished files on this task.",
    "Complete the attached clinical workflows data sheet. The Discovery Wizard link is also on this task when it applies.",
    "Complete the attached organization details form. The Discovery Wizard link is also on this task when it applies.",
    "Complete the attached RCM intake questionnaire.",
    "Complete the attached Discovery Wizard (live link under Links & files). Do not paste the URL into this description.",
  ].map((s) => s.trim()),
);

/**
 * Fill empty / stale Dock-catalog blurbs. Never overwrite staff-authored notes.
 */
export function shouldReplacePlaybookDescription(
  current: string | null | undefined,
  next: string | null | undefined,
): boolean {
  const incoming = (next ?? "").trim();
  if (!incoming) return false;
  const cur = (current ?? "").trim();
  if (!cur) return true;
  if (cur === incoming) return false;
  if (STALE_TRAINING_BLURBS.has(cur)) return true;
  if (STALE_ATTACHMENT_BLURBS.has(cur)) return true;
  if (cur.startsWith("Use the attached file(s):")) return true;
  return false;
}

const WIZARD_BUTTON_NOTE =
  "Open the Discovery Wizard with the button on this task (not a URL in this description).";

function uploadRequestCopy(fileLabel: string, stepTwo: string, withWizard: boolean): string {
  const body = [
    `1. Download the ${fileLabel} with the button on this task.`,
    `2. ${stepTwo}`,
    "3. Upload the completed file back on this task.",
  ].join("\n");
  return withWizard ? `${body}\n\n${WIZARD_BUTTON_NOTE}` : body;
}

function attachmentTaskDescription(title: string): string | null {
  const defs = libraryDefsForTaskTitle(title);
  if (defs.length === 0) return null;
  const slugs = new Set(defs.map((d) => d.slug));
  const upload = isCustomerUploadRequestTitle(title);
  const withWizard = slugs.has("discovery-wizard");

  if (slugs.has("billing-spreadsheet")) {
    return upload
      ? uploadRequestCopy("billing spreadsheet", "Fill in accepted payers and modifiers.", withWizard)
      : "Download the billing spreadsheet with the button on this task to review what the practice submitted.";
  }
  if (slugs.has("billing-questionnaire")) {
    return upload
      ? uploadRequestCopy("billing questionnaire", "Complete it.", withWizard)
      : "Download the billing questionnaire with the button on this task to review what the practice submitted.";
  }
  if (slugs.has("clinical-workflows-sheet")) {
    return upload
      ? uploadRequestCopy("clinical workflows data sheet", "Complete it.", withWizard)
      : "Download the clinical workflows data sheet with the button on this task to review what the practice submitted.";
  }
  if (slugs.has("organization-details-form")) {
    return upload
      ? uploadRequestCopy("organization details form", "Complete it.", withWizard)
      : "Download the organization details form with the button on this task to review what the practice submitted.";
  }
  if (slugs.has("rcm-intake-questionnaire")) {
    return upload
      ? uploadRequestCopy("RCM intake questionnaire", "Complete it.", withWizard)
      : "Download the RCM intake questionnaire with the button on this task to review what the practice submitted.";
  }
  if (slugs.has("discovery-wizard")) {
    return `${WIZARD_BUTTON_NOTE} Complete it there.`;
  }
  return `Use the button(s) on this task: ${defs.map((d) => d.name).join("; ")}.`;
}

/** Dock playbook description for a task title, or null when Dock has none. */
export function dockPlaybookDescriptionForTitle(title: string): string | null {
  return trainingDescriptionForTitle(title) ?? attachmentTaskDescription(title);
}
