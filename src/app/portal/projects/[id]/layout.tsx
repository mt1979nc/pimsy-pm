import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/guard";
import { portalProject, portalPhaseTabs, portalRecordings } from "@/lib/portal";
import { Badge } from "@/components/ui";
import { SideNavLink } from "@/components/nav-link";
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

  const [phaseTabs, recordings] = await Promise.all([
    portalPhaseTabs(actor, id),
    portalRecordings(actor, id),
  ]);

  const days = daysUntil(project.targetGoLiveDate);

  return (
    <>
      <Link href="/portal" className="mb-3 inline-block text-[12.5px] text-ink-3 hover:text-brand">
        ← Your workspace
      </Link>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">
            {project.name}
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-2">
            {project.status === "COMPLETED"
              ? "You're live."
              : days !== null
                ? days >= 0
                  ? `Go-live ${fmtDate(project.targetGoLiveDate)} — ${days} days away`
                  : `Target date was ${fmtDate(project.targetGoLiveDate)}`
                : "Go-live date to be confirmed"}
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
          <nav className="rounded-xl border border-border bg-surface p-2">
            <div className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              Areas
            </div>
            <SideNavLink href={`/portal/projects/${id}`}>Overview</SideNavLink>
            <SideNavLink href={`/portal/projects/${id}/about`}>About</SideNavLink>
            {phaseTabs.map((phase) => (
              <SideNavLink key={phase.id} href={`/portal/projects/${id}/phases/${phase.id}`}>
                {phase.name}
              </SideNavLink>
            ))}
            <div className="my-2 border-t border-border" />
            {recordings.length > 0 ? (
              <SideNavLink href={`/portal/projects/${id}/recordings`}>Recordings</SideNavLink>
            ) : null}
            <SideNavLink href={`/portal/projects/${id}/messages`}>Messages</SideNavLink>
          </nav>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  );
}
