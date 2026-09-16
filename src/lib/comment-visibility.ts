/**
 * Client-safe comment visibility rules.
 * Do not import `@/db` from here — customer surfaces and tests share this.
 */

export type CommentVisibility = "INTERNAL" | "SHARED";

export type CommentVisibilityFields = {
  visibility: CommentVisibility;
  deletedAt?: Date | string | null;
};

/** Customers (and Customer view) see only live SHARED comments. */
export function isCustomerVisibleComment(comment: CommentVisibilityFields): boolean {
  return comment.visibility === "SHARED" && !comment.deletedAt;
}

export function commentsForCustomerSurface<T extends CommentVisibilityFields>(comments: T[]): T[] {
  return comments.filter(isCustomerVisibleComment);
}

/** Staff see SHARED and INTERNAL comments; soft-deleted rows stay hidden. */
export function commentsForStaffSurface<T extends CommentVisibilityFields>(comments: T[]): T[] {
  return comments.filter((c) => !c.deletedAt);
}
