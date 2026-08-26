import Link from "next/link";
import { requireStaff } from "@/lib/guard";
import { listCustomers } from "@/lib/queries";
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
import { pctComplete } from "@/lib/rollup";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customers" };

export default async function CustomersPage() {
  await requireStaff();
  const customers = await listCustomers();

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={`${customers.length} practice${customers.length === 1 ? "" : "s"}`}
        actions={
          <LinkButton href="/customers/new" variant="primary">
            Add customer
          </LinkButton>
        }
      />

      {customers.length === 0 ? (
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
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {customers.map((c) => {
            const activeProjects = c.projects.filter(
              (p) => !["COMPLETED", "CANCELLED"].includes(p.status),
            );
            const contacts = c.contacts.filter((x) => x.isActive);
            return (
              <Card key={c.id} className="overflow-hidden">
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
                    <Badge>
                      {activeProjects.length} active project
                      {activeProjects.length === 1 ? "" : "s"}
                    </Badge>
                    <Badge>
                      {contacts.length} contact{contacts.length === 1 ? "" : "s"}
                    </Badge>
                    {c.priorSystem ? <Badge>from {c.priorSystem}</Badge> : null}
                  </div>
                </Link>

                {activeProjects.length > 0 ? (
                  <div className="divide-y divide-border border-t border-border">
                    {activeProjects.slice(0, 3).map((p) => (
                      <Link
                        key={p.id}
                        href={`/projects/${p.id}`}
                        className="flex items-center gap-3 px-5 py-2 hover:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">
                          {p.name}
                        </span>
                        <span className="shrink-0 text-[12px] text-ink-3">
                          {pctComplete(p.taskCountDone, p.taskCountTotal)}%
                        </span>
                        <span className="shrink-0 text-[12px] text-ink-3">
                          {p.targetGoLiveDate ? fmtDate(p.targetGoLiveDate) : "—"}
                        </span>
                        <HealthBadge health={p.health} />
                      </Link>
                    ))}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
