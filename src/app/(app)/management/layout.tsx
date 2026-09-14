import { requirePortfolioAccess } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { SubNavLink } from "@/components/nav-link";
import { PRISM_EXPANSION, PRISM_MODULE_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

/**
 * Prism analytics hub — OWNER, ADMIN, MANAGER only.
 * Native Postgres (no Prism Azure SQL dual-write). See v1.11-PRISM-CUTOVER.md.
 */
export default async function ManagementLayout({ children }: { children: React.ReactNode }) {
  await requirePortfolioAccess();

  return (
    <>
      <PageHeader
        title={PRISM_MODULE_NAME}
        subtitle={`${PRISM_EXPANSION} — capacity, forecast, and the book of business.`}
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
