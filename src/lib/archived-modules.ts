/**
 * PATH rebuild phase 0: hide archived modules without deleting code or tables.
 *
 * PATH_ARCHIVED_MODULES is off unless it is 1, true, yes, or on.
 * Off: the routes below are omitted from navigation and respond 404.
 * On: those routes work again, including the older PATH_DAY_TO_DAY gate.
 *
 * Kept: Prism roster, team, capacity, forecast, analysis, Dock delivery,
 * the /management overview, settings, and sign-in. Bookmarks for
 * /reports/capacity and /reports/analysis still redirect to Prism.
 */

const ON = new Set(["1", "true", "yes", "on"]);

/** Prefixes, matched on the path and any child. */
const ARCHIVED_PREFIXES = [
  "/portal",
  "/learning",
  "/dashboard",
  "/my-work",
  "/inbox",
  "/projects",
  "/customers",
  "/templates",
  "/library",
  "/admin",
  "/updates",
  "/reports",
  "/api/learn",
  "/api/library",
] as const;

/** Exact sections under a prefix we otherwise keep. */
const ARCHIVED_SECTIONS = ["/management/executive", "/management/weekly"] as const;

/**
 * Old report URLs that next.config redirects onto kept Prism pages.
 * They must stay reachable so the redirect can run.
 */
const ARCHIVE_EXCEPTIONS = new Set(["/reports/capacity", "/reports/analysis"]);

export function archivedModulesEnabled(): boolean {
  const raw = (process.env.PATH_ARCHIVED_MODULES ?? "").trim().toLowerCase();
  return ON.has(raw);
}

function normalizePath(pathname: string): string {
  const path = (pathname.split("?")[0] ?? "/").replace(/\/+$/, "") || "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function isArchivedHref(href: string): boolean {
  return isArchivedRequestPath(href);
}

export function isArchivedRequestPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (ARCHIVE_EXCEPTIONS.has(path)) return false;
  if (ARCHIVED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return true;
  }
  return ARCHIVED_SECTIONS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
