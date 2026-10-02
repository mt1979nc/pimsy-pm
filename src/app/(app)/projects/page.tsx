import Link from "next/link";
import { requireStaff } from "@/lib/guard";
import { listProjects } from "@/lib/queries";
import { canCreateProjects } from "@/lib/authz";
import { isSupportHandedOff } from "@/lib/handed-off-list";
import { Card, PageHeader, EmptyState, LinkButton, Badge } from "@/components/ui";
import { CutoverBanner } from "@/components/cutover-banner";
import { ProjectRow, ProjectListHeader } from "@/components/project-row";
import { HandedOffCount, HandedOffEntries, ShowHandedOffToggle } from "@/components/show-handed-off";
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

  // “All active” / health chips = Implementation WIP. Search includes every
  // status so the utility bar can find a site. Handed-off rows (supportHandoffAt)
  // are included in the payload and hidden until “Show handed off”. LIVE and
  // go-live dates do not hide a site.
  const openOnly = !sp.status && !q;
  const listed = await listProjects(actor, {
    status: sp.status,
    health: sp.health,
    customerId: sp.customer,
    includeArchived: false,
    openOnly,
  });
  const handedOffExtra = openOnly
    ? await listProjects(actor, {
        health: sp.health,
        customerId: sp.customer,
        includeArchived: false,
        handedOffOnly: true,
      })
    : [];
  const seen = new Set(listed.map((project) => project.id));
  const projects = [...listed, ...handedOffExtra.filter((project) => !seen.has(project.id))];

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
          <HandedOffCount
            rows={visible.map((project) => ({ handedOff: isSupportHandedOff(project.supportHandoffAt) }))}
            noun="project"
            query={q || undefined}
          />
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
        <ShowHandedOffToggle />
      </div>

      <Card className="overflow-hidden">
        <HandedOffEntries
          entries={visible.map((project) => ({
            id: project.id,
            handedOff: isSupportHandedOff(project.supportHandoffAt),
            content: <ProjectRow project={project} />,
          }))}
          empty={
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
          }
          wrap={(nodes) => (
            <>
              <ProjectListHeader />
              <div className="divide-y divide-border">{nodes}</div>
            </>
          )}
        />
      </Card>

      <p className="mt-4 text-[12.5px] text-ink-3">
        <Badge>Tip</Badge>{" "}
        Health is set on each project. Anything marked at risk pages the leadership dashboard.
      </p>
    </>
  );
}
