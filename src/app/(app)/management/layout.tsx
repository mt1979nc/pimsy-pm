import { requirePortfolioAccess } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { PrismNav } from "@/components/prism-nav";
import { PRISM_MODULE_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

/**
 * Prism analytics hub — OWNER, ADMIN, MANAGER only.
 * Native Postgres (no Prism Azure SQL dual-write). See v1.11-PRISM-CUTOVER.md.
 */
export default async function ManagementLayout({ children }: { children: React.ReactNode }) {
  await requirePortfolioAccess();

  return (
    <>
      <PageHeader title={PRISM_MODULE_NAME} subtitle="Staffing, forecast, and site health." />
      <PrismNav />
      {children}
    </>
  );
}
