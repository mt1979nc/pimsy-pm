import Link from "next/link";
import { requireStaff } from "@/lib/guard";
import { waitingOnThreadRollup } from "@/lib/queries";
import {
  PageHeader,
  Card,
  CardHeader,
  EmptyState,
  Badge,
  HealthBadge,
  WaitingOnBadge,
  Avatar,
  Stat,
} from "@/components/ui";
import { differenceInCalendarDays, startOfDay, fmtRelative } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Waiting on" };

export default async function WaitingOnReportPage() {
  const actor = await requireStaff();
  const rows = await waitingOnThreadRollup(actor);

  const pimsyTotal = rows.reduce((n, r) => n + r.pimsyCount, 0);
  const customerTotal = rows.reduce((n, r) => n + r.customerCount, 0);
  const unknownTotal = rows.reduce((n, r) => n + r.unknownCount, 0);

  return (
    <>
      <PageHeader
        title="Waiting on"
        subtitle="Open shared threads by project — ball-in-court for the portfolio WIP view."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Projects with open threads" value={rows.length} />
        <Stat label="Waiting on PIMSY" value={pimsyTotal} tone={pimsyTotal > 0 ? "amber" : undefined} />
        <Stat
          label="Waiting on customer"
          value={customerTotal}
          hint={unknownTotal > 0 ? `${unknownTotal} untagged` : undefined}
        />
        <Stat label="Untagged" value={unknownTotal} />
      </div>

      <Card>
        <CardHeader
          title="By project"
          subtitle="SHARED conversations that are still open"
        />
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing outstanding"
            description="No open shared threads across your projects."
          />
        ) : (
          <div className="divide-y divide-border">
            {rows.map((row) => {
              const aging =
                row.oldestSince != null
                  ? differenceInCalendarDays(
                      startOfDay(new Date()),
                      startOfDay(row.oldestSince),
                    )
                  : null;
              return (
                <div key={row.project.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/projects/${row.project.id}/messages`}
                          className="truncate text-[14px] font-semibold text-ink hover:text-brand"
                        >
                          {row.project.customerAccount?.name ?? row.project.name}
                        </Link>
                        <span className="font-mono text-[11.5px] text-ink-3">{row.project.code}</span>
                        <HealthBadge health={row.project.health} />
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
                        {row.pimsyCount > 0 ? (
                          <Badge tone="amber">{row.pimsyCount} on PIMSY</Badge>
                        ) : null}
                        {row.customerCount > 0 ? (
                          <Badge tone="violet">{row.customerCount} on customer</Badge>
                        ) : null}
                        {row.unknownCount > 0 ? (
                          <Badge>{row.unknownCount} untagged</Badge>
                        ) : null}
                        {aging != null ? (
                          <span>Oldest {aging === 0 ? "today" : `${aging}d`}</span>
                        ) : null}
                        {row.project.lead ? (
                          <span className="inline-flex items-center gap-1">
                            <Avatar
                              name={row.project.lead.name}
                              image={row.project.lead.image}
                              size={16}
                            />
                            {row.project.lead.name}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <Link
                      href={`/projects/${row.project.id}/messages`}
                      className="shrink-0 text-[12.5px] font-medium text-brand hover:underline"
                    >
                      Open messages
                    </Link>
                  </div>

                  <ul className="mt-3 space-y-1.5">
                    {row.threads.map((t) => {
                      const days = differenceInCalendarDays(
                        startOfDay(new Date()),
                        startOfDay(t.waitingOnSince),
                      );
                      return (
                        <li key={t.id}>
                          <Link
                            href={`/projects/${row.project.id}/messages/${t.id}`}
                            className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2"
                          >
                            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                              {t.subject}
                            </span>
                            <WaitingOnBadge waitingOn={t.waitingOn} agingDays={days} />
                            <span className="text-[11.5px] text-ink-3">
                              {fmtRelative(t.lastMessageAt)}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
