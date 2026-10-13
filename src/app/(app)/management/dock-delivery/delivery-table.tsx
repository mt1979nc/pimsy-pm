"use client";

import { useState } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  DEFAULT_DOCK_SORT,
  groupDockThreads,
  nextDockSort,
  sortDockRows,
  type DockDeliveryTableRow,
  type DockDeliveryTableThread,
  type DockSort,
  type DockSortKey,
} from "@/lib/dock-delivery";

const SORTS: { key: DockSortKey; label: string }[] = [
  { key: "overdue", label: "Late" },
  { key: "pimsy", label: "PIMSY" },
  { key: "customer", label: "Customer" },
  { key: "acronym", label: "Acronym" },
];

function statusTone(status: string | null): "red" | "amber" | "green" | "neutral" {
  const value = (status ?? "").toLowerCase();
  if (value.includes("hot")) return "red";
  if (value.includes("warm")) return "amber";
  if (value.includes("cold") || value.includes("track")) return "green";
  return "neutral";
}

export function DockDeliveryTable({
  rows,
  linkProjects,
}: {
  rows: DockDeliveryTableRow[];
  linkProjects: boolean;
}) {
  const [sort, setSort] = useState<DockSort>(DEFAULT_DOCK_SORT);
  const [open, setOpen] = useState<string | null>(null);
  const ordered = sortDockRows(rows, sort);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]" role="group" aria-label="Sort sites">
        <span className="text-ink-3">Sort</span>
        {SORTS.map((item) => {
          const active = sort.key === item.key;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={active}
              onClick={() => setSort((current) => nextDockSort(current, item.key))}
              className={cn(
                "rounded-full border px-2.5 py-0.5",
                active
                  ? "border-brand bg-brand-soft font-semibold text-ink"
                  : "border-border text-ink-2 hover:bg-surface-2",
              )}
            >
              {item.label}
              {active ? <span aria-hidden>{sort.dir === "asc" ? " ↑" : " ↓"}</span> : null}
            </button>
          );
        })}
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {ordered.map((row) => {
          const expanded = open === row.acronym;
          return (
            <li key={row.acronym}>
              <button
                type="button"
                aria-expanded={expanded}
                aria-label={`${expanded ? "Hide" : "Show"} ${row.acronym}`}
                onClick={() => setOpen(expanded ? null : row.acronym)}
                className="flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left hover:bg-brand-soft/40"
              >
                <Chevron expanded={expanded} />
                <span className="w-16 shrink-0 text-[14px] font-semibold tracking-tight text-ink">
                  {row.acronym}
                  {row.acronymInferred ? (
                    <span className="ml-0.5 text-[11px] font-normal text-ink-3" title="Acronym inferred from the site name">
                      *
                    </span>
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2" title={row.name}>
                  {row.name}
                </span>
                <span className="grid shrink-0 grid-cols-3 gap-x-3 text-right">
                  <Count label="Late" value={row.overdueTaskCount} warn />
                  <Count label="PIMSY" value={row.waitingOnPimsy} tone="amber" />
                  <Count label="Customer" value={row.waitingOnCustomer} />
                </span>
              </button>
              {expanded ? <SiteDetail row={row} linkProjects={linkProjects} /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      className={cn("shrink-0 text-ink-3 transition-transform", expanded && "rotate-90")}
      aria-hidden
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function Count({
  label,
  value,
  warn,
  tone,
}: {
  label: string;
  value: number | null;
  warn?: boolean;
  tone?: "amber";
}) {
  const hot = value != null && value > 0;
  return (
    <span className="min-w-[3.25rem]">
      <span className="block text-[10px] font-medium uppercase tracking-wide text-ink-3">{label}</span>
      <span
        className={cn(
          "block text-[14px] font-semibold tabular-nums leading-tight",
          value == null && "font-normal text-ink-3",
          warn && hot && "text-red",
          tone === "amber" && hot && "text-amber",
        )}
      >
        {value == null ? "—" : value}
      </span>
    </span>
  );
}

function SiteDetail({ row, linkProjects }: { row: DockDeliveryTableRow; linkProjects: boolean }) {
  const groups = groupDockThreads(row.threads);
  const listed = row.threads.length;
  const missing = Math.max(0, row.openThreadCount - listed);
  const owners = row.owners.join(", ");

  return (
    <div className="border-t border-border bg-surface-2/50 px-3 py-3 pl-10">
      <p className="text-[12px] text-ink-3">
        Late {row.overdueTaskCount == null ? "—" : row.overdueTaskCount}
        {row.overdueTaskCount == null ? " · Dock hid this count" : " · overdue in Dock, not imported"}
        {missing > 0 ? ` · Showing ${listed} of ${row.openThreadCount} threads` : ""}
      </p>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Party title="Waiting on PIMSY" threads={groups.pimsy} />
        <Party title="Waiting on customer" threads={groups.customer} />
      </div>
      {groups.unknown.length > 0 ? (
        <div className="mt-4">
          <Party title="Unknown" threads={groups.unknown} />
        </div>
      ) : null}

      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
        <span>{owners || "No owner"}</span>
        <span aria-hidden>·</span>
        {row.status ? <Badge tone={statusTone(row.status)}>{row.status}</Badge> : <span>No status</span>}
        <span aria-hidden>·</span>
        <span>Target {row.targetEnd ?? "—"}</span>
        <span aria-hidden>·</span>
        <PathMatch row={row} linkProjects={linkProjects} />
      </p>
    </div>
  );
}

function Party({ title, threads }: { title: string; threads: DockDeliveryTableThread[] }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{title}</h3>
      {threads.length === 0 ? (
        <p className="mt-1 text-[12.5px] text-ink-3">None</p>
      ) : (
        <ul className="mt-1 space-y-2">
          {threads.map((thread) => (
            <li key={thread.key} className="text-[13px]">
              {thread.url ? (
                <a href={thread.url} target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">
                  {thread.title}
                </a>
              ) : (
                <span className="font-medium text-ink">{thread.title}</span>
              )}
              <p className="text-[12px] text-ink-2">
                {thread.lastPoster ?? "—"}
                {thread.lastActivity ? ` · ${thread.lastActivity}` : ""}
                {thread.type ? ` · ${thread.type}` : ""}
                {thread.internal ? " · Internal" : ""}
              </p>
              {thread.snippet ? <p className="text-[12px] text-ink-3">{thread.snippet}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PathMatch({ row, linkProjects }: { row: DockDeliveryTableRow; linkProjects: boolean }) {
  if (!row.path) return <span>No PATH match</span>;
  const extra = row.path.extra > 0 ? ` +${row.path.extra}` : "";
  const title =
    row.path.extra > 0
      ? `Matched ${row.path.via}. ${row.path.extra} other PATH project${row.path.extra === 1 ? "" : "s"} share this acronym.`
      : `Matched projects.${row.path.via === "crmAcronym" ? "crmAcronym" : "code"}`;
  if (!linkProjects) {
    return (
      <span title={title}>
        PATH {row.path.code}
        {extra}
      </span>
    );
  }
  return (
    <Link href={`/projects/${row.path.id}`} className="font-medium text-brand hover:underline" title={title}>
      PATH {row.path.code}
      {extra}
    </Link>
  );
}
