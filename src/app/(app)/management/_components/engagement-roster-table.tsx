import Link from "next/link";
import { Badge } from "@/components/ui";
import { fmtShort } from "@/lib/dates";
import { PRISM_STATUS_LABELS, type PrismStatus } from "@/lib/prism-status";
import { SERVICE_LINE_LABELS } from "@/lib/estimator";

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
  serviceLines: string[];
  complexityTier: string | null;
  displayHours: number | null | undefined;
  startDate: Date | string | null;
  initialGoLiveDate: Date | string | null;
  targetGoLiveDate: Date | string | null;
  effectivePrismStatus: PrismStatus;
  prismNote: string | null;
  slipCount: number;
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

function servicesShort(lines: string[]) {
  if (!lines.length) return "—";
  const labels = lines.map((l) => SERVICE_LINE_LABELS[l] ?? l);
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
}

export function EngagementRosterTable({ rows }: { rows: EngagementRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            <th className="px-3 py-2 text-left">Acronym</th>
            <th className="px-3 py-2 text-left">Customer</th>
            <th className="px-3 py-2 text-left">Owner(s)</th>
            <th className="px-3 py-2 text-right">Users</th>
            <th className="px-3 py-2 text-right">Locs</th>
            <th className="px-3 py-2 text-left">Services</th>
            <th className="px-3 py-2 text-left">Complexity</th>
            <th className="px-3 py-2 text-right">Est. hrs</th>
            <th className="px-3 py-2 text-left">Kickoff</th>
            <th className="px-3 py-2 text-left">Initial GL</th>
            <th className="px-3 py-2 text-left">Current GL</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-right">Slip</th>
            <th className="px-3 py-2 text-right"> </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-surface-2/60">
              <td className="px-3 py-2 font-medium tabular-nums text-ink">{row.acronym}</td>
              <td className="max-w-[180px] truncate px-3 py-2 text-ink-2">
                {row.customerName ?? row.name}
              </td>
              <td className="max-w-[160px] truncate px-3 py-2 text-ink-2">{ownersLabel(row)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-2">
                {row.userCount ?? "—"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-2">
                {row.locationCount ?? "—"}
              </td>
              <td className="max-w-[140px] truncate px-3 py-2 text-ink-3" title={servicesShort(row.serviceLines)}>
                {servicesShort(row.serviceLines)}
              </td>
              <td className="px-3 py-2 text-ink-2">{row.complexityTier ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-2">
                {row.displayHours != null ? Number(row.displayHours).toFixed(1) : "—"}
              </td>
              <td className="px-3 py-2 text-ink-2">{fmtShort(row.startDate)}</td>
              <td className="px-3 py-2 text-ink-2">{fmtShort(row.initialGoLiveDate)}</td>
              <td className="px-3 py-2 text-ink-2">{fmtShort(row.targetGoLiveDate)}</td>
              <td className="px-3 py-2">
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
              <td className="px-3 py-2 text-right tabular-nums text-ink-2">
                {row.slipCount || "—"}
              </td>
              <td className="px-3 py-2 text-right">
                <Link
                  href={`/management/engagements/${row.id}`}
                  className="font-medium text-brand hover:underline"
                >
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
