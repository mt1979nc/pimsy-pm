import Link from "next/link";
import { requirePortfolioAccess } from "@/lib/guard";
import { listProjects } from "@/lib/queries";
import { Card, EmptyState, Badge, HealthBadge, ProjectStatusBadge, ProgressBar, Avatar } from "@/components/ui";
import { pctComplete } from "@/lib/rollup";
import { fmtDate, daysUntil } from "@/lib/dates";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "All projects" };

const FILTERS = [
  { key: "", label: "Active" },
  { key: "health=RED", label: "At risk" },
  { key: "health=YELLOW", label: "Needs attention" },
  { key: "status=BLOCKED", label: "Blocked" },
  { key: "status=COMPLETED", label: "Completed" },
  { key: "all=1", label: "Everything" },
];

export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; health?: string; all?: string }>;
}) {
  const actor = await requirePortfolioAccess();
  const sp = await searchParams;

  const all = await listProjects(actor, {
    status: sp.status,
    health: sp.health,
    includeArchived: sp.all === "1",
  });

  const rows =
    sp.all === "1" || sp.status || sp.health
      ? all
      : all.filter((p) => !["COMPLETED", "CANCELLED"].includes(p.status));

  const activeKey = sp.health
    ? `health=${sp.health}`
    : sp.status
      ? `status=${sp.status}`
      : sp.all === "1"
        ? "all=1"
        : "";

  const totalTasks = rows.reduce((n, p) => n + p.taskCountTotal, 0);
  const doneTasks = rows.reduce((n, p) => n + p.taskCountDone, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key ? `/admin/projects?${f.key}` : "/admin/projects"}
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
        <div className="flex items-center gap-2 text-[12.5px] text-ink-3">
          <Badge>{rows.length} projects</Badge>
          <Badge>
            {doneTasks}/{totalTasks} tasks done
          </Badge>
        </div>
      </div>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState title="Nothing matches" description="Try a different filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-[11px] uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2 text-left font-semibold">Customer / project</th>
                  <th className="px-4 py-2 text-left font-semibold">Type</th>
                  <th className="px-4 py-2 text-left font-semibold">Lead</th>
                  <th className="px-4 py-2 text-left font-semibold">Progress</th>
                  <th className="px-4 py-2 text-left font-semibold">Go-live</th>
                  <th className="px-4 py-2 text-left font-semibold">Health</th>
                  <th className="px-4 py-2 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const d = daysUntil(p.targetGoLiveDate);
                  const late = d !== null && d < 0 && p.status !== "COMPLETED";
                  return (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                      <td className="px-4 py-2.5">
                        <Link href={`/projects/${p.id}`} className="block max-w-[280px]">
                          <span className="block truncate font-medium text-ink hover:text-brand">
                            {p.customerAccount?.name ?? "Internal"}
                          </span>
                          <span className="block truncate text-[12px] text-ink-3">{p.name}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-[12.5px] capitalize text-ink-2">
                        {p.type.toLowerCase()}
                      </td>
                      <td className="px-4 py-2.5">
                        {p.lead ? (
                          <span className="flex items-center gap-1.5">
                            <Avatar name={p.lead.name} image={p.lead.image} size={20} />
                            <span className="truncate text-[12.5px] text-ink-2">{p.lead.name}</span>
                          </span>
                        ) : (
                          <span className="text-[12.5px] text-ink-3">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="w-[100px]">
                          <div className="mb-1 flex justify-between text-[11.5px] text-ink-3">
                            <span className="tabular-nums">{pctComplete(p.taskCountDone, p.taskCountTotal)}%</span>
                            <span className="tabular-nums">
                              {p.taskCountDone}/{p.taskCountTotal}
                            </span>
                          </div>
                          <ProgressBar value={p.taskCountDone} total={p.taskCountTotal} />
                        </div>
                      </td>
                      <td className={cn("whitespace-nowrap px-4 py-2.5 tabular-nums", late ? "font-medium text-red" : "text-ink-2")}>
                        {p.targetGoLiveDate ? fmtDate(p.targetGoLiveDate) : "—"}
                        {d !== null && p.status !== "COMPLETED" ? (
                          <span className="block text-[11.5px] text-ink-3">
                            {late ? `${Math.abs(d)}d late` : `in ${d}d`}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5">
                        <HealthBadge health={p.health} />
                      </td>
                      <td className="px-4 py-2.5">
                        <ProjectStatusBadge status={p.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
