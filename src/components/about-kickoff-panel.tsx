import Link from "next/link";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import type { KickoffSnapshot } from "@/lib/about-profile";

const STATUS_LABEL: Record<string, string> = {
  TODO: "Not started",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  IN_REVIEW: "In review",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export function AboutKickoffPanel({
  kickoffDate,
  goLiveDate,
  zoomBookingUrl,
  crmAcronym,
  kickoff,
  projectId,
  staffLinks,
}: {
  kickoffDate: Date | string | null;
  goLiveDate: Date | string | null;
  zoomBookingUrl: string | null;
  crmAcronym: string | null;
  kickoff: KickoffSnapshot;
  projectId: string;
  staffLinks: boolean;
}) {
  return (
    <div className="space-y-4 p-5">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-[11.5px] uppercase tracking-wide text-ink-3">Kickoff</dt>
          <dd className="mt-0.5 text-[14px] font-medium text-ink">{fmtDate(kickoffDate)}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] uppercase tracking-wide text-ink-3">Go-live</dt>
          <dd className="mt-0.5 text-[14px] font-medium text-ink">{fmtDate(goLiveDate)}</dd>
        </div>
        {crmAcronym ? (
          <div>
            <dt className="text-[11.5px] uppercase tracking-wide text-ink-3">Account</dt>
            <dd className="mt-0.5 text-[14px] font-medium text-ink">{crmAcronym}</dd>
          </div>
        ) : null}
        {zoomBookingUrl ? (
          <div>
            <dt className="text-[11.5px] uppercase tracking-wide text-ink-3">Book a call</dt>
            <dd className="mt-0.5">
              <a
                href={zoomBookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[14px] font-medium text-brand hover:underline"
              >
                Open booking page
              </a>
            </dd>
          </div>
        ) : null}
      </dl>

      {kickoff.items.length > 0 ? (
        <div>
          <div className="mb-2 text-[11.5px] uppercase tracking-wide text-ink-3">
            {kickoff.phaseName ?? "Kickoff"}
          </div>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {kickoff.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                {staffLinks ? (
                  <Link
                    href={`/projects/${projectId}/tasks/${item.id}`}
                    className="min-w-0 truncate text-[13.5px] text-ink hover:text-brand"
                  >
                    {item.title}
                  </Link>
                ) : (
                  <span className="min-w-0 truncate text-[13.5px] text-ink">{item.title}</span>
                )}
                <Badge tone={item.status === "DONE" ? "green" : item.status === "BLOCKED" ? "red" : "amber"}>
                  {STATUS_LABEL[item.status] ?? item.status}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
