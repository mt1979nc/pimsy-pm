import { requirePortfolioAccess } from "@/lib/guard";
import { isAdmin } from "@/lib/authz";
import { PageHeader } from "@/components/ui";
import { SubNavLink } from "@/components/nav-link";
import { ADMIN_AREA_LABEL, ADMIN_NAV } from "@/lib/area-nav";

export const dynamic = "force-dynamic";

/**
 * Implementation dashboard. Open to OWNER, ADMIN and MANAGER — a director needs
 * the overview without needing the right to change people's roles.
 * Prism (capacity, forecast, analysis) is `/management`, not this area.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePortfolioAccess();
  const items = ADMIN_NAV.filter((item) => !item.adminOnly || isAdmin(actor));

  return (
    <>
      <PageHeader title={ADMIN_AREA_LABEL} subtitle="Projects, customers, people, and alerts." />
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
