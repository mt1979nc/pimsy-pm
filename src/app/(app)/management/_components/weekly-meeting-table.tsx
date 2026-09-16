"use client";

import Link from "next/link";
import { Badge, HealthBadge, ProjectStatusBadge, ProgressBar } from "@/components/ui";
import { RecordSlipForm } from "@/components/record-slip-form";
import { fmtShort, toDateInput } from "@/lib/dates";
import type { WeeklyMeetingSite } from "@/lib/weekly-meeting-types";

function daysLabel(days: number | null): string {
  if (days == null) return "—";
  if (days === 0) return "today";
  if (days > 0) return `${days}d`;
  return `${Math.abs(days)}d overdue`;
}

function lastSlipLabel(site: WeeklyMeetingSite): string {
  const slip = site.lastSlip;
  if (!slip) return "—";
  const sign = slip.days > 0 ? "+" : "";
  const cause = slip.cause ? ` · ${slip.cause}` : "";
  return `${sign}${slip.days}d${cause}`;
}

const th = "px-2 py-2 font-semibold";
const td = "px-2 py-2 align-top";

export function WeeklyMeetingTable({ rows }: { rows: WeeklyMeetingSite[] }) {
  return (
    <div className="min-w-0 w-full overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-border bg-surface-2 text-[11px] uppercase tracking-wide text-ink-3">
            <th className={`${th} text-left`}>Site</th>
            <th className={`${th} w-[8rem] text-left`}>Lead</th>
            <th className={`${th} w-[5.5rem] text-left`}>Go-live</th>
            <th className={`${th} w-[6.5rem] text-left`}>Health</th>
            <th className={`${th} w-[6.5rem] text-left`}>Status</th>
            <th className={`${th} w-[7rem] text-left`}>Progress</th>
            <th className={`${th} w-[4.5rem] text-right`}>Days</th>
            <th className={`${th} w-[7.5rem] text-left`}>Last slip</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <WeeklyMeetingRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WeeklyMeetingRow({ row }: { row: WeeklyMeetingSite }) {
  const goLive = toDateInput(row.targetGoLiveDate);
  return (
    <>
      <tr className="hover:bg-surface-2/60">
        <td className={td}>
          <Link
            href={`/projects/${row.id}/settings`}
            className="font-medium text-ink hover:text-brand"
          >
            {row.acronym}
          </Link>
          <div className="truncate text-[12px] text-ink-3" title={row.name}>
            {row.name}
          </div>
          {row.excludeFromAnalytics ? (
            <Badge tone="neutral" className="mt-1">
              Analytics excluded
            </Badge>
          ) : null}
        </td>
        <td className={`${td} text-ink-2`}>{row.leadName ?? "—"}</td>
        <td className={`${td} tabular-nums text-ink-2`}>{fmtShort(row.targetGoLiveDate)}</td>
        <td className={td}>
          <HealthBadge health={row.health} />
        </td>
        <td className={td}>
          <ProjectStatusBadge status={row.status} />
        </td>
        <td className={td}>
          <div className="space-y-1">
            <div className="tabular-nums text-ink-2">
              {row.taskCountDone}/{row.taskCountTotal} · {row.progressPct}%
            </div>
            <ProgressBar value={row.taskCountDone} total={row.taskCountTotal} />
          </div>
        </td>
        <td className={`${td} text-right tabular-nums text-ink-2`}>{daysLabel(row.daysToGoLive)}</td>
        <td className={`${td} text-ink-2`} title={row.lastSlip?.note ?? undefined}>
          {lastSlipLabel(row)}
        </td>
      </tr>
      <tr className="bg-surface-2/40">
        <td colSpan={8} className="px-2 py-2.5">
          <RecordSlipForm
            projectId={row.id}
            currentGoLive={goLive}
            source="weekly"
            variant="compact"
          />
        </td>
      </tr>
    </>
  );
}
