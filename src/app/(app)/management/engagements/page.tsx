import Link from "next/link";
import { Card, CardHeader, EmptyState, LinkButton } from "@/components/ui";
import { listEngagements } from "@/actions/management-engagements";
import { EngagementRosterTable } from "../_components/engagement-roster-table";
import { PRISM_STATUS_LABELS, type PrismStatus } from "@/lib/prism-status";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Engagements — Prism" };

const FILTERS: Array<{ key: "all" | PrismStatus; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "pre-kickoff", label: "Pre-kickoff" },
  { key: "pipeline", label: "Pipeline" },
];

export default async function ManagementEngagementsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusParam } = await searchParams;
  const filter = FILTERS.some((f) => f.key === statusParam) ? (statusParam as (typeof FILTERS)[number]["key"]) : "all";
  const rows = await listEngagements();
  const visible =
    filter === "all" ? rows : rows.filter((r) => r.effectivePrismStatus === filter);
  const counts = {
    all: rows.length,
    active: rows.filter((r) => r.effectivePrismStatus === "active").length,
    "pre-kickoff": rows.filter((r) => r.effectivePrismStatus === "pre-kickoff").length,
    pipeline: rows.filter((r) => r.effectivePrismStatus === "pipeline").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface-2 p-1">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key === "all" ? "/management/engagements" : `/management/engagements?status=${f.key}`}
              className={cn(
                "rounded-md px-2.5 py-1 text-[12.5px] font-medium",
                filter === f.key ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink",
              )}
            >
              {f.label}
              <span className="ml-1 tabular-nums text-ink-3">{counts[f.key]}</span>
            </Link>
          ))}
        </div>
        <LinkButton href="/management/engagements/new" variant="primary" size="sm">
          Add to roster
        </LinkButton>
      </div>
      <Card>
        <CardHeader
          title={filter === "all" ? "Engagements" : PRISM_STATUS_LABELS[filter]}
          subtitle={
            filter === "pipeline"
              ? "Pipeline is excluded from department weekly load until status moves to pre-kickoff or active."
              : `${visible.length} implementations`
          }
        />
        {visible.length === 0 ? (
          <EmptyState
            title="No implementations in this filter"
            description="Add to roster or run npm run db:import:prism after a Prism dump."
          />
        ) : (
          <EngagementRosterTable rows={visible} />
        )}
      </Card>
    </div>
  );
}
