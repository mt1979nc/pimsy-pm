import { requirePortfolioAccess } from "@/lib/guard";
import { isAdmin } from "@/lib/authz";
import { PageHeader } from "@/components/ui";
import { SubNavLink } from "@/components/nav-link";
import { ADMIN_AREA_LABEL, ADMIN_NAV } from "@/lib/area-nav";
import { adminNavFor, dayToDayEnabled } from "@/lib/day-to-day";

export const dynamic = "force-dynamic";

/**
 * Implementation dashboard. Open to OWNER, ADMIN and MANAGER — a director needs
 * the overview without needing the right to change people's roles.
 * Prism (capacity, forecast, analysis) is `/management`, not this area.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePortfolioAccess();
  const showDayToDay = dayToDayEnabled();
  const items = adminNavFor(ADMIN_NAV, { isAdmin: isAdmin(actor), showDayToDay });

  return (
    <>
      <PageHeader
        title={ADMIN_AREA_LABEL}
        subtitle={showDayToDay ? "Projects, customers, people, and alerts." : "People, alerts, and delivery health."}
      />
      <nav aria-label="Implementation Dashboard" className="mb-5 flex min-w-0 flex-wrap items-end gap-x-5 gap-y-1 border-b border-border">
        {items.map((item) => (
          <SubNavLink key={item.href} href={item.href} match={item.match ?? "exact"}>
            {item.label}
          </SubNavLink>
        ))}
      </nav>
      {children}
    </>
  );
}
