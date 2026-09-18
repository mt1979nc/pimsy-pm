import Link from "next/link";
import { Card, CardHeader, EmptyState, LinkButton, VisibilityBadge } from "@/components/ui";
import { fmtDate, fmtShort } from "@/lib/dates";
import type { AggregatedRecording } from "@/lib/recordings";

function sessionDate(row: AggregatedRecording): string | null {
  if (row.sessionAt) return fmtDate(row.sessionAt);
  if (row.postedAt.getTime() > 0) return fmtShort(row.postedAt);
  return null;
}

export function RecordingsList({
  recordings,
  subtitle,
  emptyTitle,
  emptyDescription,
  taskHref,
  showVisibility = false,
}: {
  recordings: AggregatedRecording[];
  subtitle?: string;
  emptyTitle: string;
  emptyDescription?: string;
  taskHref?: (taskId: string) => string;
  showVisibility?: boolean;
}) {
  return (
    <Card>
      <CardHeader title="Recordings" subtitle={subtitle} />
      {recordings.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="divide-y divide-border">
          {recordings.map((row) => {
            const date = sessionDate(row);
            const sessionHref = row.taskId && taskHref ? taskHref(row.taskId) : null;
            return (
              <div key={row.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-ink">{row.title}</div>
                  {row.sessionLabel || date ? (
                    <div className="mt-0.5 truncate text-[12px] text-ink-3">
                      {row.sessionLabel ? (
                        sessionHref ? (
                          <Link href={sessionHref} className="hover:text-brand hover:underline">
                            {row.sessionLabel}
                          </Link>
                        ) : (
                          row.sessionLabel
                        )
                      ) : null}
                      {row.sessionLabel && date ? " · " : null}
                      {date}
                    </div>
                  ) : null}
                </div>
                {showVisibility ? <VisibilityBadge visibility={row.visibility} /> : null}
                <LinkButton
                  href={row.url}
                  size="sm"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0"
                >
                  Open
                </LinkButton>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
