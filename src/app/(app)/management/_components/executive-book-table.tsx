"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { updateCeoBookFields } from "@/actions/management-executive";
import { Badge } from "@/components/ui";
import { CEO_STATUSES, CEO_STATUS_LABELS, parseExpectedArr, type CeoBookRow } from "@/lib/ceo-book";
import { cn } from "@/lib/cn";

const th = "sticky top-0 z-10 bg-surface-2 px-2 py-2 text-left align-bottom font-semibold whitespace-normal";
const td = "px-2 py-2 align-top";
const cellInput =
  "h-7 w-full min-w-0 rounded border border-transparent bg-transparent px-1 text-[12.5px] text-ink hover:border-border focus:border-brand focus:bg-surface focus:outline-none";

function statusClass(status: string): string {
  if (status === "IN_PROCESS_OFF_TRACK") return "text-red";
  if (status === "IN_PROCESS_ON_TRACK" || status === "LIVE") return "text-green";
  if (status === "PAUSED") return "text-amber";
  return "text-ink";
}

function ExecutiveRow({ row }: { row: CeoBookRow }) {
  const [state, action, pending] = useActionState(updateCeoBookFields, {});
  const [contractDate, setContractDate] = useState(row.contractDateInput);
  const [contractFocused, setContractFocused] = useState(false);
  const [expectedArr, setExpectedArr] = useState(row.expectedArrInput);
  const [ceoStatus, setCeoStatus] = useState(row.ceoStatus ?? "");
  const savedArr = parseExpectedArr(row.expectedArrInput);
  const editedArr = parseExpectedArr(expectedArr);
  const arrDirty =
    !savedArr.ok || !editedArr.ok
      ? expectedArr.trim() !== row.expectedArrInput.trim()
      : savedArr.value !== editedArr.value;
  const dirty =
    contractDate !== row.contractDateInput || arrDirty || ceoStatus !== (row.ceoStatus ?? "");

  return (
    <>
      <tr className="hover:bg-surface-2/60">
        <td className={td}>
          <Link href={`/projects/${row.id}`} className="font-medium text-ink hover:text-brand">
            {row.name}
          </Link>
        </td>
        <td className={`${td} font-medium text-ink`}>
          <Link href={`/management/engagements/${row.id}`} className="hover:text-brand">
            {row.abbreviation}
          </Link>
          {row.excludeFromAnalytics ? (
            <Badge tone="neutral" className="mt-1">
              Analytics excluded
            </Badge>
          ) : null}
        </td>
        <td className={`${td} whitespace-nowrap text-ink-2`}>{row.productType}</td>
        <td className={td}>
          <div className="relative w-[8.75rem]">
            <input
              type="date"
              name="contractDate"
              aria-label={`Contract date for ${row.abbreviation}`}
              value={contractDate}
              onChange={(event) => setContractDate(event.target.value)}
              onFocus={() => setContractFocused(true)}
              onBlur={() => setContractFocused(false)}
              disabled={pending}
              className={cn(
                cellInput,
                "tabular-nums",
                !contractDate && !contractFocused && "text-transparent",
              )}
            />
            {!contractDate && !contractFocused ? (
              <span className="pointer-events-none absolute inset-y-0 left-1 flex items-center text-ink-3">
                —
              </span>
            ) : null}
          </div>
        </td>
        <td className={td}>
          <input
            name="expectedArr"
            inputMode="decimal"
            aria-label={`Expected ARR for ${row.abbreviation}`}
            placeholder="—"
            value={expectedArr}
            onChange={(event) => setExpectedArr(event.target.value)}
            disabled={pending}
            className={cn(cellInput, "w-[6.5rem] tabular-nums")}
          />
        </td>
        <td className={`${td} whitespace-nowrap tabular-nums text-ink-2`}>{row.initialGoLive}</td>
        <td className={`${td} whitespace-nowrap tabular-nums text-ink-2`}>{row.currentGoLive}</td>
        <td className={`${td} whitespace-nowrap tabular-nums text-ink-2`}>{row.actualGoLive}</td>
        <td className={`${td} min-w-[8rem] text-ink-2`}>{row.assignedIs}</td>
        <td className={td}>
          <div className="flex items-center gap-1.5">
            <select
              name="ceoStatus"
              aria-label={`Status for ${row.abbreviation}`}
              value={ceoStatus}
              onChange={(event) => setCeoStatus(event.target.value)}
              disabled={pending}
              className={cn(cellInput, "w-[11.5rem]", statusClass(ceoStatus))}
            >
              <option value="">—</option>
              {CEO_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {CEO_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            {dirty ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const data = new FormData();
                  data.set("projectId", row.id);
                  data.set("contractDate", contractDate);
                  data.set("expectedArr", expectedArr);
                  data.set("ceoStatus", ceoStatus);
                  action(data);
                }}
                className="h-7 shrink-0 rounded-md bg-[#113c64] px-2 text-[12px] font-medium text-white hover:bg-[#0d2f4f] disabled:opacity-60"
              >
                {pending ? "Saving" : "Save"}
              </button>
            ) : null}
          </div>
        </td>
        <td className={`${td} max-w-[18rem] text-ink-2`}>
          {row.commentPreview ? (
            <Link
              href={`/projects/${row.id}`}
              title={row.commentFull ?? undefined}
              className="line-clamp-2 hover:text-brand"
            >
              {row.commentPreview}
            </Link>
          ) : (
            "—"
          )}
        </td>
        <td className={td}>
          <Link href={`/projects/${row.id}`} className="font-medium text-brand hover:underline">
            Open
          </Link>
        </td>
      </tr>
      {state.error ? (
        <tr>
          <td colSpan={12} className="px-2 pb-2 text-[12px] text-red" role="alert">
            {row.abbreviation}: {state.error}
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function ExecutiveBookTable({ rows }: { rows: CeoBookRow[] }) {
  return (
    <div className="min-w-0 w-full overflow-x-auto">
      <table className="w-full min-w-[1280px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-wide text-ink-3">
            <th className={th}>Name</th>
            <th className={`${th} w-[7rem]`}>Abbreviation</th>
            <th className={`${th} w-[6.5rem]`}>Product type</th>
            <th className={`${th} w-[9rem]`}>Contract Date</th>
            <th className={`${th} w-[7rem]`}>Expected ARR</th>
            <th className={`${th} w-[8.5rem]`}>Initial Go Live Target</th>
            <th className={`${th} w-[8.5rem]`}>Current Go Live Target</th>
            <th className={`${th} w-[7.5rem]`}>Actual Go Live</th>
            <th className={`${th} w-[9rem]`}>Assigned IS</th>
            <th className={`${th} w-[14rem]`}>Status</th>
            <th className={`${th} w-[18rem]`}>Comments</th>
            <th className={`${th} w-[4.5rem]`}>PATH</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <ExecutiveRow
              key={`${row.id}|${row.contractDateInput}|${row.expectedArrInput}|${row.ceoStatus ?? ""}`}
              row={row}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
