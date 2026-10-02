import Link from "next/link";
import { requireStaff } from "@/lib/guard";
import { listCustomers } from "@/lib/queries";
import { customerHandedOffToSupport, isSupportHandedOff } from "@/lib/handed-off-list";
import { combineCeoProductTypes } from "@/lib/ceo-book";
import { projectListProductType } from "@/components/project-row";
import {
  PageHeader,
  Card,
  EmptyState,
  LinkButton,
  CustomerStatusBadge,
  HealthBadge,
  Badge,
} from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import { pctComplete } from "@/lib/pct-complete";
import { HandedOffCount, HandedOffEntries, HandedOffRow, ShowHandedOffToggle } from "@/components/show-handed-off";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customers" };

export default async function CustomersPage() {
  await requireStaff();
  const customers = await listCustomers();
  const flags = customers.map((customer) => ({
    handedOff: customerHandedOffToSupport(customer.projects),
  }));

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={<HandedOffCount rows={flags} noun="practice" />}
        actions={
          <LinkButton href="/customers/new" variant="primary">
            Add customer
          </LinkButton>
        }
      />

      <div className="mb-4">
        <ShowHandedOffToggle />
      </div>

      <HandedOffEntries
        entries={customers.map((c) => {
          const activeProjects = c.projects.filter(
            (p) => !["COMPLETED", "CANCELLED"].includes(p.status) && !isSupportHandedOff(p.supportHandoffAt),
          );
          const handedOffProjects = c.projects.filter(
            (p) => isSupportHandedOff(p.supportHandoffAt) && p.status !== "CANCELLED",
          );
          const contacts = c.contacts.filter((x) => x.isActive);
          const productProjects = c.projects.filter((p) => p.status !== "CANCELLED");
          const productType = combineCeoProductTypes(
            (productProjects.length > 0 ? productProjects : c.projects).map((p) =>
              projectListProductType(p),
            ),
          );
          const projectRows = [
            ...activeProjects.slice(0, 3).map((p) => ({ project: p, handedOff: false })),
            ...handedOffProjects
              .filter((p) => !activeProjects.some((active) => active.id === p.id))
              .slice(0, 3)
              .map((p) => ({ project: p, handedOff: true })),
          ];
          return {
            id: c.id,
            handedOff: customerHandedOffToSupport(c.projects),
            content: (
              <Card className="overflow-hidden">
                <Link href={`/customers/${c.id}`} className="block px-5 py-4 hover:bg-surface-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-[14.5px] font-semibold text-ink">{c.name}</h2>
                      <p className="mt-0.5 truncate text-[12.5px] text-ink-3">
                        {[c.practiceType, c.seatCount ? `${c.seatCount} seats` : null]
                          .filter(Boolean)
                          .join(" · ") || "No details yet"}
                      </p>
                    </div>
                    <CustomerStatusBadge status={c.status} />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {productType ? (
                      <Badge tone={productType === "EHR" ? "slate" : "maroon"}>{productType}</Badge>
                    ) : null}
                    <Badge>
                      {activeProjects.length} active project
                      {activeProjects.length === 1 ? "" : "s"}
                    </Badge>
                    <Badge>
                      {contacts.length} contact{contacts.length === 1 ? "" : "s"}
                    </Badge>
                    {c.priorSystem ? <Badge>from {c.priorSystem}</Badge> : null}
                    {c.excludeFromAnalytics ? <Badge tone="amber">Off analytics</Badge> : null}
                  </div>
                </Link>

                {projectRows.length > 0 ? (
                  <div className="divide-y divide-border border-t border-border">
                    {projectRows.map(({ project, handedOff }) => {
                      const rowProduct = projectListProductType(project);
                      return (
                        <HandedOffRow key={project.id} handedOff={handedOff}>
                          <Link
                            href={`/projects/${project.id}`}
                            className="flex items-center gap-3 px-5 py-2 hover:bg-surface-2"
                          >
                            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">
                              {project.name}
                            </span>
                            <Badge tone={rowProduct === "EHR" ? "slate" : "maroon"}>{rowProduct}</Badge>
                            <span className="shrink-0 text-[12px] text-ink-3">
                              {pctComplete(project.taskCountDone, project.taskCountTotal)}%
                            </span>
                            <span className="shrink-0 text-[12px] text-ink-3">
                              {project.targetGoLiveDate ? fmtDate(project.targetGoLiveDate) : "—"}
                            </span>
                            <HealthBadge health={project.health} />
                          </Link>
                        </HandedOffRow>
                      );
                    })}
                  </div>
                ) : null}
              </Card>
            ),
          };
        })}
        empty={
          <Card>
            <EmptyState
              title="No customers yet"
              description="Add a practice, then create their implementation project."
              action={
                <LinkButton href="/customers/new" variant="primary" size="sm">
                  Add customer
                </LinkButton>
              }
            />
          </Card>
        }
        layout="grid"
      />
    </>
  );
}
