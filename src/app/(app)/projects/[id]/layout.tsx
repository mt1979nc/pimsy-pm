import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { requireStaff } from "@/lib/guard";
import { assertProjectAccess, NotFoundError, ForbiddenError } from "@/lib/authz";
import { pctComplete } from "@/lib/pct-complete";
import { fmtDate, daysUntil } from "@/lib/dates";
import { SubNavLink } from "@/components/nav-link";
import { HealthBadge, ProjectStatusBadge, ProgressBar, Avatar, Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { projectHasRcmTrack } from "@/lib/add-rcm";

export const dynamic = "force-dynamic";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireStaff();

  try {
    await assertProjectAccess(actor, id);
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ForbiddenError) notFound();
    throw err;
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, id),
    with: {
      customerAccount: { columns: { id: true, name: true, status: true, excludeFromAnalytics: true } },
      lead: { columns: { id: true, name: true, image: true } },
    },
  });
  if (!project) notFound();

  const pct = pctComplete(project.taskCountDone, project.taskCountTotal);
  const days = daysUntil(project.targetGoLiveDate);
  const late = days !== null && days < 0 && project.status !== "COMPLETED";
  const hasRcm = projectHasRcmTrack({
    playbookPath: project.playbookPath,
    rcmTaskCountTotal: project.rcmTaskCountTotal,
  });

  return (
    <>
      <div className="mb-4">
        <div className="mb-1 flex items-center gap-2 text-[12px] text-ink-3">
          <Link href="/projects" className="hover:text-brand">
            Projects
          </Link>
          <span>/</span>
          {project.customerAccount ? (
            <Link
              href={`/customers/${project.customerAccount.id}`}
              className="truncate hover:text-brand"
            >
              {project.customerAccount.name}
            </Link>
          ) : (
            <span>Internal</span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[20px] font-semibold leading-tight tracking-[-0.02em] text-ink">
                {project.name}
              </h1>
              <span className="font-mono text-[12px] text-ink-3">{project.code}</span>
              <HealthBadge health={project.health} />
              <ProjectStatusBadge status={project.status} />
              {hasRcm ? <Badge tone="violet">RCM</Badge> : null}
              {!project.portalEnabled ? <Badge tone="amber">Portal off</Badge> : null}
              {project.onboarded ? <Badge tone="green">Onboarded</Badge> : null}
              {project.excludeFromAnalytics || project.customerAccount?.excludeFromAnalytics ? (
                <Badge tone="amber">Off analytics</Badge>
              ) : null}
              {project.archivedAt ? <Badge>Archived</Badge> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
            <div className={cn("font-medium", late ? "text-red" : "text-ink")}>
              {project.targetGoLiveDate ? fmtDate(project.targetGoLiveDate) : "Go-live unset"}
              {days !== null && project.status !== "COMPLETED" ? (
                <span className="ml-1 font-normal text-ink-3">
                  {late ? `${Math.abs(days)}d late` : `in ${days}d`}
                </span>
              ) : null}
            </div>
            <div className="min-w-[120px]">
              <div className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="font-medium text-ink">
                  {project.rcmTaskCountTotal > 0 ? "EHR " : ""}
                  {project.rcmTaskCountTotal > 0
                    ? pctComplete(project.ehrTaskCountDone, project.ehrTaskCountTotal)
                    : pct}
                  %
                </span>
                <span className="text-ink-3">
                  {project.rcmTaskCountTotal > 0
                    ? `${project.ehrTaskCountDone}/${project.ehrTaskCountTotal}`
                    : `${project.taskCountDone}/${project.taskCountTotal}`}
                </span>
              </div>
              <ProgressBar
                value={project.rcmTaskCountTotal > 0 ? project.ehrTaskCountDone : project.taskCountDone}
                total={project.rcmTaskCountTotal > 0 ? project.ehrTaskCountTotal : project.taskCountTotal}
                tone={pct === 100 ? "green" : "brand"}
                className="mt-1"
              />
            </div>
            {project.rcmTaskCountTotal > 0 ? (
              <div className="min-w-[120px]">
                <div className="flex items-baseline justify-between gap-2 text-[12px]">
                  <span className="font-medium text-ink">
                    RCM {pctComplete(project.rcmTaskCountDone, project.rcmTaskCountTotal)}%
                  </span>
                  <span className="text-ink-3">
                    {project.rcmTaskCountDone}/{project.rcmTaskCountTotal}
                  </span>
                </div>
                <ProgressBar
                  value={project.rcmTaskCountDone}
                  total={project.rcmTaskCountTotal}
                  tone="violet"
                  className="mt-1"
                />
              </div>
            ) : null}
            {project.lead ? (
              <div className="flex items-center gap-1.5">
                <Avatar name={project.lead.name} image={project.lead.image} size={20} />
                <span className="text-ink">{project.lead.name}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-4 border-b border-border">
        <SubNavLink href={`/projects/${id}`}>Overview</SubNavLink>
        <SubNavLink href={`/projects/${id}/about`}>About</SubNavLink>
        <SubNavLink href={`/projects/${id}/tasks`}>Tasks</SubNavLink>
        <SubNavLink href={`/projects/${id}/messages`}>Messages</SubNavLink>
        <SubNavLink href={`/projects/${id}/settings`}>Settings</SubNavLink>
        <SubNavLink href={`/projects/${id}/customer-view`} match="prefix">
          Customer view
        </SubNavLink>
      </div>

      {children}
    </>
  );
}
