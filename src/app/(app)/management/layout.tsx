import { requireStaff } from "@/lib/guard";
import { canSeePortfolio, isCapacityViewer } from "@/lib/authz";
import { CAPACITY_VIEWER_HOME, capacityViewerRouteDecision } from "@/lib/capacity-viewer";
import { staffHomeHref } from "@/lib/day-to-day";
import { PageHeader } from "@/components/ui";
import { PrismNav } from "@/components/prism-nav";
import { PRISM_MODULE_NAME } from "@/lib/brand";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Prism analytics hub — OWNER, ADMIN, MANAGER, plus a capacity viewer on Team capacity.
 * Native Postgres (no Prism Azure SQL dual-write). See v1.11-PRISM-CUTOVER.md.
 */
export default async function ManagementLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireStaff();
  if (isCapacityViewer(actor)) {
    const path = (await headers()).get("x-pathname") ?? "";
    if (path && capacityViewerRouteDecision(path) === "redirect") redirect(CAPACITY_VIEWER_HOME);
    return (
      <>
        <PageHeader title="Team capacity" subtitle="View only." />
        {children}
      </>
    );
  }
  if (!canSeePortfolio(actor)) redirect(staffHomeHref(actor.role));

  return (
    <>
      <PageHeader title={PRISM_MODULE_NAME} subtitle="Capacity, forecast, site health, and Dock delivery." />
      <PrismNav />
      {children}
    </>
  );
}
