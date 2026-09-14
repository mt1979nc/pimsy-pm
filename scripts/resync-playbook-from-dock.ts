/**
 * Re-seed Dock-parity playbooks (templates + checklists + default files +
 * Learning Center), then carefully add missing nested tasks **and default
 * attachments** onto existing WIP projects. Does not wipe completion state
 * or user-uploaded files. Match by title (catalog + template join).
 *
 * Dry-run by default.
 *
 *   npm run db:resync:playbook-from-dock
 *   npm run db:resync:playbook-from-dock -- --apply
 *   npm run db:resync:playbook-from-dock -- --apply --only CEDAR,BHC
 *
 * Does not invent Dock credentials. Run `db:seed -- --templates-only` first
 * (or pass --seed) so template rows exist.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, users } from "@/db/schema";
import { seedDockParityCatalogs } from "@/db/seed-dock-parity";
import { applyPlaybookResync, planPlaybookResync } from "@/lib/playbook-resync";
import { redactDatabaseUrl } from "@/lib/demo-entities";
import { env } from "@/lib/env";

const apply = process.argv.includes("--apply");
const alsoSeed = process.argv.includes("--seed") || process.argv.includes("--templates");
const onlyRaw =
  process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length) ??
  (() => {
    const i = process.argv.indexOf("--only");
    return i >= 0 ? process.argv[i + 1] : undefined;
  })();
const only = onlyRaw
  ? onlyRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : [];

async function main() {
  console.log("\nPATH playbook resync from Dock Implementation template");
  console.log(`  ${redactDatabaseUrl(env.DATABASE_URL)}`);
  console.log(`  mode: ${apply ? "APPLY" : "DRY-RUN (pass --apply to write)"}`);
  if (only.length) console.log(`  only: ${only.join(", ")}`);
  console.log("");

  if (alsoSeed || apply) {
    // Catalogs are safe to re-run: they don't delete live project tasks.
    await seedDockParityCatalogs();
  }

  const actor =
    (await db.query.users.findFirst({
      where: eq(users.email, "alexander@pimsyehr.com"),
      columns: { id: true },
    })) ??
    (await db.query.users.findFirst({
      where: eq(users.role, "OWNER"),
      columns: { id: true },
    }));

  const plan = apply
    ? await applyPlaybookResync({ apply: true, only, actorId: actor?.id ?? null })
    : await planPlaybookResync({ apply: false, only, actorId: actor?.id ?? null });

  console.log(`Projects scanned: ${plan.projectsScanned}`);
  console.log(`Projects that would change: ${plan.projectsTouched}`);
  console.log(`Actions: ${plan.rows.length}\n`);

  const byAction = new Map<string, number>();
  for (const row of plan.rows) {
    byAction.set(row.action, (byAction.get(row.action) ?? 0) + 1);
  }
  for (const [action, n] of [...byAction.entries()].sort()) {
    console.log(`  ${action}: ${n}`);
  }
  console.log("");

  for (const row of plan.rows.slice(0, 40)) {
    console.log(`  · ${row.projectCode} / ${row.phaseName} / ${row.title} — ${row.action} (${row.detail})`);
  }
  if (plan.rows.length > 40) console.log(`  · … ${plan.rows.length - 40} more`);

  if (!apply) {
    console.log("\nDry-run only. Typical live sequence:");
    console.log("  1. npm run db:seed -- --templates-only");
    console.log("  2. npm run db:resync:playbook-from-dock          # review");
    console.log("  3. npm run db:resync:playbook-from-dock -- --apply");
    console.log("Missing Discovery Wizard LINKs and billing-sheet defaults are attached.");
    console.log("User-uploaded files are never deleted. Completed / cancelled sites are skipped.\n");
    return;
  }

  console.log("\nDone. Existing DONE/IN_PROGRESS rows kept their status.\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nPlaybook resync failed:", err);
    process.exit(1);
  });
