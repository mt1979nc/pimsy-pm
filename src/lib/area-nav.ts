/**
 * Leadership navigation, one list per area.
 *
 * Implementation Dashboard (`/admin`) is the directory: projects, customers,
 * people, alerts. The sidebar uses that name so the entry reads as an overview,
 * not a settings page.
 * Prism (`/management`) is capacity, forecast, and site health.
 * The URLs stay. The labels are what keep the two areas apart — do not call
 * either of them Management.
 */

export type AreaNavItem = {
  href: string;
  label: string;
  /** Sidebar: highlight only this path, not its children. */
  exact?: boolean;
  /** Tabs: prefix keeps Roster lit on a single site. */
  match?: "exact" | "prefix";
  /** OWNER and ADMIN only. Managers still see the rest of Admin. */
  adminOnly?: boolean;
};

export const ADMIN_AREA_LABEL = "Implementation Dashboard";
export const ADMIN_AREA_HREF = "/admin";

export const ADMIN_NAV: AreaNavItem[] = [
  { href: "/admin", label: "Overview", exact: true, match: "exact" },
  { href: "/admin/projects", label: "All projects", match: "exact" },
  { href: "/admin/customers", label: "All customers", match: "exact" },
  { href: "/admin/users", label: "People", match: "exact", adminOnly: true },
  { href: "/admin/alerts", label: "Alerts", match: "exact", adminOnly: true },
];

export const PRISM_NAV: AreaNavItem[] = [
  { href: "/management", label: "Overview", exact: true, match: "exact" },
  { href: "/management/executive", label: "Executive", match: "exact" },
  { href: "/management/weekly", label: "Weekly meeting", match: "exact" },
  { href: "/management/forecast", label: "Forecast", match: "exact" },
  { href: "/management/capacity", label: "Team capacity", match: "exact" },
  { href: "/management/team", label: "Team", match: "exact" },
  { href: "/management/engagements", label: "Roster", match: "prefix" },
  { href: "/management/analysis", label: "Analysis", match: "exact" },
];

/** Bookmarks on the old report URLs still open the Prism pages. */
export const LEGACY_PRISM_REDIRECTS = [
  { source: "/reports/capacity", destination: "/management/capacity" },
  { source: "/reports/analysis", destination: "/management/analysis" },
] as const;
