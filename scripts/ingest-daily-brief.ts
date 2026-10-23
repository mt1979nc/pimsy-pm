/**
 * Load one morning snapshot into daily_facts. Default is dry-run.
 *
 *   npm run db:ingest:daily-brief -- --date 2026-10-06 --wip dock-wip.json --threads dock-threads.json
 *   npm run db:ingest:daily-brief -- --date 2026-10-06 --wip dock-wip.json --threads dock-threads.json --prism prism.json --zendesk zendesk.json --apply
 *
 * Accepts the pre-Oct 5 and post-Oct 5 Dock WIP shapes. Does not call Dock.
 * Re-applying the same date replaces that date only.
 */

import { readFileSync } from "node:fs";

import { normalizeDailyBrief } from "@/lib/daily-brief";
import { upsertDailyFact } from "@/lib/daily-brief-store";

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function readJson(path: string | null): unknown {
  if (!path) return undefined;
  return JSON.parse(readFileSync(path, "utf8"));
}

async function main() {
  const date = arg("--date");
  const wip = arg("--wip");
  const threads = arg("--threads");
  if (!date && !wip && !threads) {
    console.error(
      [
        "Usage: npm run db:ingest:daily-brief -- --date YYYY-MM-DD --wip dock-wip.json [--threads dock-threads.json] [--prism prism.json] [--zendesk zendesk.json] [--apply]",
        "",
        "Default is dry-run. Nothing is written until --apply.",
      ].join("\n"),
    );
    process.exit(1);
  }

  const normalized = normalizeDailyBrief({
    date,
    dockWip: readJson(wip),
    dockThreads: readJson(threads),
    prism: readJson(arg("--prism")),
    zendesk: readJson(arg("--zendesk")),
  });
  if (!normalized.ok) {
    console.error(normalized.error);
    process.exit(1);
  }

  const fact = normalized.fact;
  console.log(JSON.stringify(fact, null, 2));
  if (!process.argv.includes("--apply")) {
    console.log("\nDry-run only. Re-run with --apply to write this date.");
    return;
  }
  await upsertDailyFact(fact);
  console.log(`\nWrote ${fact.factDate}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
