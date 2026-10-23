/**
 * Backfill daily facts from a folder of morning snapshots. Default is dry-run.
 *
 * Layout (one folder per day, or flat dated names in one directory):
 *
 *   snapshots/2026-09-08/dock-wip.json
 *   snapshots/2026-09-08/dock-threads.json       absent → gap (missing thread data)
 *   snapshots/2026-09-08/delivery-status.json    optional metrics and vsWed
 *   snapshots/2026-09-08/prism.json              optional
 *   snapshots/2026-09-08/prism-live.md           optional (or prism-live-YYYY-MM-DD.md)
 *   snapshots/2026-09-08/zendesk.json            optional
 *
 * A dock-wip.json or dock-threads.json of {"gap":true,"reason":"..."} is a
 * gap row. Counts stay empty. WIP shape comes from each file's fields.
 * Overdue is stored only when the file has it.
 *
 * Do not commit customer snapshots. Keep them outside the repo, or pass an
 * Actions artifact to the "PATH data jobs" workflow. See
 * snapshots/daily-brief/README.md. The committed snapshots/daily-brief
 * folder is only the documented drop location.
 *
 *   npm run db:backfill:daily-brief -- --dir ./snapshots
 *   npm run db:backfill:daily-brief -- --dir ./snapshots --from 2026-09-08 --to 2026-10-23 --apply
 */

import { gapFact, missingWeekdays, normalizeDailyBrief, type DailyFactDraft } from "@/lib/daily-brief";
import { loadDailyBriefDir } from "@/lib/daily-brief-folder";

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

async function main() {
  const dir = arg("--dir");
  if (!dir) {
    console.error("Usage: npm run db:backfill:daily-brief -- --dir ./snapshots [--from YYYY-MM-DD --to YYYY-MM-DD] [--apply]");
    process.exit(1);
  }

  const facts: DailyFactDraft[] = [];
  for (const day of loadDailyBriefDir(dir)) {
    const normalized = normalizeDailyBrief(day.input);
    if (!normalized.ok) {
      console.error(`${day.date}: ${normalized.error}`);
      process.exit(1);
    }
    facts.push(normalized.fact);
  }

  const dates = facts.map((fact) => fact.factDate);
  const from = arg("--from") ?? dates[0];
  const to = arg("--to") ?? dates[dates.length - 1];
  if (from && to) {
    for (const day of missingWeekdays(dates, from, to)) {
      facts.push(gapFact(day));
    }
  }
  facts.sort((a, b) => a.factDate.localeCompare(b.factDate));

  const gaps = facts.filter((fact) => fact.gap).length;
  console.log(`${facts.length} days (${gaps} gaps) from ${dir}`);
  for (const fact of facts) {
    const mark = fact.gap ? "gap" : fact.wipShape;
    console.log(
      `  ${fact.factDate}  ${mark}  wip ${fact.wipSites ?? "—"}  overdue ${fact.overdueTasks ?? "—"}  threads ${fact.openThreads ?? "—"}  load ${fact.prismLoadHours ?? "—"}`,
    );
  }

  if (!process.argv.includes("--apply")) {
    console.log("\nDry-run only. Re-run with --apply to write. Existing other dates are left in place.");
    return;
  }
  const { upsertDailyFact } = await import("@/lib/daily-brief-store");
  for (const fact of facts) await upsertDailyFact(fact);
  console.log(`\nWrote ${facts.length} days.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
