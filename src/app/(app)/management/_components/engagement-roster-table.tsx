import Link from "next/link";
import { Badge, QuietBlank } from "@/components/ui";
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

function statusTone(s: PrismStatus): "green" | "amber" | "neutral" | "slate" {
  if (s === "active") return "green";
  if (s === "pre-kickoff") return "amber";
  if (s === "pipeline") return "slate";
  return "neutral";
}

function ownersLabel(row: EngagementRow) {
  const primary = row.leadName;
  if (!primary && !row.coLeadName) return null;
  if (!row.coLeadName) return primary;
  if (!primary) return row.coLeadName;
  return `${primary} / ${row.coLeadName} (${row.ownerSplitPercent}/${100 - row.ownerSplitPercent})`;
}

function SheetText({ value, label = "Empty" }: { value: string | number | null | undefined; label?: string }) {
  if (value == null || value === "" || value === "—") return <QuietBlank label={label} />;
  return <>{value}</>;
}

const th = "overflow-hidden break-words px-2 py-2 font-semibold leading-tight text-white";
const td = "overflow-hidden px-2 py-2";

export function EngagementRosterTable({ rows }: { rows: EngagementRow[] }) {
  return (
    <div className="min-w-0 w-full max-w-full overflow-hidden">
      <table className="w-full table-fixed border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-[#0d2f4f] bg-[#113c64] text-[11px] uppercase tracking-wide text-white">
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
              <tr key={row.id} className="hover:bg-brand-soft/70">
                <td className={`${td} truncate font-medium tabular-nums text-ink`} title={row.acronym}>
                  {row.acronym}
                </td>
                <td className={`${td} truncate text-ink-2`} title={customer}>
                  {customer}
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
