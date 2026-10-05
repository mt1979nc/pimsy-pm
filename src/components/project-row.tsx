import Link from "next/link";
import {
  Badge,
  BrandMark,
  HealthBadge,
  ProjectStatusBadge,
  ProgressBar,
  Avatar,
} from "@/components/ui";
import { customerLogoSrc } from "@/lib/customer-logo";
import { pctComplete } from "@/lib/pct-complete";
import { fmtDate, daysUntil } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { projectHasRcmTrack } from "@/lib/add-rcm";
import { ceoProductType, type CeoProductType } from "@/lib/ceo-book";

type Row = {
  id: string;
  name: string;
  code: string;
  crmAcronym?: string | null;
  status: string;
  health: string;
  targetGoLiveDate: Date | string | null;
  taskCountDone: number;
  taskCountTotal: number;
  playbookPath?: string | null;
  rcmTaskCountTotal?: number | null;
  ehrTaskCountTotal?: number | null;
  sourceProjectId?: string | null;
  customerAccount?: {
    id: string;
    name: string;
    logoUrl?: string | null;
    logoStorageKey?: string | null;
  } | null;
  lead?: { id: string; name: string | null; image?: string | null } | null;
};

/** Shared with the list header so columns stay aligned on a wide page. */
const progressCol = "hidden w-[7rem] shrink-0 sm:block";
const dateCol = "hidden w-[6.5rem] shrink-0 whitespace-nowrap lg:block";
const healthCol = "hidden w-[7.25rem] shrink-0 md:block";
const statusCol = "hidden w-[6.25rem] shrink-0 xl:block";
const leadCol = "w-[30px] shrink-0";

/** Site acronym for list rows — CRM key when present, else project code. */
export function siteAcronym(project: Pick<Row, "crmAcronym" | "code">) {
  const a = project.crmAcronym?.trim();
  return a && a.length > 0 ? a : project.code;
}

export function projectListProductType(project: {
  playbookPath?: string | null;
  rcmTaskCountTotal?: number | null;
  ehrTaskCountTotal?: number | null;
  sourceProjectId?: string | null;
}): CeoProductType {
  return ceoProductType({
    playbookPath: project.playbookPath,
    hasRcmTrack: projectHasRcmTrack({
      playbookPath: project.playbookPath,
      rcmTaskCountTotal: project.rcmTaskCountTotal,
    }),
    ehrTaskCountTotal: project.ehrTaskCountTotal,
    rcmAddedOntoSite: Boolean(project.sourceProjectId),
  });
}

export function ProjectRow({ project, href }: { project: Row; href?: string }) {
  const pct = pctComplete(project.taskCountDone, project.taskCountTotal);
  const days = daysUntil(project.targetGoLiveDate);
  const late = days !== null && days < 0 && project.status !== "COMPLETED";
  const acronym = siteAcronym(project);
  const siteName = project.customerAccount?.name ?? project.name;
  const productType = projectListProductType(project);
  const productTone = productType === "EHR" ? "slate" : "maroon";
  const hoverTitle = [acronym, siteName, project.name !== siteName ? project.name : null, productType]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={href ?? `/projects/${project.id}`}
      title={hoverTitle}
      className="group flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-surface-2"
    >
      {/* Floor keeps a narrow dashboard card from crushing the title to one letter. */}
      <div className="flex min-w-[14rem] max-w-full shrink-0 grow basis-[14rem] items-center gap-3 overflow-hidden">
        <BrandMark
          name={acronym}
          src={customerLogoSrc(project.customerAccount)}
          size={28}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold text-ink group-hover:text-brand">
            {acronym}
          </div>
          <div className="mt-0.5 truncate text-[12.5px] text-ink-3" title={siteName}>
            {siteName}
          </div>
          <div className="mt-1 sm:hidden">
            <Badge tone={productTone}>{productType}</Badge>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-2">
        <div className={progressCol}>
          <div className="mb-1 flex items-baseline justify-between gap-1">
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
          <div className="mt-1.5">
            <Badge tone={productTone}>{productType}</Badge>
          </div>
        </div>

        <div className={dateCol}>
          <div className={cn("text-[12.5px]", late ? "font-medium text-red" : "text-ink-2")}>
            {project.targetGoLiveDate ? fmtDate(project.targetGoLiveDate) : "No date"}
          </div>
          {days !== null && project.status !== "COMPLETED" ? (
            <div className="text-[11.5px] text-ink-3">
              {late ? `${Math.abs(days)}d late` : `in ${days}d`}
            </div>
          ) : null}
        </div>

        <div className={healthCol}>
          <HealthBadge health={project.health as never} />
        </div>

        <div className={statusCol}>
          <ProjectStatusBadge status={project.status as never} />
        </div>

        <div className={leadCol}>
          {project.lead ? (
            <Avatar name={project.lead.name} image={project.lead.image} size={24} />
          ) : (
            <Badge>—</Badge>
          )}
        </div>
      </div>
    </Link>
  );
}

export function ProjectListHeader() {
  return (
    <div className="@container flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
      <div className="flex min-w-[14rem] max-w-full shrink-0 grow basis-[14rem] items-center gap-3">
        <div className="w-7 shrink-0" aria-hidden />
        <div>Site</div>
      </div>
      {/* Labels only while the row stays one line. Below that, chips speak for themselves. */}
      <div className="hidden min-w-0 max-w-full items-center gap-x-2 @min-[46rem]:flex">
        <div className={progressCol}>Progress</div>
        <div className={dateCol}>Go-live</div>
        <div className={healthCol}>Health</div>
        <div className={statusCol}>Status</div>
        <div className={leadCol}>Lead</div>
      </div>
    </div>
  );
}
