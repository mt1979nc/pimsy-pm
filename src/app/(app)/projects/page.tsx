import Link from "next/link";
import { requireStaff } from "@/lib/guard";
import { listProjects } from "@/lib/queries";
import { canCreateProjects } from "@/lib/authz";
import { Card, PageHeader, EmptyState, LinkButton, Badge } from "@/components/ui";
import { CutoverBanner } from "@/components/cutover-banner";
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
  searchParams: Promise<{ status?: string; health?: string; customer?: string; q?: string }>;
}) {
  const actor = await requireStaff();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const projects = await listProjects(actor, {
    status: sp.status,
    health: sp.health,
    customerId: sp.customer,
    includeArchived: false,
    // “All active” / health chips = Implementation WIP. Completing Hand off
    // to Support sets COMPLETED, which drops the site from this list.
    // A site search includes completed work so the utility bar can find it.
    openOnly: !sp.status && !q,
  });

  const needle = q.toLowerCase();
  const visible = needle
    ? projects.filter((project) =>
        [project.name, project.code, project.customerAccount?.name]
          .some((value) => (value ?? "").toLowerCase().includes(needle)),
      )
    : projects;

  const activeKey = sp.health ? `health=${sp.health}` : sp.status ? `status=${sp.status}` : "";

  function filterHref(key: string) {
    const params = new URLSearchParams(key);
    if (q) params.set("q", q);
    const query = params.toString();
    return query ? `/projects?${query}` : "/projects";
  }

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={
          q
            ? `${visible.length} match${visible.length === 1 ? "" : "es"} for “${q}”`
            : `${visible.length} project${visible.length === 1 ? "" : "s"}`
        }
        actions={
          canCreateProjects(actor) ? (
            <LinkButton href="/projects/new" variant="primary">
              New project
            </LinkButton>
          ) : null
        }
      />

      <CutoverBanner />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={filterHref(f.key)}
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
        {visible.length === 0 ? (
          <EmptyState
            title={q ? "No sites match" : "No projects here"}
            description={
              q
                ? `Nothing matches “${q}”.`
                : activeKey
                  ? "Nothing matches this filter right now."
                  : "Create your first project to get started."
            }
            action={
              canCreateProjects(actor) && !q ? (
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
              {visible.map((p) => (
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
