import Link from "next/link";
import { Card, EmptyState } from "@/components/ui";
import { listWeeklyMeetingSites } from "@/lib/weekly-meeting";
import { WeeklyMeetingBoard } from "../_components/weekly-meeting-board";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Weekly meeting — PATH" };

function ExcludedToggle({ includeExcluded }: { includeExcluded: boolean }) {
  return (
    <Link
      href={includeExcluded ? "/management/weekly" : "/management/weekly?excluded=1"}
      className={cn(
        "inline-flex h-8 items-center rounded-lg border px-2.5 text-[12.5px] font-medium",
        includeExcluded
          ? "border-brand bg-brand-soft text-brand"
          : "border-border bg-surface text-ink-2 hover:text-ink",
      )}
    >
      {includeExcluded ? "Hide excluded" : "Show excluded"}
    </Link>
  );
}

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
      {rows.length === 0 ? (
        <>
          <div className="flex justify-end">
            <ExcludedToggle includeExcluded={includeExcluded} />
          </div>
          <Card>
            <EmptyState
              title="No open implementation sites"
              description="Completed, cancelled, and archived sites are omitted. Excluded test sites stay hidden until you show them."
            />
          </Card>
        </>
      ) : (
        <WeeklyMeetingBoard
          rows={rows}
          includeExcluded={includeExcluded}
          excludedToggle={<ExcludedToggle includeExcluded={includeExcluded} />}
        />
      )}
    </div>
  );
}
