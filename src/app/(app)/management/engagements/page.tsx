import Link from "next/link";
import { Card, CardHeader, EmptyState, LinkButton } from "@/components/ui";
import { listEngagements } from "@/actions/management-engagements";
import { EngagementRosterTable } from "../_components/engagement-roster-table";
import { cn } from "@/lib/cn";
import { loadPathConfig } from "@/lib/path-config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Roster" };

export default async function ManagementEngagementsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusParam } = await searchParams;
  const config = await loadPathConfig();
  const filters = [{ key: "all", label: "All" }, ...config.statuses.map((row) => ({ key: row.key, label: row.label }))];
  const filter = filters.some((item) => item.key === statusParam) ? statusParam! : "all";
  const rows = await listEngagements();
  const visible = filter === "all" ? rows : rows.filter((row) => row.effectivePrismStatus === filter);
  const counts = new Map<string, number>([["all", rows.length]]);
  for (const row of rows) {
    counts.set(row.effectivePrismStatus, (counts.get(row.effectivePrismStatus) ?? 0) + 1);
  }
  const filterLabel = filters.find((item) => item.key === filter)?.label ?? "Roster";

  return (
    <div className="space-y-4" data-page-width="full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface-2 p-1">
          {filters.map((f) => (
            <Link
              key={f.key}
              href={f.key === "all" ? "/management/engagements" : `/management/engagements?status=${f.key}`}
              className={cn(
                "rounded-md px-2.5 py-1 text-[12.5px] font-medium",
                filter === f.key ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink",
              )}
            >
              {f.label}
              <span className="ml-1 tabular-nums text-ink-3">{counts.get(f.key) ?? 0}</span>
            </Link>
          ))}
        </div>
        <LinkButton href="/management/engagements/new" variant="primary" size="sm">
          Add to roster
        </LinkButton>
      </div>
      <Card className="min-w-0">
        <CardHeader
          title={filter === "all" ? "Roster" : filterLabel}
          subtitle={
            filter === "pipeline"
              ? "Not counted in weekly hours."
              : `${visible.length} sites`
          }
        />
        {visible.length === 0 ? (
          <EmptyState
            title="No implementations in this filter"
            description="Add a site, or switch the filter."
          />
        ) : (
          <EngagementRosterTable rows={visible} />
        )}
      </Card>
    </div>
  );
}
