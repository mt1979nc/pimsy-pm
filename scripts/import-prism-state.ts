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
import { formatPrismImportPlan } from "@/lib/prism-import-report";

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
        "From Azure Cloud Shell (sqlcmd, no Node mssql package):",
        "  export PRISM_SQL_CONNECTION_STRING='...'   # Prism SWA SQL_CONNECTION_STRING",
        "  python3 scripts/azure-cloud-shell-dump.py prism-dump.json",
        "Then, on a machine that can reach PATH Postgres:",
        "  npm run db:import:prism -- --dry-run ./prism-dump.json",
        "  npm run db:import:prism -- ./prism-dump.json",
        "",
        "Dry-run does not write. Nothing is deleted. Read the match line for each",
        "customer (MATCHED / NEW / AMBIGUOUS / SKIPPED) before applying.",
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

  console.log(formatPrismImportPlan(result));
  console.log(
    `\n${dryRun ? "Would apply" : "Done"} — team ${result.teamUpserted}, customers +${result.customersInserted}/~${result.customersUpdated}, completed +${result.completedInserted}/~${result.completedUpdated}, skipped ${result.skipped}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Prism import failed:", err);
    process.exit(1);
  });
