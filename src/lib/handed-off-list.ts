/**
 * Customers and Projects lists hide a site only after Hand off to Support.
 *
 * The stamp is `project.supportHandoffAt`. Customer LIVE, CEO LIVE, go-live
 * dates, and the Onboarded checkbox are not this signal — a site stays on
 * the list through the post-go-live window until Support actually takes it.
 */

export function isSupportHandedOff(
  supportHandoffAt: Date | string | null | undefined,
): boolean {
  return supportHandoffAt != null && supportHandoffAt !== "";
}

/**
 * Hide the customer card when every non-cancelled project has been handed
 * off. A still-open project (including one already at go-live) keeps the
 * practice on the list. No projects, or only cancelled projects, stays visible.
 */
export function customerHandedOffToSupport(
  projects: readonly {
    status: string;
    supportHandoffAt: Date | string | null | undefined;
  }[],
): boolean {
  const relevant = projects.filter((project) => project.status !== "CANCELLED");
  if (relevant.length === 0) return false;
  return relevant.every((project) => isSupportHandedOff(project.supportHandoffAt));
}
