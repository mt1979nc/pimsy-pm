/**
 * Staff sidebar sections. Routes stay where they are; this is the grouping
 * and the open/closed memory for the accordion.
 *
 * Roster (`/management/engagements`) stays in `PRISM_NAV` so the Prism tabs
 * still open it. It is not a sidebar item.
 */

import { ADMIN_AREA_HREF, ADMIN_AREA_LABEL, PRISM_NAV } from "@/lib/area-nav";
import { isNavLinkActive } from "@/lib/nav";

export const STAFF_SIDEBAR_OPEN_KEY = "path.sidebar.sections";

/** Deep links still work. The sidebar does not list this destination. */
export const SIDEBAR_HIDDEN_HREFS = ["/management/engagements"] as const;

export const STAFF_SIDEBAR_SECTION_ORDER = ["day-to-day", "analytics", "settings"] as const;

export type StaffSidebarSectionId = (typeof STAFF_SIDEBAR_SECTION_ORDER)[number];

export const STAFF_SIDEBAR_SECTION_LABELS: Record<StaffSidebarSectionId, string> = {
  "day-to-day": "Day-to-day project work",
  analytics: "Data analytics",
  settings: "PATH settings",
};

export type StaffSidebarItem = {
  href: string;
  label: string;
  exact?: boolean;
  badge?: number;
};

export type StaffSidebarSection = {
  id: StaffSidebarSectionId;
  label: string;
  items: StaffSidebarItem[];
};

const HIDDEN = new Set<string>(SIDEBAR_HIDDEN_HREFS);

export function staffSidebarSections(input: {
  unread: number;
  showPortfolio: boolean;
  showTemplates: boolean;
}): StaffSidebarSection[] {
  const dayToDay: StaffSidebarItem[] = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/my-work", label: "My work" },
    { href: "/inbox", label: "Inbox", badge: input.unread },
    { href: "/projects", label: "Projects" },
    { href: "/customers", label: "Customers" },
  ];
  if (input.showPortfolio) {
    dayToDay.push({ href: "/reports/waiting-on", label: "Waiting on" });
  }

  const analytics: StaffSidebarItem[] = input.showPortfolio
    ? [
        { href: "/reports", label: "Portfolio", exact: true },
        { href: ADMIN_AREA_HREF, label: ADMIN_AREA_LABEL },
        ...PRISM_NAV.filter((item) => !HIDDEN.has(item.href)).map((item) => ({
          href: item.href,
          label: item.label,
          exact: item.exact,
        })),
      ]
    : [];

  const settings: StaffSidebarItem[] = [];
  if (input.showTemplates) {
    settings.push(
      { href: "/templates", label: "Templates" },
      { href: "/library", label: "File library" },
    );
  }
  settings.push(
    { href: "/learning", label: "Learning Center" },
    { href: "/updates", label: "What's new" },
    { href: "/settings", label: "Settings" },
  );

  const sections: StaffSidebarSection[] = [
    { id: "day-to-day", label: STAFF_SIDEBAR_SECTION_LABELS["day-to-day"], items: dayToDay },
    { id: "analytics", label: STAFF_SIDEBAR_SECTION_LABELS.analytics, items: analytics },
    { id: "settings", label: STAFF_SIDEBAR_SECTION_LABELS.settings, items: settings },
  ];
  return sections.filter((section) => section.items.length > 0);
}

export function defaultOpenSectionIds(): StaffSidebarSectionId[] {
  return ["day-to-day"];
}

export function parseOpenSectionIds(raw: string | null): StaffSidebarSectionId[] | null {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const ids = parsed.filter(
      (id): id is StaffSidebarSectionId =>
        typeof id === "string" && (STAFF_SIDEBAR_SECTION_ORDER as readonly string[]).includes(id),
    );
    return STAFF_SIDEBAR_SECTION_ORDER.filter((id) => ids.includes(id));
  } catch {
    return null;
  }
}

/** Longest matching href wins, so Waiting on does not light up Portfolio. */
export function sectionIdForPath(
  pathname: string,
  sections: readonly StaffSidebarSection[],
): StaffSidebarSectionId | null {
  let best: { id: StaffSidebarSectionId; href: string } | null = null;
  for (const section of sections) {
    for (const item of section.items) {
      if (!isNavLinkActive(pathname, item.href, item.exact ?? false)) continue;
      if (!best || item.href.length > best.href.length) best = { id: section.id, href: item.href };
    }
  }
  if (best) return best.id;
  const analytics = sections.find((section) => section.id === "analytics");
  if (analytics && (pathname === "/management" || pathname.startsWith("/management/"))) {
    return "analytics";
  }
  return null;
}

/**
 * Persisted choices, plus the section that holds the current page.
 * `null` means nothing stored yet, so Day-to-day starts open.
 * An empty array means the user closed every section.
 */
export function visibleOpenSectionIds(
  persisted: readonly StaffSidebarSectionId[] | null,
  activeSectionId: StaffSidebarSectionId | null,
): StaffSidebarSectionId[] {
  const open = new Set(persisted ?? defaultOpenSectionIds());
  if (activeSectionId) open.add(activeSectionId);
  return STAFF_SIDEBAR_SECTION_ORDER.filter((id) => open.has(id));
}

export function toggleOpenSection(
  visible: readonly StaffSidebarSectionId[],
  id: StaffSidebarSectionId,
): StaffSidebarSectionId[] {
  const next = new Set(visible);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return STAFF_SIDEBAR_SECTION_ORDER.filter((sectionId) => next.has(sectionId));
}
