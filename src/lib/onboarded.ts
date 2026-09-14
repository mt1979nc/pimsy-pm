/**
 * PATH-native Onboarded flag.
 *
 * Staff mark a site Onboarded on project About. Overview overdue / upcoming-due
 * lists then skip that site's tasks. The project hub still shows every task.
 * Default is not onboarded.
 */

export function projectIsOnboarded(
  project: { onboarded?: boolean | null } | null | undefined,
): boolean {
  return Boolean(project?.onboarded);
}

/** Drop onboarded sites from project-level overview lists (Needs Attention). */
export function excludeOnboardedProjects<T extends { onboarded?: boolean | null }>(rows: T[]): T[] {
  return rows.filter((row) => !projectIsOnboarded(row));
}

/** Drop tasks whose project is onboarded from overdue / upcoming-due rollups. */
export function excludeOnboardedProjectTasks<
  T extends { project?: { onboarded?: boolean | null } | null },
>(rows: T[]): T[] {
  return rows.filter((row) => !projectIsOnboarded(row.project));
}

/**
 * Dashboard "due within a week" window: overdue counts as due-soon, matching
 * the existing dashboard filter (`delta days < withinDays`).
 */
export function isOverviewUpcomingDue(
  dueDate: Date | string | null | undefined,
  withinDays = 7,
): boolean {
  if (!dueDate) return false;
  const days = (new Date(dueDate).getTime() - Date.now()) / 86_400_000;
  return days < withinDays;
}
