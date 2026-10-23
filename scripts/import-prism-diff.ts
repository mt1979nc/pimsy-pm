/**
 * Diff a Prism SQL dump against PATH, then optionally upsert.
 *
 * Prism SQL is the source for customers, slips, and completed work.
 * PATH Postgres is the source for users and logins. This script does not
 * connect to Prism. Produce the dump first, then diff. Default is dry-run.
 * PATH-only rows are reported and are not deleted.
 *
 *   npm run db:dump:prism -- --out prism-dump.json
 *   npm run db:import:prism-diff -- ./prism-dump.json
 *   npm run db:import:prism-diff -- --apply ./prism-dump.json
 *
 * Do not run this until the dry-run report has been read. --apply is an
 * idempotent upsert (acronym / prism team id). It does not drop tables.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { projects, slipEvents, users } from "@/db/schema";
import { utcDayKey } from "@/lib/dates";
import { applyPrismImport } from "@/lib/prism-import";
import {
  diffPrismBooks,
  formatPrismDiffReport,
  prismBookFromDump,
  type PrismBook,
} from "@/lib/prism-import-diff";
import { acronymKey, parsePrismDumpJson } from "@/lib/prism-dump";

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function positionalFile(): string | null {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  return args[0] ?? null;
}

function day(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return utcDayKey(date);
}

async function loadPathBook(): Promise<PrismBook> {
  const [staff, sites, slips] = await Promise.all([
    db.query.users.findMany({
      where: ne(users.role, "CUSTOMER"),
      columns: {
        name: true,
        email: true,
        prismTeamId: true,
        capacityHoursPerWeek: true,
        canLead: true,
        capacityExempt: true,
        isDirector: true,
        isActive: true,
      },
    }),
    db.query.projects.findMany({
      where: eq(projects.type, "IMPLEMENTATION"),
      columns: {
        id: true,
        code: true,
        crmAcronym: true,
        prismStatus: true,
        status: true,
        ownerSplitPercent: true,
        startDate: true,
        targetGoLiveDate: true,
        initialGoLiveDate: true,
        actualGoLiveDate: true,
        customHoursPerWeek: true,
      },
      with: {
        lead: { columns: { name: true, prismTeamId: true } },
        coLead: { columns: { name: true, prismTeamId: true } },
        scope: { columns: { userCount: true, locationCount: true } },
      },
    }),
    db.select({ projectId: slipEvents.projectId }).from(slipEvents),
  ]);

  const slipCount = new Map<string, number>();
  for (const row of slips) {
    slipCount.set(row.projectId, (slipCount.get(row.projectId) ?? 0) + 1);
  }

  const engagements = sites
    .filter((site) => site.status !== "COMPLETED")
    .map((site) => ({
      acronym: acronymKey(site.crmAcronym || site.code),
      status: site.prismStatus || (site.status === "NOT_STARTED" ? "pre-kickoff" : "active"),
      owner: site.lead?.prismTeamId || site.lead?.name || null,
      coOwner: site.coLead?.prismTeamId || site.coLead?.name || null,
      split: site.ownerSplitPercent,
      kickoff: day(site.startDate),
      goLive: day(site.targetGoLiveDate),
      initialGoLive: day(site.initialGoLiveDate),
      customHpw: site.customHoursPerWeek,
      users: site.scope?.userCount ?? null,
      locations: site.scope?.locationCount ?? null,
      slipCount: slipCount.get(site.id) ?? 0,
    }));

  const completed = sites
    .filter((site) => site.status === "COMPLETED")
    .map((site) => ({
      acronym: acronymKey(site.crmAcronym || site.code),
      kickoff: day(site.startDate),
      goLive: day(site.actualGoLiveDate),
      initialGoLive: day(site.initialGoLiveDate),
    }));

  return {
    team: staff.map((member) => ({
      key: (member.prismTeamId || member.email || member.name || "").trim().toLowerCase(),
      name: member.name ?? member.email,
      hours: member.capacityHoursPerWeek,
      canLead: member.canLead,
      exempt: member.capacityExempt,
      director: member.isDirector,
      active: member.isActive,
    })),
    engagements,
    completed,
  };
}

async function main() {
  const file = positionalFile() ?? process.env.PRISM_DUMP_PATH ?? null;
  if (!file) {
    console.error(
      [
        "Usage: npm run db:import:prism-diff -- [--apply] <prism-dump.json>",
        "",
        "1. Dump Prism SQL (read-only): npm run db:dump:prism -- --out prism-dump.json",
        "2. Read the diff:            npm run db:import:prism-diff -- ./prism-dump.json",
        "3. Upsert only after review: npm run db:import:prism-diff -- --apply ./prism-dump.json",
        "",
        "Default is dry-run. Nothing is deleted.",
      ].join("\n"),
    );
    process.exit(1);
  }

  const dump = parsePrismDumpJson(readFileSync(resolve(file), "utf8"));
  const report = diffPrismBooks(prismBookFromDump(dump), await loadPathBook());
  console.log(formatPrismDiffReport(report));
  console.log("");

  if (!hasFlag("--apply")) {
    console.log("Dry-run only. Re-run with --apply to upsert. No rows were written.");
    return;
  }

  const applied = await applyPrismImport(dump, { dryRun: false });
  console.log(
    `Applied — team ${applied.teamUpserted}, customers +${applied.customersInserted}/~${applied.customersUpdated}, completed +${applied.completedInserted}/~${applied.completedUpdated}, skipped ${applied.skipped}.`,
  );
  if (applied.warnings.length) {
    for (const warning of applied.warnings) console.log(`  ! ${warning}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Prism diff failed:", err);
    process.exit(1);
  });
