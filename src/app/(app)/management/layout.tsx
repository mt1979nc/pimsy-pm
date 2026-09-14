import { requirePortfolioAccess } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { SubNavLink } from "@/components/nav-link";

export const dynamic = "force-dynamic";

/**
 * Prism Management / Staffing hub — OWNER, ADMIN, MANAGER only.
 * Native Postgres (no Prism Azure SQL dual-write). See v1.11-PRISM-CUTOVER.md.
 */
export default async function ManagementLayout({ children }: { children: React.ReactNode }) {
  await requirePortfolioAccess();

  return (
    <>
      <PageHeader
        title="Staffing"
        subtitle="Prism Management in PM — forecast, team capacity, engagement roster. Portfolio · Readiness · Insight · Staffing · Metrics."
      />
      <div className="mb-5 flex flex-wrap items-center gap-5 border-b border-border">
        <SubNavLink href="/management">Overview</SubNavLink>
        <SubNavLink href="/management/forecast">Forecast</SubNavLink>
        <SubNavLink href="/management/team">Team</SubNavLink>
        <SubNavLink href="/management/engagements">Engagements</SubNavLink>
        <SubNavLink href="/reports/analysis">Analysis</SubNavLink>
      </div>
      {children}
    </>
  );
}
