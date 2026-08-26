import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { requireStaff } from "@/lib/guard";
import { assertProjectAccess, NotFoundError, ForbiddenError } from "@/lib/authz";
import { pctComplete } from "@/lib/rollup";
import { fmtDate, daysUntil } from "@/lib/dates";
import { SubNavLink } from "@/components/nav-link";
import { HealthBadge, ProjectStatusBadge, ProgressBar, Avatar, Badge } from "@/components/ui";
import { cn } from "@/lib/cn";

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
      customerAccount: { columns: { id: true, name: true, status: true } },
      lead: { columns: { id: true, name: true, image: true } },
    },
  });
  if (!project) notFound();

  const pct = pctComplete(project.taskCountDone, project.taskCountTotal);
  const days = daysUntil(project.targetGoLiveDate);
  const late = days !== null && days < 0 && project.status !== "COMPLETED";

  return (
    <>
      <div className="mb-5">
        <div className="mb-1.5 flex items-center gap-2 text-[12.5px] text-ink-3">
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

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">
                {project.name}
              </h1>
              <span className="font-mono text-[12px] text-ink-3">{project.code}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <HealthBadge health={project.health} />
              <ProjectStatusBadge status={project.status} />
              {!project.portalEnabled ? <Badge tone="amber">Portal off</Badge> : null}
              {project.archivedAt ? <Badge>Archived</Badge> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="min-w-[130px]">
              <div className="text-[11.5px] uppercase tracking-wide text-ink-3">Go-live</div>
              <div
                className={cn(
                  "mt-0.5 text-[13.5px] font-medium",
                  late ? "text-red" : "text-ink",
                )}
              >
                {project.targetGoLiveDate ? fmtDate(project.targetGoLiveDate) : "Not set"}
              </div>
              {days !== null && project.status !== "COMPLETED" ? (
                <div className="text-[12px] text-ink-3">
                  {late ? `${Math.abs(days)} days late` : `in ${days} days`}
                </div>
              ) : null}
            </div>

            <div className="min-w-[130px]">
              <div className="text-[11.5px] uppercase tracking-wide text-ink-3">Progress</div>
              <div className="mt-0.5 text-[13.5px] font-medium text-ink">
                {pct}%
                <span className="ml-1.5 text-[12px] font-normal text-ink-3">
                  {project.taskCountDone}/{project.taskCountTotal}
                </span>
              </div>
              <ProgressBar
                value={project.taskCountDone}
                total={project.taskCountTotal}
                tone={pct === 100 ? "green" : "brand"}
                className="mt-1.5"
              />
            </div>

            {project.lead ? (
              <div>
                <div className="text-[11.5px] uppercase tracking-wide text-ink-3">Lead</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <Avatar name={project.lead.name} image={project.lead.image} size={22} />
                  <span className="text-[13px] text-ink">{project.lead.name}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mb-5 flex items-center gap-5 border-b border-border">
        <SubNavLink href={`/projects/${id}`}>Overview</SubNavLink>
        <SubNavLink href={`/projects/${id}/tasks`}>Tasks</SubNavLink>
        <SubNavLink href={`/projects/${id}/messages`}>Messages</SubNavLink>
        <SubNavLink href={`/projects/${id}/settings`}>Settings</SubNavLink>
      </div>

      {children}
    </>
  );
}
