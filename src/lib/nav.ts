/**
 * Sidebar active-state matching. `/reports` is a prefix of `/reports/waiting-on`
 * (and capacity / analysis), so Portfolio must use exact matching or both
 * Leadership items light up and Waiting-on looks like a no-op.
 */
export function isNavLinkActive(pathname: string, href: string, exact = false): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
