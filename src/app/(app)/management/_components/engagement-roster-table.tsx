import Link from "next/link";
import { Badge } from "@/components/ui";
import { fmtShort } from "@/lib/dates";
import { formatRosterSlipDays } from "@/lib/engagement-roster";
import { PRISM_STATUS_LABELS, type PrismStatus } from "@/lib/prism-status";

export type EngagementRow = {
  id: string;
  acronym: string;
  customerName: string | null;
  name: string;
  leadName: string | null;
  coLeadName: string | null;
  ownerSplitPercent: number;
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

function statusTone(s: PrismStatus): "green" | "amber" | "neutral" | "violet" {
  if (s === "active") return "green";
  if (s === "pre-kickoff") return "amber";
  if (s === "pipeline") return "violet";
  return "neutral";
}

function ownersLabel(row: EngagementRow) {
  const primary = row.leadName ?? "—";
  if (!row.coLeadName) return primary;
  return `${primary} / ${row.coLeadName} (${row.ownerSplitPercent}/${100 - row.ownerSplitPercent})`;
}

const th = "px-2 py-2 font-semibold";
const td = "px-2 py-2";

export function EngagementRosterTable({ rows }: { rows: EngagementRow[] }) {
  return (
    <div className="min-w-0 w-full">
      <table className="w-full table-fixed border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-border bg-surface-2 text-[11px] uppercase tracking-wide text-ink-3">
            <th className={`${th} w-[5.25rem] text-left`}>Acronym</th>
            <th className={`${th} text-left`}>Customer</th>
            <th className={`${th} w-[8rem] text-left`}>Owner(s)</th>
            <th className={`${th} w-11 text-right`}>Users</th>
            <th className={`${th} w-9 text-right`}>Locs</th>
            <th className={`${th} w-[5.25rem] text-left`}>Complexity</th>
            <th className={`${th} w-[3.75rem] text-right`}>Est. hrs</th>
            <th className={`${th} w-16 text-left`}>Kickoff</th>
            <th className={`${th} w-16 text-left`}>Initial GL</th>
            <th className={`${th} w-16 text-left`}>Current GL</th>
            <th className={`${th} w-[5.75rem] text-left`}>Status</th>
            <th className={`${th} w-16 text-right leading-tight`}>Slip days</th>
            <th className={`${th} w-10 text-right`}> </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const customer = row.customerName ?? row.name;
            const owners = ownersLabel(row);
            return (
              <tr key={row.id} className="hover:bg-surface-2/60">
                <td className={`${td} truncate font-medium tabular-nums text-ink`} title={row.acronym}>
                  {row.acronym}
                </td>
                <td className={`${td} truncate text-ink-2`} title={customer}>
                  {customer}
                </td>
                <td className={`${td} truncate text-ink-2`} title={owners}>
                  {owners}
                </td>
                <td className={`${td} text-right tabular-nums text-ink-2`}>
                  {row.userCount ?? "—"}
                </td>
                <td className={`${td} text-right tabular-nums text-ink-2`}>
                  {row.locationCount ?? "—"}
                </td>
                <td className={`${td} truncate text-ink-2`} title={row.complexityTier ?? undefined}>
                  {row.complexityTier ?? "—"}
                </td>
                <td className={`${td} text-right tabular-nums text-ink-2`}>
                  {row.displayHours != null ? Number(row.displayHours).toFixed(1) : "—"}
                </td>
                <td className={`${td} whitespace-nowrap text-ink-2`}>{fmtShort(row.startDate)}</td>
                <td className={`${td} whitespace-nowrap text-ink-2`}>{fmtShort(row.initialGoLiveDate)}</td>
                <td className={`${td} whitespace-nowrap text-ink-2`}>{fmtShort(row.targetGoLiveDate)}</td>
                <td className={td}>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge tone={statusTone(row.effectivePrismStatus)}>
                      {PRISM_STATUS_LABELS[row.effectivePrismStatus]}
                    </Badge>
                    {row.prismNote ? (
                      <span title={row.prismNote}>
                        <Badge tone="amber">note</Badge>
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className={`${td} text-right tabular-nums text-ink-2`}>
                  {formatRosterSlipDays(row.slipDays)}
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
