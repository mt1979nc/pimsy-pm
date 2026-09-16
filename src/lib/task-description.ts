/**
 * Display-time Dock playbook descriptions.
 *
 * Live WIP often has a blank description even when the template catalog has
 * copy. Resolve by title so staff and portal lists stay Dock-complete without
 * a live-project resync. Staff-authored notes always win over catalog copy.
 */
import {
  dockPlaybookDescriptionForTitle,
  isBlankDescription,
  shouldReplacePlaybookDescription,
} from "@/db/dock-playbook-copy";
import {
  parseChecklistFromDescription,
  stripChecklistMarkdown,
} from "@/db/dock-training-checklists";

export { stripChecklistMarkdown } from "@/db/dock-training-checklists";

/**
 * Description to show on a live task. Catalog fills blanks and stale
 * playbook blurbs. Optional strip of `- [ ]` lines when checkboxes are
 * rendered separately.
 */
export function resolveTaskDescription(
  title: string,
  stored: string | null | undefined,
  opts?: { stripChecklist?: boolean },
): string | null {
  const catalog = dockPlaybookDescriptionForTitle(title);
  let text: string | null = null;
  if (catalog && (isBlankDescription(stored) || shouldReplacePlaybookDescription(stored, catalog))) {
    text = catalog;
  } else if (!isBlankDescription(stored)) {
    text = stored!.trim();
  } else {
    text = catalog;
  }
  if (!text) return null;
  if (opts?.stripChecklist && parseChecklistFromDescription(text).length > 0) {
    const stripped = stripChecklistMarkdown(text);
    return stripped.length > 0 ? stripped : null;
  }
  return text;
}

export function descriptionSnippet(text: string | null | undefined, max = 160): string | null {
  if (!text) return null;
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (!oneLine) return null;
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1).trimEnd()}…`;
}
