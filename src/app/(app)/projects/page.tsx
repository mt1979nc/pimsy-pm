import Link from "next/link";
import { requireStaff } from "@/lib/guard";
import { listProjects } from "@/lib/queries";
import { canCreateProjects } from "@/lib/authz";
import { Card, PageHeader, EmptyState, LinkButton, Badge } from "@/components/ui";
import { ProjectRow, ProjectListHeader } from "@/components/project-row";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Projects" };

const FILTERS = [
  { key: "", label: "All active" },
  { key: "health=RED", label: "At risk" },
  { key: "health=YELLOW", label: "Needs attention" },
  { key: "status=IN_PROGRESS", label: "In progress" },
  { key: "status=NOT_STARTED", label: "Not started" },
  { key: "status=COMPLETED", label: "Completed" },
];

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; health?: string; customer?: string }>;
}) {
  const actor = await requireStaff();
  const sp = await searchParams;

  const projects = await listProjects(actor, {
    status: sp.status,
    health: sp.health,
    customerId: sp.customer,
    includeArchived: false,
  });

  const activeKey = sp.health ? `health=${sp.health}` : sp.status ? `status=${sp.status}` : "";

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={`${projects.length} project${projects.length === 1 ? "" : "s"}`}
        actions={
          canCreateProjects(actor) ? (
            <LinkButton href="/projects/new" variant="primary">
              New project
            </LinkButton>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key ? `/projects?${f.key}` : "/projects"}
            className={cn(
              "rounded-lg px-2.5 py-1 text-[13px] font-medium transition-colors",
              activeKey === f.key
                ? "bg-brand-soft text-brand"
                : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <Card className="overflow-hidden">
        {projects.length === 0 ? (
          <EmptyState
            title="No projects here"
            description={
              activeKey
                ? "Nothing matches this filter right now."
                : "Create your first project to get started."
            }
            action={
              canCreateProjects(actor) ? (
                <LinkButton href="/projects/new" variant="primary" size="sm">
                  New project
                </LinkButton>
              ) : null
            }
          />
        ) : (
          <>
            <ProjectListHeader />
            <div className="divide-y divide-border">
              {projects.map((p) => (
                <ProjectRow key={p.id} project={p} />
              ))}
            </div>
          </>
        )}
      </Card>

      <p className="mt-4 text-[12.5px] text-ink-3">
        <Badge>Tip</Badge>{" "}
        Health is set on each project. Anything marked at risk pages the leadership dashboard.
      </p>
    </>
  );
}
