import Link from "next/link";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { listCeoBook } from "@/lib/ceo-book-query";
import { summarizeCeoBook } from "@/lib/ceo-book";
import { ExecutiveBookTable } from "../_components/executive-book-table";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Executive — PATH" };

export default async function ExecutiveBookPage({
  searchParams,
}: {
  searchParams: Promise<{ excluded?: string }>;
}) {
  const { excluded } = await searchParams;
  const includeExcluded = excluded === "1" || excluded === "true";
  const rows = await listCeoBook({ includeExcluded });

  return (
    <div className="space-y-4" data-page-width="full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-[13px] leading-relaxed text-ink-2">
          The CEO implementation sheet, read from PATH. Name, abbreviation, product, go-live
          dates, assigned specialist, and the latest project update are live. Contract date,
          expected ARR, and status are saved here. Click a column heading to sort. Empty cells
          stay blank. Pipeline and cancelled
          sites stay on Engagements.
        </p>
        <Link
          href={includeExcluded ? "/management/executive" : "/management/executive?excluded=1"}
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
          title="Executive"
          subtitle={`${rows.length} implementation site${rows.length === 1 ? "" : "s"} · ${summarizeCeoBook(rows)}`}
        />
        {rows.length === 0 ? (
          <EmptyState
            title="No implementation sites on the book"
            description="Archived, cancelled, pipeline, and (by default) analytics-excluded sites are omitted."
          />
        ) : (
          <ExecutiveBookTable rows={rows} />
        )}
      </Card>
    </div>
  );
}
