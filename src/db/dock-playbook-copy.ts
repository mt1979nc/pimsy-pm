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
  DOCK_BILLING_QUESTIONNAIRE_LABEL,
  DOCK_CLINICAL_FORM_LABEL,
  DOCK_OPEN_FORM_LABEL,
  DOCK_TASK_ACTION_LABEL,
  DOCK_UPLOAD_FILES_LABEL,
  isBillingQuestionnaireTitle,
  isClinicalWorkflowsTitle,
  isDockFileRequestTitle,
  isDocumentationAndFormsTitle,
  isOrganizationDetailsTitle,
} from "@/db/dock-task-buttons";
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

/** Short v1.13 blurbs replaced by download → complete → upload / Click here copy. */
const STALE_ATTACHMENT_BLURBS = new Set(
  [
    "Complete and upload the attached billing spreadsheet (accepted payers and modifiers).",
    "Complete the attached billing questionnaire and upload the finished files on this task.",
    "Complete the attached clinical workflows data sheet. The Discovery Wizard link is also on this task when it applies.",
    "Complete the attached organization details form. The Discovery Wizard link is also on this task when it applies.",
    "Complete the attached RCM intake questionnaire.",
    "Complete the attached Discovery Wizard (live link under Links & files). Do not paste the URL into this description.",
    "Open the Discovery Wizard with the button on this task (not a URL in this description).",
    "Open the Discovery Wizard with the button on this task (not a URL in this description). Complete it there.",
    "1. Download the billing spreadsheet with the button on this task.\n2. Fill in accepted payers and modifiers.\n3. Upload the completed file back on this task.",
    "1. Download the billing questionnaire with the button on this task.\n2. Complete it.\n3. Upload the completed file back on this task.",
    "1. Download the clinical workflows data sheet with the button on this task.\n2. Complete it.\n3. Upload the completed file back on this task.\n\nOpen the Discovery Wizard with the button on this task (not a URL in this description).",
    "1. Download the organization details form with the button on this task.\n2. Complete it.\n3. Upload the completed file back on this task.\n\nOpen the Discovery Wizard with the button on this task (not a URL in this description).",
    "1. Download the RCM intake questionnaire with the button on this task.\n2. Complete it.\n3. Upload the completed file back on this task.",
    "Download the billing spreadsheet with the button on this task to review what the practice submitted.",
    "Download the billing questionnaire with the button on this task to review what the practice submitted.",
    "Download the clinical workflows data sheet with the button on this task to review what the practice submitted.",
    "Download the organization details form with the button on this task to review what the practice submitted.",
    "Download the RCM intake questionnaire with the button on this task to review what the practice submitted.",
    "Click here on this task to open the Discovery Wizard (not a URL in this description).",
    "Click here on this task to open the Discovery Wizard (not a URL in this description). Complete it there.",
    "Click here on this task to open the Discovery Wizard (not a URL in this description). Complete the practice sections there, then upload any working copy back on this task.",
    "Click here to upload the requested file(s) on this task.",
    "1. Click here to download the billing spreadsheet.\n2. Fill in accepted payers and modifiers.\n3. Upload the completed file back on this task.",
    "1. Click here to download the billing questionnaire.\n2. Complete it.\n3. Upload the completed file back on this task.",
    "1. Click here to download the clinical workflows data sheet.\n2. Complete it.\n3. Upload the completed file back on this task.",
    "1. Click here to download the organization details form.\n2. Complete it.\n3. Upload the completed file back on this task.",
    "1. Click here to download the RCM intake questionnaire.\n2. Complete it.\n3. Upload the completed file back on this task.",
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
  if (cur.startsWith("Open the Discovery Wizard with the button")) return true;
  if (cur.includes("with the button on this task")) return true;
  if (/^Click [Hh]ere on this task to open the Discovery Wizard/.test(cur)) return true;
  return false;
}

const WIZARD_BUTTON_NOTE = `${DOCK_TASK_ACTION_LABEL} on this task to open the Discovery Wizard (not a URL in this description).`;

const CLINICAL_FORM_NOTE = `${DOCK_CLINICAL_FORM_LABEL} on this task. Dock’s native Clinical Workflow Form has no public URL in PATH; the playbook sheet opens when attached. Upload any working copy back on this task.`;

const BILLING_QUESTIONNAIRE_FORM_NOTE = `${DOCK_BILLING_QUESTIONNAIRE_LABEL} on this task. Dock’s native Billing Questionnaire form has no public URL in PATH; the playbook questionnaire opens when attached. Upload any working copy back on this task.`;

const DOCUMENTATION_OPEN_FORM_NOTE = `${DOCK_OPEN_FORM_LABEL} on this task. Dock’s native Documentation & Forms form has no public URL in PATH.`;

function uploadRequestCopy(fileLabel: string, stepTwo: string): string {
  return [
    `1. ${DOCK_TASK_ACTION_LABEL} to download the ${fileLabel}.`,
    `2. ${stepTwo}`,
    "3. Upload the completed file back on this task.",
  ].join("\n");
}

function fileRequestDescription(title: string): string | null {
  if (!isDockFileRequestTitle(title)) return null;
  if (/billing spreadsheet/i.test(title)) {
    return `${DOCK_UPLOAD_FILES_LABEL} on this task to submit the completed billing spreadsheet (accepted payers and modifiers). A template is in Links & files when attached.`;
  }
  return `${DOCK_UPLOAD_FILES_LABEL} on this task to submit the requested file(s).`;
}

function attachmentTaskDescription(title: string): string | null {
  if (isDocumentationAndFormsTitle(title)) return DOCUMENTATION_OPEN_FORM_NOTE;
  const fileRequest = fileRequestDescription(title);
  const defs = libraryDefsForTaskTitle(title);
  if (defs.length === 0) return fileRequest;
  const slugs = new Set(defs.map((d) => d.slug));
  const upload = isCustomerUploadRequestTitle(title);

  if (
    (isOrganizationDetailsTitle(title) || slugs.has("discovery-wizard")) &&
    !isClinicalWorkflowsTitle(title) &&
    !isBillingQuestionnaireTitle(title)
  ) {
    return `${WIZARD_BUTTON_NOTE} Complete the practice sections there.`;
  }

  if (isClinicalWorkflowsTitle(title) || slugs.has("clinical-workflows-sheet")) {
    return upload ? CLINICAL_FORM_NOTE : "Click Here to download the clinical workflows data sheet and review what the practice submitted.";
  }

  if (slugs.has("billing-spreadsheet")) {
    return upload
      ? fileRequest ??
        `${DOCK_UPLOAD_FILES_LABEL} on this task to submit the completed billing spreadsheet (accepted payers and modifiers). A template is in Links & files when attached.`
      : "Click Here to download the billing spreadsheet and review what the practice submitted.";
  }
  if (isBillingQuestionnaireTitle(title) || slugs.has("billing-questionnaire")) {
    return upload
      ? BILLING_QUESTIONNAIRE_FORM_NOTE
      : "Click Here to download the billing questionnaire and review what the practice submitted.";
  }
  if (slugs.has("organization-details-form")) {
    return upload
      ? uploadRequestCopy("organization details form", "Complete it.")
      : "Click Here to download the organization details form and review what the practice submitted.";
  }
  if (slugs.has("rcm-intake-questionnaire")) {
    return upload
      ? uploadRequestCopy("RCM intake questionnaire", "Complete it.")
      : "Click Here to download the RCM intake questionnaire and review what the practice submitted.";
  }
  return fileRequest ?? `Use the button(s) on this task: ${defs.map((d) => d.name).join("; ")}.`;
}

/** Dock playbook description for a task title, or null when Dock has none. */
export function dockPlaybookDescriptionForTitle(title: string): string | null {
  return trainingDescriptionForTitle(title) ?? attachmentTaskDescription(title);
}
