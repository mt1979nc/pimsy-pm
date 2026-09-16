import Link from "next/link";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { listWeeklyMeetingSites } from "@/lib/weekly-meeting";
import { WeeklyMeetingTable } from "../_components/weekly-meeting-table";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Weekly meeting — PATH" };

export default async function WeeklyMeetingPage({
  searchParams,
}: {
  searchParams: Promise<{ excluded?: string }>;
}) {
  const { excluded } = await searchParams;
  const includeExcluded = excluded === "1" || excluded === "true";
  const rows = await listWeeklyMeetingSites({ includeExcluded });

  return (
    <div className="space-y-4" data-page-width="full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-[13px] leading-relaxed text-ink-2">
          Active Implementation sites for the weekly meeting. Open statuses only
          (not started, in progress, on hold, blocked). Analytics-excluded test/E2E
          rows are hidden unless you toggle them on. Record a slip on a row without
          opening each project&apos;s settings.
        </p>
        <Link
          href={includeExcluded ? "/management/weekly" : "/management/weekly?excluded=1"}
          className={cn(
            "rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium",
            includeExcluded
              ? "border-brand bg-brand-soft text-brand"
              : "border-border bg-surface text-ink-2 hover:text-ink",
          )}
        >
          {includeExcluded ? "Hide analytics-excluded" : "Show analytics-excluded"}
        </Link>
      </div>
      <Card className="min-w-0">
        <CardHeader
          title="Weekly meeting"
          subtitle={`${rows.length} open implementation site${rows.length === 1 ? "" : "s"}${
            includeExcluded ? " (including analytics-excluded)" : ""
          }`}
        />
        {rows.length === 0 ? (
          <EmptyState
            title="No open implementation sites"
            description="Completed, cancelled, archived, and (by default) analytics-excluded sites are omitted."
          />
        ) : (
          <WeeklyMeetingTable rows={rows} />
        )}
      </Card>
    </div>
  );
}
