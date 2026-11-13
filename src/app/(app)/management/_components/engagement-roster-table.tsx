"use client";

import Link from "next/link";
import { Badge, QuietBlank } from "@/components/ui";
import { fmtShort } from "@/lib/dates";
import { formatRosterSlipDays } from "@/lib/engagement-roster";
import { formatOwnerShares } from "@/lib/co-lead";
import { PRISM_STATUS_LABELS, type PrismStatus } from "@/lib/prism-status";
import type { RosterSortColumn, RosterSortDirection } from "@/lib/roster-view";

export type EngagementRow = {
  id: string;
  acronym: string;
  customerName: string | null;
  name: string;
  leadId: string | null;
  coLeadId: string | null;
  thirdSpecialistId: string | null;
  leadName: string | null;
  coLeadName: string | null;
  thirdSpecialistName: string | null;
  leadSplitPercent: number;
  coLeadSplitPercent: number;
  thirdSplitPercent: number;
  userCount: number | null;
  locationCount: number | null;
  trainingsPerWeek: number | null;
  complexityTier: string | null;
  displayHours: number | null | undefined;
  startDate: Date | string | null;
  initialGoLiveDate: Date | string | null;
  targetGoLiveDate: Date | string | null;
  effectivePrismStatus: PrismStatus;
  prismNote: string | null;
  slipDays: number;
};

function statusTone(s: PrismStatus): "green" | "amber" | "neutral" | "slate" {
  if (s === "active") return "green";
  if (s === "pre-kickoff") return "amber";
  if (s === "pipeline") return "slate";
  return "neutral";
}

function ownersLabel(row: EngagementRow) {
  return formatOwnerShares([
    { name: row.leadName, percent: row.leadSplitPercent },
    { name: row.coLeadName, percent: row.coLeadSplitPercent },
    { name: row.thirdSpecialistName, percent: row.thirdSplitPercent },
  ]);
}

function SheetText({ value, label = "Empty" }: { value: string | number | null | undefined; label?: string }) {
  if (value == null || value === "" || value === "—") return <QuietBlank label={label} />;
  return <>{value}</>;
}

const th = "overflow-hidden break-words px-2 py-2 font-semibold leading-tight text-white";
const td = "overflow-hidden px-2 py-2";

const COLUMNS: { key: RosterSortColumn; label: string; className: string }[] = [
  { key: "acronym", label: "Acronym", className: "w-[9%] text-left" },
  { key: "customer", label: "Customer", className: "text-left" },
  { key: "owners", label: "Owner(s)", className: "w-[12%] text-left" },
  { key: "users", label: "Users", className: "w-[5%] text-right" },
  { key: "locations", label: "Locs", className: "w-[5%] text-right" },
  { key: "complexity", label: "Complexity", className: "w-[8%] text-left" },
  { key: "hours", label: "Est. hrs", className: "w-[6%] text-right" },
  { key: "kickoff", label: "Kickoff", className: "w-[7%] text-left" },
  { key: "initialGoLive", label: "Initial GL", className: "w-[7%] text-left" },
  { key: "goLive", label: "Current GL", className: "w-[7%] text-left" },
  { key: "status", label: "Status", className: "w-[9%] text-left" },
  { key: "slips", label: "Slip days", className: "w-[6%] text-right leading-tight" },
];

export function EngagementRosterTable({
  rows,
  sort,
  dir,
  onSort,
}: {
  rows: EngagementRow[];
  sort: RosterSortColumn | null;
  dir: RosterSortDirection;
  onSort: (column: RosterSortColumn) => void;
}) {
  return (
    <div className="min-w-0 w-full max-w-full overflow-hidden [contain:paint]">
      <table className="w-full min-w-0 table-fixed border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-[#0d2f4f] bg-[#113c64] text-[11px] uppercase tracking-wide text-white">
            {COLUMNS.map((column) => {
              const active = sort === column.key;
              const mark = active ? (dir === "asc" ? " ↑" : " ↓") : "";
              return (
                <th key={column.key} className={`${th} ${column.className}`} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
                  <button
                    type="button"
                    className={`w-full text-inherit hover:underline ${column.className.includes("text-right") ? "text-right" : "text-left"}`}
                    onClick={() => onSort(column.key)}
                  >
                    {column.label}
                    {mark ? <span aria-hidden="true">{mark}</span> : null}
                  </button>
                </th>
              );
            })}
            <th className={`${th} w-[4%] text-right`}> </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const customer = row.customerName ?? row.name;
            const owners = ownersLabel(row);
            return (
              <tr key={row.id} className="hover:bg-brand-soft/70">
                <td className={`${td} truncate font-medium tabular-nums text-ink`} title={row.acronym}>
                  {row.acronym}
                </td>
                <td className={`${td} truncate text-ink-2`} title={customer}>
                  <Link href={`/projects/${row.id}`} className="text-ink hover:text-brand">
                    {customer}
                  </Link>
                </td>
                <td className={`${td} truncate text-ink-2`} title={owners ?? undefined}>
                  <SheetText value={owners} label="No owner" />
                </td>
                <td className={`${td} text-right tabular-nums text-ink-2`}>
                  <SheetText value={row.userCount} label="No users" />
                </td>
                <td className={`${td} text-right tabular-nums text-ink-2`}>
                  <SheetText value={row.locationCount} label="No locations" />
                </td>
                <td className={`${td} truncate text-ink-2`} title={row.complexityTier ?? undefined}>
                  <SheetText value={row.complexityTier} label="No complexity" />
                </td>
                <td className={`${td} text-right tabular-nums text-ink-2`}>
                  <SheetText
                    value={row.displayHours != null ? Number(row.displayHours).toFixed(1) : null}
                    label="No hours"
                  />
                </td>
                <td className={`${td} truncate text-ink-2`} title={row.startDate ? fmtShort(row.startDate) : undefined}>
                  <SheetText value={row.startDate ? fmtShort(row.startDate) : null} label="No kickoff" />
                </td>
                <td className={`${td} truncate text-ink-2`} title={row.initialGoLiveDate ? fmtShort(row.initialGoLiveDate) : undefined}>
                  <SheetText value={row.initialGoLiveDate ? fmtShort(row.initialGoLiveDate) : null} label="No initial go-live" />
                </td>
                <td className={`${td} truncate text-ink-2`} title={row.targetGoLiveDate ? fmtShort(row.targetGoLiveDate) : undefined}>
                  <SheetText value={row.targetGoLiveDate ? fmtShort(row.targetGoLiveDate) : null} label="No current go-live" />
                </td>
                <td className={td}>
                  <div className="flex min-w-0 flex-wrap items-center gap-1">
                    <Badge
                      tone={statusTone(row.effectivePrismStatus)}
                      className="max-w-full overflow-hidden"
                      title={PRISM_STATUS_LABELS[row.effectivePrismStatus]}
                    >
                      <span className="min-w-0 truncate">{PRISM_STATUS_LABELS[row.effectivePrismStatus]}</span>
                    </Badge>
                    {row.prismNote ? (
                      <span title={row.prismNote}>
                        <Badge tone="amber">note</Badge>
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className={`${td} text-right tabular-nums text-ink-2`}>
                  <SheetText value={formatRosterSlipDays(row.slipDays)} label="No slip days" />
                </td>
                <td className={`${td} text-right`}>
                  <Link
                    href={`/management/engagements/${row.id}`}
                    className="font-medium text-brand hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
