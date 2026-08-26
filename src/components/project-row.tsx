import Link from "next/link";
import {
  Badge,
  HealthBadge,
  ProjectStatusBadge,
  ProgressBar,
  Avatar,
} from "@/components/ui";
import { pctComplete } from "@/lib/rollup";
import { fmtDate, daysUntil } from "@/lib/dates";
import { cn } from "@/lib/cn";

type Row = {
  id: string;
  name: string;
  code: string;
  status: string;
  health: string;
  targetGoLiveDate: Date | string | null;
  taskCountDone: number;
  taskCountTotal: number;
  customerAccount?: { id: string; name: string } | null;
  lead?: { id: string; name: string | null; image?: string | null } | null;
};

export function ProjectRow({ project, href }: { project: Row; href?: string }) {
  const pct = pctComplete(project.taskCountDone, project.taskCountTotal);
  const days = daysUntil(project.targetGoLiveDate);
  const late = days !== null && days < 0 && project.status !== "COMPLETED";

  return (
    <Link
      href={href ?? `/projects/${project.id}`}
      className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-2"
    >
      <div className="min-w-0 flex-[2.2]">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-medium text-ink group-hover:text-brand">
            {project.name}
          </span>
          <span className="shrink-0 font-mono text-[11px] text-ink-3">{project.code}</span>
        </div>
        <div className="mt-0.5 truncate text-[12.5px] text-ink-3">
          {project.customerAccount?.name ?? "Internal project"}
        </div>
      </div>

      <div className="hidden w-[110px] shrink-0 sm:block">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[11.5px] font-medium text-ink-2">{pct}%</span>
          <span className="text-[11px] text-ink-3">
            {project.taskCountDone}/{project.taskCountTotal}
          </span>
        </div>
        <ProgressBar
          value={project.taskCountDone}
          total={project.taskCountTotal}
          tone={pct === 100 ? "green" : "brand"}
        />
      </div>

      <div className="hidden w-[128px] shrink-0 lg:block">
        <div className={cn("text-[12.5px]", late ? "font-medium text-red" : "text-ink-2")}>
          {project.targetGoLiveDate ? fmtDate(project.targetGoLiveDate) : "No date"}
        </div>
        {days !== null && project.status !== "COMPLETED" ? (
          <div className="text-[11.5px] text-ink-3">
            {late ? `${Math.abs(days)}d late` : `in ${days}d`}
          </div>
        ) : null}
      </div>

      <div className="hidden w-[130px] shrink-0 md:block">
        <HealthBadge health={project.health as never} />
      </div>

      <div className="hidden w-[104px] shrink-0 xl:block">
        <ProjectStatusBadge status={project.status as never} />
      </div>

      <div className="w-[30px] shrink-0">
        {project.lead ? (
          <Avatar name={project.lead.name} image={project.lead.image} size={24} />
        ) : (
          <Badge>—</Badge>
        )}
      </div>
    </Link>
  );
}

export function ProjectListHeader() {
  return (
    <div className="flex items-center gap-4 border-b border-border bg-surface-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
      <div className="flex-[2.2]">Project</div>
      <div className="hidden w-[110px] shrink-0 sm:block">Progress</div>
      <div className="hidden w-[128px] shrink-0 lg:block">Go-live</div>
      <div className="hidden w-[130px] shrink-0 md:block">Health</div>
      <div className="hidden w-[104px] shrink-0 xl:block">Status</div>
      <div className="w-[30px] shrink-0">Lead</div>
    </div>
  );
}
