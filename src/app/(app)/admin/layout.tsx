import { requirePortfolioAccess } from "@/lib/guard";
import { isAdmin } from "@/lib/authz";
import { PageHeader } from "@/components/ui";
import { SubNavLink } from "@/components/nav-link";

export const dynamic = "force-dynamic";

/**
 * Management area. Open to OWNER, ADMIN and MANAGER — a director needs the
 * overview without needing the right to change people's roles.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePortfolioAccess();

  return (
    <>
      <PageHeader
        title="Management"
        subtitle="Everything across every customer and project, in one place."
      />
      <div className="mb-5 flex flex-wrap items-center gap-5 border-b border-border">
        <SubNavLink href="/admin">Overview</SubNavLink>
        <SubNavLink href="/admin/projects">All projects</SubNavLink>
        <SubNavLink href="/admin/customers">All customers</SubNavLink>
        {isAdmin(actor) ? <SubNavLink href="/admin/users">People</SubNavLink> : null}
        {isAdmin(actor) ? <SubNavLink href="/admin/alerts">Alerts</SubNavLink> : null}
      </div>
      {children}
    </>
  );
}
