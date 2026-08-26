import Link from "next/link";
import { requirePortfolioAccess } from "@/lib/guard";
import { listCustomers } from "@/lib/queries";
import {
  Card,
  EmptyState,
  Badge,
  HealthBadge,
  CustomerStatusBadge,
  ProgressBar,
  LinkButton,
} from "@/components/ui";
import { pctComplete } from "@/lib/rollup";
import { fmtDate } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "All customers" };

export default async function AdminCustomersPage() {
  await requirePortfolioAccess();
  const customers = await listCustomers();

  const totals = {
    contacts: customers.reduce((n, c) => n + c.contacts.filter((x) => x.isActive).length, 0),
    seats: customers.reduce((n, c) => n + (c.seatCount ?? 0), 0),
    neverSignedIn: customers.reduce(
      (n, c) => n + c.contacts.filter((x) => x.isActive && !x.lastSeenAt).length,
      0,
    ),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <Badge>{customers.length} customers</Badge>
          <Badge>{totals.contacts} portal contacts</Badge>
          <Badge>{totals.seats} seats</Badge>
          {totals.neverSignedIn > 0 ? (
            <Badge tone="amber">{totals.neverSignedIn} never signed in</Badge>
          ) : null}
        </div>
        <LinkButton href="/customers/new" variant="primary" size="sm">
          Add customer
        </LinkButton>
      </div>

      <Card className="overflow-hidden">
        {customers.length === 0 ? (
          <EmptyState title="No customers yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-[11px] uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2 text-left font-semibold">Practice</th>
                  <th className="px-4 py-2 text-left font-semibold">Status</th>
                  <th className="px-4 py-2 text-left font-semibold">Seats</th>
                  <th className="px-4 py-2 text-left font-semibold">From</th>
                  <th className="px-4 py-2 text-left font-semibold">Projects</th>
                  <th className="px-4 py-2 text-left font-semibold">Progress</th>
                  <th className="px-4 py-2 text-left font-semibold">Next go-live</th>
                  <th className="px-4 py-2 text-left font-semibold">Contacts</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => {
                  const active = c.projects.filter(
                    (p) => !["COMPLETED", "CANCELLED"].includes(p.status),
                  );
                  const done = c.projects.reduce((n, p) => n + p.taskCountDone, 0);
                  const total = c.projects.reduce((n, p) => n + p.taskCountTotal, 0);
                  const worst = active.some((p) => p.health === "RED")
                    ? "RED"
                    : active.some((p) => p.health === "YELLOW")
                      ? "YELLOW"
                      : "GREEN";
                  const nextGoLive = active
                    .map((p) => p.targetGoLiveDate)
                    .filter(Boolean)
                    .sort((a, b) => new Date(a!).getTime() - new Date(b!).getTime())[0];
                  const activeContacts = c.contacts.filter((x) => x.isActive);
                  const dormant = activeContacts.filter((x) => !x.lastSeenAt).length;

                  return (
                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                      <td className="px-4 py-2.5">
                        <Link href={`/customers/${c.id}`} className="block max-w-[240px]">
                          <span className="block truncate font-medium text-ink hover:text-brand">
                            {c.name}
                          </span>
                          <span className="block truncate text-[12px] text-ink-3">
                            {c.practiceType ?? "—"}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <CustomerStatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-ink-2">{c.seatCount ?? "—"}</td>
                      <td className="max-w-[130px] truncate px-4 py-2.5 text-[12.5px] text-ink-2">
                        {c.priorSystem ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1.5">
                          <span className="tabular-nums text-ink-2">{active.length}</span>
                          {active.length > 0 ? <HealthBadge health={worst as never} /> : null}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="w-[90px]">
                          <div className="mb-1 text-[11.5px] tabular-nums text-ink-3">
                            {pctComplete(done, total)}%
                          </div>
                          <ProgressBar value={done} total={total} />
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-ink-2">
                        {nextGoLive ? fmtDate(nextGoLive) : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1.5">
                          <span className="tabular-nums text-ink-2">{activeContacts.length}</span>
                          {dormant > 0 ? <Badge tone="amber">{dormant} dormant</Badge> : null}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-[12.5px] text-ink-3">
        &ldquo;Dormant&rdquo; means a contact was invited but has never signed in — usually worth a
        nudge, since they can&apos;t action anything they haven&apos;t seen.
      </p>
    </div>
  );
}
