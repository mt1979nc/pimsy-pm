/**
 * Day-to-day project work: the dashboard queue, My work, Inbox, Projects,
 * Customers, Waiting on, and task tracking.
 *
 * Hidden unless PATH_DAY_TO_DAY is 1, true, yes, or on. Those routes are also
 * behind PATH_ARCHIVED_MODULES (see archived-modules.ts). Analytics pages that
 * were not archived stay either way.
 *
 * Portfolio landing matches canSeePortfolio (OWNER, ADMIN, MANAGER).
 */

import { archivedModulesEnabled } from "@/lib/archived-modules";

const PORTFOLIO_ROLES = new Set(["OWNER", "ADMIN", "MANAGER"]);

/** Admin tabs that are the project and customer directories. */
export const DAY_TO_DAY_ADMIN_HREFS = ["/admin/projects", "/admin/customers"] as const;

export function dayToDayEnabled(): boolean {
  const raw = (process.env.PATH_DAY_TO_DAY ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/**
 * Where staff land. Customers stay on the portal when that module is restored.
 * While archives are off, Portfolio (`/reports`) is hidden, so leadership lands
 * on the Prism overview. Day-to-day (`/dashboard`) is only the home when both
 * PATH_ARCHIVED_MODULES and PATH_DAY_TO_DAY are on.
 */
export function staffHomeHref(role: string): string {
  if (!archivedModulesEnabled()) {
    if (PORTFOLIO_ROLES.has(role)) return "/management";
    return "/settings";
  }
  if (dayToDayEnabled()) return "/dashboard";
  if (PORTFOLIO_ROLES.has(role)) return "/reports";
  return "/settings";
}

export function adminNavFor<T extends { href: string; adminOnly?: boolean }>(
  items: readonly T[],
  opts: { isAdmin: boolean; showDayToDay: boolean },
): T[] {
  return items.filter((item) => {
    if (item.adminOnly && !opts.isAdmin) return false;
    if (!opts.showDayToDay && (DAY_TO_DAY_ADMIN_HREFS as readonly string[]).includes(item.href)) {
      return false;
    }
    return true;
  });
}
