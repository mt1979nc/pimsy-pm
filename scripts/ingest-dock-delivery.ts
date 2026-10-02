/**
 * Load a Dock Implementation WIP scrape into PATH analytics tables.
 * Does not create projects or tasks.
 *
 *   npm run db:ingest:dock-delivery -- --wip dock-wip.json --threads dock-threads.json
 *   npm run db:ingest:dock-delivery -- --wip dock-wip.json --threads dock-threads.json --apply
 *
 * Default is a dry run. --apply writes. --dry-run wins if both are passed.
 * Demo excerpts: scripts/dock/fixtures/*.sample.json (not loaded by db:seed).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildDockDeliverySnapshot } from "@/lib/dock-delivery";

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as unknown;
}

async function main() {
  const wipPath = arg("--wip");
  const threadsPath = arg("--threads");
  if (!wipPath || !threadsPath) {
    console.error("Usage: npm run db:ingest:dock-delivery -- --wip <dock-wip.json> --threads <dock-threads.json> [--apply]");
    process.exit(1);
  }

  const built = buildDockDeliverySnapshot(readJson(wipPath), readJson(threadsPath));
  if (!built.ok) {
    console.error(built.error);
    process.exit(1);
  }

  const { draft } = built;
  const apply = process.argv.includes("--apply") && !process.argv.includes("--dry-run");
  console.log(`${apply ? "Apply" : "Dry run"} — Dock delivery snapshot`);
  console.log(`  Retrieved   ${draft.retrievedAt.toISOString()}`);
  console.log(`  Sites       ${draft.sites.length}`);
  console.log(`  Threads     ${draft.threads.length}`);
  console.log(`  Overdue     ${draft.totals.overdueTaskSum ?? "—"} (${draft.totals.overdueUnknownSites} unknown)`);
  console.log(`  On PIMSY    ${draft.totals.waitingOnPimsy}`);
  console.log(`  On customer ${draft.totals.waitingOnCustomer}`);
  console.log(`  Unknown     ${draft.totals.waitingUnknown}`);
  console.log(`  Unlisted    ${draft.totals.unlistedThreads} threads not on an included WIP site`);
  if (draft.totals.excluded.length > 0) {
    console.log("  Excluded:");
    for (const site of draft.totals.excluded) {
      console.log(`    · ${site.acronym} ${site.name} (${site.reason})`);
    }
  }

  if (!apply) {
    console.log("Dry run only. Pass --apply to write the snapshot.");
    process.exit(0);
  }

  const { persistDockDeliverySnapshot } = await import("@/lib/dock-delivery-store");
  const result = await persistDockDeliverySnapshot(draft);
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  console.log(`Wrote ${result.status}. Snapshot ${result.snapshotId ?? "(none)"}.`);
  process.exit(0);
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
