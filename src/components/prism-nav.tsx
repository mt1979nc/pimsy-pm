import { SubNavLink } from "@/components/nav-link";

/**
 * One Prism tab strip, shared by /management and the report pages that sit
 * beside it (team capacity, analysis) so those destinations stay one click
 * apart.
 */
export function PrismNav() {
  return (
    <nav aria-label="Prism" className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-border">
      <SubNavLink href="/management">Overview</SubNavLink>
      <SubNavLink href="/management/weekly">Weekly meeting</SubNavLink>
      <SubNavLink href="/management/forecast">Forecast</SubNavLink>
      <SubNavLink href="/reports/capacity">Team capacity</SubNavLink>
      <SubNavLink href="/management/team">Team</SubNavLink>
      <SubNavLink href="/management/engagements" match="prefix">
        Engagements
      </SubNavLink>
      <SubNavLink href="/reports/analysis">Analysis</SubNavLink>
    </nav>
  );
}
