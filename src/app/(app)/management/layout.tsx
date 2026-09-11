import { requirePortfolioAccess } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { SubNavLink } from "@/components/nav-link";

export const dynamic = "force-dynamic";

/**
 * Prism Management / Staffing hub — OWNER, ADMIN, MANAGER only.
 * Native Postgres (no Prism Azure SQL dual-write). See
 * /workspace/pimsy-pm-ops/v1.8-PRISM-MANAGEMENT-BRIEF.md
 */
export default async function ManagementLayout({ children }: { children: React.ReactNode }) {
  await requirePortfolioAccess();

  return (
    <>
      <PageHeader
        title="Staffing"
        subtitle="Prism Management — team capacity flags and engagement roster. Portfolio · Readiness · Insight · Staffing · Metrics."
      />
      <div className="mb-5 flex flex-wrap items-center gap-5 border-b border-border">
        <SubNavLink href="/management">Overview</SubNavLink>
        <SubNavLink href="/management/team">Team</SubNavLink>
        <SubNavLink href="/management/engagements">Engagements</SubNavLink>
      </div>
      {children}
    </>
  );
}
