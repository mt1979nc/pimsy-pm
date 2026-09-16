/**
 * Client-safe Hand off to Support identifiers and copy.
 * No Postgres, mailer, or env — seed, tests, and the server hook share these.
 */

import { normalizeOverlapTitle } from "@/lib/playbook-meta";

export const SUPPORT_HANDOFF_TASK_TITLE = "Hand off to Support";
export const SUPPORT_HANDOFF_EMAIL = "kori@pimsyehr.com";
export const SUPPORT_HANDOFF_NAME = "Kori Hale";

/** Seeded playbook copy. Staff replace/append outstanding items around this. */
export const SUPPORT_HANDOFF_INSTRUCTIONS =
  "List any outstanding items for Support in this description (implementation logistics only — no patient information). Completing this task emails Kori Hale at kori@pimsyehr.com and marks the site completed / out of implementation.";

export const SUPPORT_HANDOFF_EMPTY_NOTE =
  "No outstanding items listed in the Hand off to Support task description.";

export function isHandOffToSupportTask(title: string | null | undefined): boolean {
  const n = normalizeOverlapTitle(title ?? "");
  return n === "hand off to support" || n === "handoff to support";
}

/**
 * Staff-authored outstanding items. The seeded instruction paragraph is not
 * treated as an outstanding item.
 */
export function outstandingItemsFromDescription(
  description: string | null | undefined,
): string | null {
  const raw = (description ?? "").trim();
  if (!raw) return null;
  if (normalizeOverlapTitle(raw) === normalizeOverlapTitle(SUPPORT_HANDOFF_INSTRUCTIONS)) {
    return null;
  }
  let body = raw;
  if (body.startsWith(SUPPORT_HANDOFF_INSTRUCTIONS)) {
    body = body.slice(SUPPORT_HANDOFF_INSTRUCTIONS.length).trim();
  } else if (body.endsWith(SUPPORT_HANDOFF_INSTRUCTIONS)) {
    body = body.slice(0, body.length - SUPPORT_HANDOFF_INSTRUCTIONS.length).trim();
  }
  return body.length > 0 ? body : null;
}
