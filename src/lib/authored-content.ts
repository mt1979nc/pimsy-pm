/**
 * Client-safe author/admin gate for comments, updates, and risks.
 * Do not import `@/db` from here.
 */

const ADMIN_ROLES = new Set(["OWNER", "ADMIN"]);

/** Author, or OWNER/ADMIN. Covering specialists cannot rewrite someone else’s note. */
export function canEditAuthoredRecord(
  actor: { id: string; role: string },
  authorId: string | null | undefined,
) {
  if (authorId && actor.id === authorId) return true;
  return ADMIN_ROLES.has(actor.role);
}
