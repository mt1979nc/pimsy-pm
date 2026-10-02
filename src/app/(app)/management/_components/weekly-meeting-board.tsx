"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Badge, Button, Card, HealthBadge, ProgressBar, ProjectStatusBadge } from "@/components/ui";
import { RecordSlipForm } from "@/components/record-slip-form";
import { fmtShort, toDateInput } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { WeeklyMeetingSite } from "@/lib/weekly-meeting-types";
import {
  DEFAULT_WEEKLY_MEETING_SORT,
  WEEKLY_MEETING_SORT_OPTIONS,
  sortWeeklyMeetingSites,
  type WeeklyMeetingSort,
} from "@/lib/weekly-meeting-sort";

const healthEdge: Record<WeeklyMeetingSite["health"], string> = {
  GREEN: "border-l-green",
  YELLOW: "border-l-amber",
  RED: "border-l-red",
};

function daysToGoLiveLabel(days: number | null): string {
  if (days == null) return "—";
  if (days === 0) return "Today";
  if (days > 0) return `${days}d`;
  return `${Math.abs(days)}d overdue`;
}

function sinceKickoffLabel(days: number | null): string {
  if (days == null) return "—";
  if (days === 0) return "Today";
  if (days > 0) return `${days}d`;
  return `In ${Math.abs(days)}d`;
}

function lastSlipLabel(site: WeeklyMeetingSite): string {
  const slip = site.lastSlip;
  if (!slip) return "—";
  const sign = slip.days > 0 ? "+" : "";
  const cause = slip.cause === "CUSTOMER" ? "Customer" : slip.cause === "PIMSY" ? "PIMSY" : null;
  return cause ? `${sign}${slip.days}d · ${cause}` : `${sign}${slip.days}d`;
}

function Metric({
  label,
  value,
  title,
  warn,
  className,
}: {
  label: string;
  value: string;
  title?: string;
  warn?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{label}</div>
      <div
        className={cn("truncate text-[13px] text-ink", warn && "font-medium text-red")}
        title={title}
      >
        {value}
      </div>
    </div>
  );
}

export function WeeklyMeetingBoard({
  rows,
  includeExcluded,
  excludedToggle,
}: {
  rows: WeeklyMeetingSite[];
  includeExcluded: boolean;
  excludedToggle: ReactNode;
}) {
  const [sort, setSort] = useState<WeeklyMeetingSort>(DEFAULT_WEEKLY_MEETING_SORT);
  const [openId, setOpenId] = useState<string | null>(null);
  const sorted = sortWeeklyMeetingSites(rows, sort);
  const countLabel = `${rows.length} site${rows.length === 1 ? "" : "s"}${
    includeExcluded ? " · excluded included" : ""
  }`;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-2">{countLabel}</p>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="weekly-meeting-sort" className="text-[12.5px] font-medium text-ink-2">
            Sort
          </label>
          <select
            id="weekly-meeting-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as WeeklyMeetingSort)}
            className="h-8 rounded-lg border border-border-strong bg-surface px-2.5 text-[13px] text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          >
            {WEEKLY_MEETING_SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {excludedToggle}
        </div>
      </div>

      <div className="grid min-w-0 items-stretch gap-3 md:grid-cols-2 2xl:grid-cols-3 [&>*]:min-w-0">
        {sorted.map((row) => (
          <WeeklyMeetingCard
            key={row.id}
            row={row}
            open={openId === row.id}
            onToggle={() => setOpenId((current) => (current === row.id ? null : row.id))}
          />
        ))}
      </div>
    </div>
  );
}

function WeeklyMeetingCard({
  row,
  open,
  onToggle,
}: {
  row: WeeklyMeetingSite;
  open: boolean;
  onToggle: () => void;
}) {
  const goLive = toDateInput(row.targetGoLiveDate);
  const overdue = row.daysToGoLive != null && row.daysToGoLive < 0;
  const kickoffTitle = row.startDate ? `Kickoff ${fmtShort(row.startDate)}` : undefined;
  const panelId = `slip-${row.id}`;

  return (
    <Card className={cn("flex h-full min-w-0 flex-col border-l-4", healthEdge[row.health])}>
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
        <div className="min-w-0">
          <Link
            href={`/projects/${row.id}/settings`}
            title={row.acronym}
            className="block truncate text-[15px] font-semibold tracking-tight text-ink hover:text-brand"
          >
            {row.acronym}
          </Link>
          <p className="truncate text-[12.5px] text-ink-3" title={row.name}>
            {row.name}
          </p>
        </div>
        <HealthBadge health={row.health} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 px-4">
        <ProjectStatusBadge status={row.status} />
        {row.excludeFromAnalytics ? <Badge tone="neutral">Excluded</Badge> : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 px-4">
        <Metric label="Lead" value={row.leadName ?? "—"} title={row.leadName ?? undefined} />
        <Metric label="Go-live" value={fmtShort(row.targetGoLiveDate)} warn={overdue} />
        <Metric label="To go-live" value={daysToGoLiveLabel(row.daysToGoLive)} warn={overdue} />
        <Metric label="Since kickoff" value={sinceKickoffLabel(row.daysSinceKickoff)} title={kickoffTitle} />
        <Metric
          className="col-span-2"
          label="Last slip"
          value={lastSlipLabel(row)}
          title={row.lastSlip?.note ?? undefined}
        />
      </div>

      <div className="mt-3 px-4">
        <div className="mb-1 flex items-baseline justify-between gap-2 text-[12px] text-ink-2">
          <span>Progress</span>
          <span className="tabular-nums">
            {row.taskCountDone}/{row.taskCountTotal} · {row.progressPct}%
          </span>
        </div>
        <ProgressBar value={row.taskCountDone} total={row.taskCountTotal} />
      </div>

      <div className="mt-auto border-t border-border">
        {open ? (
          <div id={panelId} className="space-y-2 bg-surface-2/70 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12.5px] font-medium text-ink">Record slip</p>
              <button
                type="button"
                className="text-[12.5px] font-medium text-ink-3 hover:text-ink"
                aria-expanded="true"
                aria-controls={panelId}
                onClick={onToggle}
              >
                Hide
              </button>
            </div>
            <RecordSlipForm
              projectId={row.id}
              currentGoLive={goLive}
              source="weekly"
              variant="compact"
            />
          </div>
        ) : (
          <div className="px-4 py-2.5">
            <Button
              type="button"
              size="sm"
              variant="primary"
              aria-expanded="false"
              aria-controls={panelId}
              onClick={onToggle}
            >
              Record slip
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
