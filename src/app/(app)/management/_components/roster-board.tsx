"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { EmptyState, inputClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  nextRosterSort,
  parseRosterQuery,
  rosterPeople,
  rosterQueryString,
  viewRosterRows,
  type RosterQuery,
  type RosterSortColumn,
} from "@/lib/roster-view";
import { EngagementRosterTable, type EngagementRow } from "./engagement-roster-table";

export function RosterBoard({
  rows,
  statuses,
}: {
  rows: EngagementRow[];
  statuses: { key: string; label: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const parsed = parseRosterQuery(params);
  const query = statuses.some((status) => status.key === parsed.status) || parsed.status === "all"
    ? parsed
    : { ...parsed, status: "all" };
  const visible = viewRosterRows(rows, query);
  const people = rosterPeople(rows);
  const counts = new Map<string, number>([["all", rows.length]]);
  for (const row of rows) {
    counts.set(row.effectivePrismStatus, (counts.get(row.effectivePrismStatus) ?? 0) + 1);
  }
  const filters = [{ key: "all", label: "All" }, ...statuses];

  function push(next: RosterQuery) {
    router.replace(`/management/engagements${rosterQueryString(next)}`, { scroll: false });
  }

  function sortBy(column: RosterSortColumn) {
    push(nextRosterSort(query, column));
  }

  const dirty = Boolean(query.q || query.owner || query.sort || (query.status && query.status !== "all"));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface-2 p-1">
        {filters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => push({ ...query, status: filter.key })}
            className={cn(
              "rounded-md px-2.5 py-1 text-[12.5px] font-medium",
              query.status === filter.key ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink",
            )}
          >
            {filter.label}
            <span className="ml-1 tabular-nums text-ink-3">{counts.get(filter.key) ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1 text-[12px] text-ink-2">
          Customer or acronym
          <input
            value={query.q}
            onChange={(event) => push({ ...query, q: event.target.value })}
            placeholder="Search"
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="min-w-[10rem] text-[12px] text-ink-2">
          Owner
          <select
            value={query.owner}
            onChange={(event) => push({ ...query, owner: event.target.value })}
            className={`${inputClass} mt-1`}
          >
            <option value="">Any</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        {dirty ? (
          <button
            type="button"
            className="mb-1 text-[12.5px] font-medium text-brand hover:underline"
            onClick={() => push({ q: "", owner: "", status: "all", sort: null, dir: "asc" })}
          >
            Clear
          </button>
        ) : null}
      </div>
      {visible.length === 0 ? (
        <EmptyState title="No implementations in this filter" description="Change the search, or clear it." />
      ) : (
        <EngagementRosterTable rows={visible} sort={query.sort} dir={query.dir} onSort={sortBy} />
      )}
    </div>
  );
}
