import { SubNavLink } from "@/components/nav-link";
import { PRISM_NAV } from "@/lib/area-nav";

/** Prism tabs. Items come from `PRISM_NAV` — the same list as the sidebar. */
export function PrismNav() {
  return (
    <nav aria-label="Prism" className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-border">
      {PRISM_NAV.map((item) => (
        <SubNavLink key={item.href} href={item.href} match={item.match ?? "exact"}>
          {item.label}
        </SubNavLink>
      ))}
    </nav>
  );
}
