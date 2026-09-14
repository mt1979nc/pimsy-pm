/**
 * Dump Prism Azure SQL (Team / Customers / Completed / FormerTeam) to JSON.
 *
 * Requires PRISM_SQL_CONNECTION_STRING (ADO.NET / ODBC from the Prism SWA
 * app setting historically named SQL_CONNECTION_STRING). Does not invent
 * credentials. If this host cannot reach pimsy-prism-sql, use the Cloud
 * Shell runbook in v1.11-PRISM-CUTOVER.md instead.
 *
 *   npm run db:dump:prism -- --out /tmp/prism-dump.json
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { parsePrismDump, PRISM_DUMP_VERSION, type PrismDump } from "@/lib/prism-dump";

type MssqlModule = {
  connect: (config: unknown) => Promise<{
    request: () => { query: (sql: string) => Promise<{ recordset: Record<string, unknown>[] }> };
    close: () => Promise<void>;
  }>;
};

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function loadMssql(): Promise<MssqlModule | null> {
  try {
    const mod = (await import("mssql")) as unknown as MssqlModule & { default?: MssqlModule };
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

async function main() {
  const cs = process.env.PRISM_SQL_CONNECTION_STRING?.trim();
  if (!cs) {
    console.error(
      [
        "PRISM_SQL_CONNECTION_STRING is not set.",
        "",
        "Do not invent credentials. Copy SQL_CONNECTION_STRING from the Prism",
        "Static Web App (nice-rock / purple-beach) Application settings, or from",
        "the Azure SQL server pimsy-prism-sql / database prism firewall-allowed client.",
        "",
        "If this machine cannot reach Azure SQL, dump from Azure Cloud Shell",
        "(see v1.11-PRISM-CUTOVER.md) and run:",
        "  npm run db:import:prism -- ./prism-dump.json",
      ].join("\n"),
    );
    process.exit(1);
  }

  const mssql = await loadMssql();
  if (!mssql) {
    console.error(
      "The `mssql` package is not installed. From a network-enabled machine:\n  npm install mssql --no-save\nthen re-run this dump.\n\nOr use scripts/azure-cloud-shell-dump.sh (sqlcmd) as documented in v1.11-PRISM-CUTOVER.md.",
    );
    process.exit(1);
  }

  const pool = await mssql.connect(cs);
  try {
    const team = (await pool.request().query(`SELECT TeamId, Name, HoursPerWeek, Flags FROM dbo.Team`)).recordset;
    const former = (await pool.request().query(`SELECT TeamId, Name FROM dbo.FormerTeam`)).recordset;
    const customers = (
      await pool.request().query(
        `SELECT CustomerId, AccountName, Status, Owner, DockWorkspaceId, Data FROM dbo.Customers`,
      )
    ).recordset;
    let completed: Record<string, unknown>[] = [];
    try {
      completed = (
        await pool.request().query(`SELECT CustomerId, AccountName, Era, Data FROM dbo.CompletedImplementations`)
      ).recordset;
    } catch (err) {
      console.error("CompletedImplementations query failed (continuing without it):", err);
    }

    const dump: PrismDump = parsePrismDump({
      version: PRISM_DUMP_VERSION,
      exportedAt: new Date().toISOString(),
      source: "azure-sql:pimsy-prism-sql/prism",
      team,
      formerTeam: former,
      customers,
      completed,
    });

    const json = `${JSON.stringify(dump, null, 2)}\n`;
    const out = argValue("--out") ?? argValue("-o");
    if (out) {
      const path = resolve(out);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, json, "utf8");
      console.error(`Wrote ${path} (${dump.team.length} team, ${dump.customers.length} customers, ${dump.completed.length} completed)`);
    } else if (hasFlag("--stdout")) {
      process.stdout.write(json);
    } else {
      const fallback = resolve("prism-dump.json");
      writeFileSync(fallback, json, "utf8");
      console.error(`Wrote ${fallback} (${dump.team.length} team, ${dump.customers.length} customers, ${dump.completed.length} completed)`);
    }
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error("Prism SQL dump failed:", err);
  process.exit(1);
});
