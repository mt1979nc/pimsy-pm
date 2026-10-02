import { DockDeliveryTable } from "./delivery-table";
import { EmptyState, Stat } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";
import { loadDockDeliveryBoard } from "@/lib/dock-delivery-store";
import { format } from "date-fns";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dock delivery — Prism" };

export default async function DockDeliveryPage() {
  const board = await loadDockDeliveryBoard();

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-[13px] text-ink-2">
        Active Implementation WIP. Overdue tasks and open threads come from Dock. PATH does not import them.
      </p>

      {!board ? (
        <EmptyState
          title="No Dock snapshot yet"
          description="A weekday scrape posts dock-wip.json and dock-threads.json. Until that runs, this page stays empty."
        />
      ) : (
        <>
          {board.stale ? (
            <div className="rounded-xl border border-transparent bg-amber-soft px-4 py-3 text-[13px] text-amber">
              <strong className="font-semibold">Stale.</strong> Last refresh is more than 24 hours old (
              {fmtDateTime(board.retrievedAt)}).
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Stat label="WIP sites" value={board.counts.sites} />
            <Stat
              label="Overdue"
              value={board.counts.overdueTaskSum ?? "—"}
              hint={
                board.counts.overdueUnknownSites > 0
                  ? `${board.counts.overdueUnknownSites} site${board.counts.overdueUnknownSites === 1 ? "" : "s"} —`
                  : "tasks"
              }
              tone={board.counts.overdueTaskSum != null && board.counts.overdueTaskSum > 0 ? "red" : undefined}
            />
            <Stat label="Open threads" value={board.counts.openThreads} />
            <Stat
              label="On PIMSY"
              value={board.counts.waitingOnPimsy}
              tone={board.counts.waitingOnPimsy > 0 ? "amber" : undefined}
            />
            <Stat label="On customer" value={board.counts.waitingOnCustomer} />
            <Stat
              label="Refreshed"
              value={format(new Date(board.retrievedAt), "MMM d, h:mm a")}
              hint={board.stale ? "Older than 24h" : fmtDateTime(board.retrievedAt)}
              tone={board.stale ? "amber" : undefined}
            />
          </div>

          {board.counts.waitingUnknown > 0 ? (
            <p className="text-[12px] text-ink-3">Unknown waiting-on: {board.counts.waitingUnknown}</p>
          ) : null}

          {board.rows.length === 0 ? (
            <EmptyState title="No active WIP sites" description="The latest snapshot had no sites after the Dock exclusions." />
          ) : (
            <DockDeliveryTable rows={board.rows} />
          )}

          {board.sourceUrl ? (
            <p className="text-[12px] text-ink-3">
              Source{" "}
              <a href={board.sourceUrl} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                Dock view
              </a>
            </p>
          ) : null}
        </>
      )}

      <RefreshHelp />
    </div>
  );
}

function RefreshHelp() {
  return (
    <details className="max-w-2xl text-[12.5px] text-ink-2">
      <summary className="cursor-pointer font-medium text-ink">How to refresh</summary>
      <div className="mt-2 space-y-1.5">
        <p>Scrape runs where a Dock session already exists. PATH does not log in to Dock.</p>
        <p>
          Weekdays, post both JSON files to <code className="text-[12px]">/api/internal/dock-delivery/ingest</code> with{" "}
          <code className="text-[12px]">Authorization: Bearer $DOCK_DELIVERY_INGEST_SECRET</code>. Logic App, cron, or
          the CoS box can do that.
        </p>
        <p>
          Or <code className="text-[12px]">npm run db:ingest:dock-delivery -- --wip dock-wip.json --threads dock-threads.json --apply</code>
        </p>
        <p>PATH links match projects.crmAcronym, then projects.code. A hidden overdue column shows as —.</p>
      </div>
    </details>
  );
}
