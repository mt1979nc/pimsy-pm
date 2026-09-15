/**
 * Dock Implementation template copy that PATH playbooks should mirror.
 *
 * Dock stores training “areas to cover” as checkbox lines in the task
 * description. PATH also promotes those to first-class checklist items.
 * Discovery Wizard / billing sheets are **attachments**, not description URLs.
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

export function isBlankDescription(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

const STALE_TRAINING_BLURBS = new Set(
  [
    TRAINING_SESSION_DESCRIPTION,
    `${TRAINING_SESSION_DESCRIPTION}\n\n${TRAINING_STORYLANE_DESCRIPTION}`,
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
  return false;
}

function attachmentTaskDescription(title: string): string | null {
  const defs = libraryDefsForTaskTitle(title);
  if (defs.length === 0) return null;
  const slugs = new Set(defs.map((d) => d.slug));
  if (slugs.has("billing-spreadsheet")) {
    return "Complete and upload the attached billing spreadsheet (accepted payers and modifiers).";
  }
  if (slugs.has("billing-questionnaire")) {
    return "Complete the attached billing questionnaire and upload the finished files on this task.";
  }
  if (slugs.has("clinical-workflows-sheet")) {
    return "Complete the attached clinical workflows data sheet. The Discovery Wizard link is also on this task when it applies.";
  }
  if (slugs.has("organization-details-form")) {
    return "Complete the attached organization details form. The Discovery Wizard link is also on this task when it applies.";
  }
  if (slugs.has("rcm-intake-questionnaire")) {
    return "Complete the attached RCM intake questionnaire.";
  }
  if (slugs.has("discovery-wizard")) {
    return "Complete the attached Discovery Wizard (live link under Links & files). Do not paste the URL into this description.";
  }
  return `Use the attached file(s): ${defs.map((d) => d.name).join("; ")}.`;
}

/** Dock playbook description for a task title, or null when Dock has none. */
export function dockPlaybookDescriptionForTitle(title: string): string | null {
  return trainingDescriptionForTitle(title) ?? attachmentTaskDescription(title);
}
