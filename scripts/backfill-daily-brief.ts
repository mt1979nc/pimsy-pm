/**
 * Backfill daily facts from a folder of morning snapshots. Default is dry-run.
 *
 * Layout (one folder per day):
 *
 *   snapshots/2026-09-08/dock-wip.json
 *   snapshots/2026-09-08/dock-threads.json
 *   snapshots/2026-09-08/prism.json          optional
 *   snapshots/2026-09-08/zendesk.json        optional
 *
 * Flat names also work: snapshots/dock-wip-2026-09-08.json
 *
 * Weekdays in the span with no folder become gap rows. Weekends are skipped.
 * Sample files were not in the repo when this was added. Do not point this
 * at a live folder until the dry-run looks right.
 *
 *   npm run db:backfill:daily-brief -- --dir ./snapshots
 *   npm run db:backfill:daily-brief -- --dir ./snapshots --from 2026-09-08 --to 2026-10-23 --apply
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { gapFact, missingWeekdays, normalizeDailyBrief, type DailyFactDraft } from "@/lib/daily-brief";
import { upsertDailyFact } from "@/lib/daily-brief-store";

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

const DAY = /^(\d{4}-\d{2}-\d{2})$/;
const FLAT = /^(dock-wip|dock-threads|prism|zendesk)-(\d{4}-\d{2}-\d{2})\.json$/;

function collect(dir: string): Map<string, { wip?: string; threads?: string; prism?: string; zendesk?: string }> {
  const days = new Map<string, { wip?: string; threads?: string; prism?: string; zendesk?: string }>();
  const ensure = (day: string) => {
    const row = days.get(day) ?? {};
    days.set(day, row);
    return row;
  };
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory() && DAY.test(name)) {
      const row = ensure(name);
      const wip = join(path, "dock-wip.json");
      const threads = join(path, "dock-threads.json");
      const prism = join(path, "prism.json");
      const zendesk = join(path, "zendesk.json");
      if (existsSync(wip)) row.wip = wip;
      if (existsSync(threads)) row.threads = threads;
      if (existsSync(prism)) row.prism = prism;
      if (existsSync(zendesk)) row.zendesk = zendesk;
      continue;
    }
    const flat = FLAT.exec(name);
    if (!flat) continue;
    const row = ensure(flat[2]!);
    const kind = flat[1];
    if (kind === "dock-wip") row.wip = path;
    if (kind === "dock-threads") row.threads = path;
    if (kind === "prism") row.prism = path;
    if (kind === "zendesk") row.zendesk = path;
  }
  return days;
}

async function main() {
  const dir = arg("--dir");
  if (!dir) {
    console.error("Usage: npm run db:backfill:daily-brief -- --dir ./snapshots [--from YYYY-MM-DD --to YYYY-MM-DD] [--apply]");
    process.exit(1);
  }

  const found = collect(dir);
  const facts: DailyFactDraft[] = [];
  for (const [day, files] of [...found.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const normalized = normalizeDailyBrief({
      date: day,
      dockWip: files.wip ? readJson(files.wip) : undefined,
      dockThreads: files.threads ? readJson(files.threads) : undefined,
      prism: files.prism ? readJson(files.prism) : undefined,
      zendesk: files.zendesk ? readJson(files.zendesk) : undefined,
    });
    if (!normalized.ok) {
      console.error(`${day}: ${normalized.error}`);
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
    console.log(`  ${fact.factDate}  ${mark}  wip ${fact.wipSites ?? "—"}  overdue ${fact.overdueTasks ?? "—"}  threads ${fact.openThreads ?? "—"}`);
  }

  if (!process.argv.includes("--apply")) {
    console.log("\nDry-run only. Re-run with --apply to write. Existing other dates are left in place.");
    return;
  }
  for (const fact of facts) await upsertDailyFact(fact);
  console.log(`\nWrote ${facts.length} days.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
