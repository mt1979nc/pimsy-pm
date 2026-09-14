/**
 * Apply a Prism JSON dump to PATH Postgres. Idempotent by acronym / prism_team_id.
 *
 *   npm run db:import:prism -- ./prism-dump.json
 *   npm run db:import:prism -- --dry-run ./prism-dump.json
 *
 * Does not invent credentials. Does not write back to Prism SQL.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parsePrismDumpJson } from "@/lib/prism-dump";
import { applyPrismImport } from "@/lib/prism-import";

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function positionalFile(): string | null {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  return args[0] ?? null;
}

async function main() {
  const file = positionalFile() ?? process.env.PRISM_DUMP_PATH ?? null;
  if (!file) {
    console.error(
      [
        "Usage: npm run db:import:prism -- [--dry-run] <prism-dump.json>",
        "",
        "Produce a dump with:",
        "  PRISM_SQL_CONNECTION_STRING=... npm run db:dump:prism -- --out prism-dump.json",
        "or follow the Azure Cloud Shell steps in v1.11-PRISM-CUTOVER.md.",
      ].join("\n"),
    );
    process.exit(1);
  }

  const text = readFileSync(resolve(file), "utf8");
  const dump = parsePrismDumpJson(text);
  const dryRun = hasFlag("--dry-run") || hasFlag("-n");

  console.log(
    `Prism dump: ${dump.team.length} team, ${dump.formerTeam.length} former, ${dump.customers.length} customers, ${dump.completed.length} completed` +
      (dump.exportedAt ? ` (exported ${dump.exportedAt})` : ""),
  );
  if (dryRun) console.log("Dry run — no writes.\n");

  const result = await applyPrismImport(dump, { dryRun });

  const rows = [...result.team, ...result.customers, ...result.completed];
  for (const row of rows) {
    const mark =
      row.action === "insert" ? "+" : row.action === "update" || row.action === "protect-wip" ? "~" : ".";
    console.log(`  ${mark} [${row.kind}] ${row.key} ${row.action} — ${row.detail}`);
  }
  if (result.warnings.length) {
    console.log("\nWarnings:");
    for (const w of result.warnings) console.log(`  ! ${w}`);
  }
  console.log(
    `\nDone${dryRun ? " (dry-run)" : ""} — team ${result.teamUpserted}, customers +${result.customersInserted}/~${result.customersUpdated}, completed +${result.completedInserted}/~${result.completedUpdated}, skipped ${result.skipped}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Prism import failed:", err);
    process.exit(1);
  });
