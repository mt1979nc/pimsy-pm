import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/guard";
import { portalProject, portalPhaseTabs, portalRecordings } from "@/lib/portal";
import { Badge } from "@/components/ui";
import { SubNavLink } from "@/components/nav-link";
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

      {/*
        With one tab per phase this can run to a dozen+ tabs — too many to
        fit without scrolling. Overview and Recordings/Messages stay pinned
        so they're always reachable; only the phase list itself scrolls.
      */}
      <div className="mb-6 flex items-center border-b border-border">
        <div className="shrink-0">
          <SubNavLink href={`/portal/projects/${id}`}>Overview</SubNavLink>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-5 overflow-x-auto px-5">
          {phaseTabs.map((phase) => (
            <SubNavLink key={phase.id} href={`/portal/projects/${id}/phases/${phase.id}`}>
              {phase.name}
            </SubNavLink>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-5">
          {recordings.length > 0 ? (
            <SubNavLink href={`/portal/projects/${id}/recordings`}>Recordings</SubNavLink>
          ) : null}
          <SubNavLink href={`/portal/projects/${id}/messages`}>Messages</SubNavLink>
        </div>
      </div>

      {children}
    </>
  );
}
