"use client";

import { useState } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  DEFAULT_DOCK_SORT,
  nextDockSort,
  sortDockRows,
  type DockDeliveryTableRow,
  type DockSort,
  type DockSortKey,
  type DockWaitingOn,
} from "@/lib/dock-delivery";

const COLUMNS: { key: DockSortKey; label: string; align?: "right" }[] = [
  { key: "acronym", label: "Acronym" },
  { key: "name", label: "Site" },
  { key: "overdue", label: "Overdue", align: "right" },
  { key: "threads", label: "Threads", align: "right" },
  { key: "pimsy", label: "On PIMSY", align: "right" },
  { key: "customer", label: "On customer", align: "right" },
  { key: "status", label: "Status" },
  { key: "owners", label: "Owners" },
];

function statusTone(status: string | null): "red" | "amber" | "green" | "neutral" {
  const value = (status ?? "").toLowerCase();
  if (value.includes("hot")) return "red";
  if (value.includes("warm")) return "amber";
  if (value.includes("cold") || value.includes("track")) return "green";
  return "neutral";
}

function waitingLabel(waiting: DockWaitingOn): string {
  if (waiting === "pimsy") return "PIMSY";
  if (waiting === "customer") return "Customer";
  return "Unknown";
}

function Count({ value, warn }: { value: number | null; warn?: boolean }) {
  if (value == null) return <span className="text-ink-3">—</span>;
  return <span className={cn(warn && value > 0 && "font-semibold text-red")}>{value}</span>;
}

export function DockDeliveryTable({ rows }: { rows: DockDeliveryTableRow[] }) {
  const [sort, setSort] = useState<DockSort>(DEFAULT_DOCK_SORT);
  const [open, setOpen] = useState<string | null>(null);
  const ordered = sortDockRows(rows, sort);

  return (
    <div className="min-w-0 w-full max-w-full overflow-x-auto [contain:paint]">
      <table className="w-full min-w-[52rem] border-collapse text-[13px]">
        <thead>
          <tr className="bg-[#113c64] text-left text-[11px] font-semibold text-white">
            <th className="w-8 px-2 py-2" aria-label="Threads" />
            {COLUMNS.map((column) => {
              const active = sort.key === column.key;
              return (
                <th
                  key={column.key}
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                  className={cn("px-2 py-2 font-semibold", column.align === "right" && "text-right")}
                >
                  <button
                    type="button"
                    onClick={() => setSort((current) => nextDockSort(current, column.key))}
                    className="inline-flex items-center gap-1 bg-transparent text-white hover:underline"
                  >
                    {column.label}
                    {active ? <span aria-hidden>{sort.dir === "asc" ? "↑" : "↓"}</span> : null}
                  </button>
                </th>
              );
            })}
            <th className="px-2 py-2 font-semibold">PATH</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((row) => {
            const expanded = open === row.acronym;
            return (
              <Row
                key={row.acronym}
                row={row}
                expanded={expanded}
                onToggle={() => setOpen(expanded ? null : row.acronym)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  row,
  expanded,
  onToggle,
}: {
  row: DockDeliveryTableRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const owners = row.owners.join(", ");
  return (
    <>
      <tr className="border-b border-border hover:bg-brand-soft/50">
        <td className="px-2 py-2 align-top">
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? "Hide" : "Show"} threads for ${row.acronym}`}
            onClick={onToggle}
            className="flex h-6 w-6 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              className={cn("transition-transform", expanded && "rotate-90")}
              aria-hidden
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        </td>
        <td className="px-2 py-2 align-top font-medium text-ink">
          {row.acronym}
          {row.acronymInferred ? (
            <span className="ml-1 text-[11px] font-normal text-ink-3" title="Acronym inferred from the site name">
              *
            </span>
          ) : null}
        </td>
        <td className="max-w-[16rem] px-2 py-2 align-top">
          <div className="truncate font-medium text-ink" title={row.name}>
            {row.name}
          </div>
        </td>
        <td className="px-2 py-2 text-right align-top">
          <Count value={row.overdueTaskCount} warn />
        </td>
        <td className="px-2 py-2 text-right align-top">{row.openThreadCount}</td>
        <td className="px-2 py-2 text-right align-top">
          <span className={cn(row.waitingOnPimsy > 0 && "font-semibold text-amber")}>{row.waitingOnPimsy}</span>
        </td>
        <td className="px-2 py-2 text-right align-top">{row.waitingOnCustomer}</td>
        <td className="px-2 py-2 align-top">
          {row.status ? <Badge tone={statusTone(row.status)}>{row.status}</Badge> : <span className="text-ink-3">—</span>}
        </td>
        <td className="max-w-[10rem] px-2 py-2 align-top text-ink-2">
          <div className="truncate" title={owners || undefined}>
            {owners || "—"}
          </div>
        </td>
        <td className="px-2 py-2 align-top">
          {row.path ? (
            <Link
              href={`/projects/${row.path.id}`}
              className="font-medium text-brand hover:underline"
              title={
                row.path.extra > 0
                  ? `Matched ${row.path.via}. ${row.path.extra} other PATH project${row.path.extra === 1 ? "" : "s"} share this acronym.`
                  : `Matched projects.${row.path.via === "crmAcronym" ? "crmAcronym" : "code"}`
              }
            >
              {row.path.code}
              {row.path.extra > 0 ? <span className="ml-1 text-[11px] text-ink-3">+{row.path.extra}</span> : null}
            </Link>
          ) : (
            <span className="text-ink-3">—</span>
          )}
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-border bg-surface-2/60">
          <td colSpan={10} className="px-3 py-3">
            <ThreadList row={row} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ThreadList({ row }: { row: DockDeliveryTableRow }) {
  const listed = row.threads.length;
  const missing = Math.max(0, row.openThreadCount - listed);
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-ink-3">
        Target {row.targetEnd ?? "—"}
        {row.waitingUnknown > 0 ? ` · Unknown ${row.waitingUnknown}` : ""}
        {missing > 0 ? ` · Showing ${listed} of ${row.openThreadCount}` : ""}
      </p>
      {listed === 0 ? (
        <p className="text-[13px] text-ink-2">No open threads in this snapshot.</p>
      ) : (
        <ul className="space-y-2">
          {row.threads.map((thread) => (
            <li key={thread.key} className="text-[13px]">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                {thread.url ? (
                  <a href={thread.url} target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">
                    {thread.title}
                  </a>
                ) : (
                  <span className="font-medium text-ink">{thread.title}</span>
                )}
                <span className="text-[12px] text-ink-3">{waitingLabel(thread.waitingOn)}</span>
                {thread.type ? <span className="text-[12px] text-ink-3">{thread.type}</span> : null}
                {thread.lastActivity ? <span className="text-[12px] text-ink-3">{thread.lastActivity}</span> : null}
                {thread.internal ? <Badge tone="neutral">Internal</Badge> : null}
              </div>
              <p className="text-[12px] text-ink-2">
                {thread.lastPoster ?? "—"}
                {thread.snippet ? ` — ${thread.snippet}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
