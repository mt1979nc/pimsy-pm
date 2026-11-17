/**
 * Capacity viewer: one page, no writes.
 * Team capacity is the whole product for this role. Settings, other analytics,
 * and every mutation stay closed. Sign-in, sign-out, and a forced password
 * change stay open so the account can still be used.
 */

export const CAPACITY_VIEWER_ROLE = "CAPACITY_VIEWER";
export const CAPACITY_VIEWER_HOME = "/management/capacity";

export function isCapacityViewerRole(role: string): boolean {
  return role === CAPACITY_VIEWER_ROLE;
}

function normalizePath(pathname: string): string {
  const path = pathname.split("?")[0]?.split("#")[0] ?? "";
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

/** Pages a capacity viewer may open. Everything else redirects home. */
export function capacityViewerRouteDecision(pathname: string): "allow" | "redirect" {
  const path = normalizePath(pathname);
  if (path === CAPACITY_VIEWER_HOME) return "allow";
  if (path === "/change-password") return "allow";
  if (path === "/signin" || path.startsWith("/signin/")) return "allow";
  if (path === "/signout") return "allow";
  if (path.startsWith("/api/auth")) return "allow";
  return "redirect";
}

/** API routes are not the capacity page. Session-backed handlers return 403. */
export function capacityViewerApiForbidden(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path.startsWith("/api/") && !path.startsWith("/api/auth");
}

export function capacityViewerCanMutate(role: string): boolean {
  return !isCapacityViewerRole(role);
}

/** Server actions and other writes. Password change is the one exception. */
export function assertCapacityViewerCannotMutate(role: string): void {
  if (!isCapacityViewerRole(role)) return;
  const error = new Error("Capacity viewers cannot change data.");
  error.name = "ForbiddenError";
  (error as Error & { status: number }).status = 403;
  throw error;
}
