import { SubNavLink } from "@/components/nav-link";
import { PRISM_NAV } from "@/lib/area-nav";

/** Prism tabs. Items come from `PRISM_NAV`. The sidebar omits Roster. */
export function PrismNav() {
  return (
    <nav aria-label="Prism" className="mb-5 flex min-w-0 flex-wrap items-end gap-x-5 gap-y-1 border-b border-border">
      {PRISM_NAV.map((item) => (
        <SubNavLink key={item.href} href={item.href} match={item.match ?? "exact"}>
          {item.label}
        </SubNavLink>
      ))}
    </nav>
  );
}
