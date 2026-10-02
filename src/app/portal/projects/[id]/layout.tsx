import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/guard";
import { portalProject, portalPhaseTabs } from "@/lib/portal";
import { Badge } from "@/components/ui";
import { CustomerAreaNav } from "@/components/customer-area-nav";
import { fmtDate, daysUntil } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function PortalProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireCustomer();

  const project = await portalProject(actor, id);
  if (!project) notFound();

  const phaseTabs = await portalPhaseTabs(actor, id);

  const days = daysUntil(project.targetGoLiveDate);

  return (
    <>
      <Link href="/portal" className="mb-3 inline-block text-[12.5px] text-ink-3 hover:text-brand">
        ← Your workspace
      </Link>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold leading-tight tracking-[-0.02em] text-ink">
            {project.name}
          </h1>
          <p className="mt-0.5 text-[13px] text-ink-2">
            {project.status === "COMPLETED"
              ? "Live"
              : days !== null
                ? days >= 0
                  ? `Go-live ${fmtDate(project.targetGoLiveDate)} · ${days}d`
                  : `Target was ${fmtDate(project.targetGoLiveDate)}`
                : "Go-live unset"}
          </p>
        </div>
        {project.status === "COMPLETED" ? (
          <Badge tone="green">Live</Badge>
        ) : (
          <Badge tone="brand">In progress</Badge>
        )}
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <aside className="w-full shrink-0 lg:sticky lg:top-4 lg:w-[220px]">
          <CustomerAreaNav
            overviewHref={`/portal/projects/${id}`}
            aboutHref={`/portal/projects/${id}/about`}
            learnHref="/portal/learn"
            phases={phaseTabs.map((phase) => ({
              id: phase.id,
              name: phase.name,
              href: `/portal/projects/${id}/phases/${phase.id}`,
            }))}
            recordingsHref={`/portal/projects/${id}/recordings`}
            messagesHref={`/portal/projects/${id}/messages`}
          />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  );
}
