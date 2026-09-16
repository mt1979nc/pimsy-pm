/**
 * Re-seed Dock-parity playbooks (templates + descriptions + checklists +
 * default files + Learning Center), then carefully add missing nested tasks,
 * Dock playbook copy, checklists, and default attachments onto existing WIP.
 * Does not wipe completion state, staff-authored notes, or user-uploaded
 * files. Match by title (catalog + template join).
 *
 * Dry-run by default. Does **not** call the Dock API or edit live Dock Spaces.
 *
 *   npm run db:resync:playbook-from-dock
 *   npm run db:resync:playbook-from-dock -- --apply
 *   npm run db:resync:playbook-from-dock -- --apply --only CEDAR,BHC
 *   npm run db:resync:playbook-from-dock -- --limit 5 --timeout-sec 120
 *
 * Azure Cloud Shell (no Dock credentials required):
 *   1. App Service → Settings → Environment variables → copy DATABASE_URL
 *   2. export DATABASE_URL='postgresql://…'
 *   3. npm ci && npm run db:seed -- --templates-only   # optional catalog refresh
 *   4. npm run db:resync:playbook-from-dock            # dry-run, prints progress
 *   5. npm run db:resync:playbook-from-dock -- --apply
 *
 * If a previous dry-run appeared to hang: this CLI now logs per-project
 * progress, batch-loads extras, and stops at --timeout-sec (default 180)
 * instead of sitting silent. Use --only or --limit to slice a large book.
 * Pass --timeout-sec 0 to disable the cap.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { seedDockParityCatalogs } from "@/db/seed-dock-parity";
import { applyPlaybookResync, planPlaybookResync } from "@/lib/playbook-resync";
import { redactDatabaseUrl } from "@/lib/demo-entities";
import { env } from "@/lib/env";
import { DEFAULT_RESYNC_DEADLINE_MS, formatResyncSeconds } from "@/lib/resync-deadline";

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

const limitRaw =
  process.argv.find((a) => a.startsWith("--limit="))?.slice("--limit=".length) ??
  (() => {
    const i = process.argv.indexOf("--limit");
    return i >= 0 ? process.argv[i + 1] : undefined;
  })();
const limit = limitRaw && Number.isFinite(Number(limitRaw)) ? Math.max(0, Math.round(Number(limitRaw))) : undefined;

const timeoutRaw =
  process.argv.find((a) => a.startsWith("--timeout-sec="))?.slice("--timeout-sec=".length) ??
  (() => {
    const i = process.argv.indexOf("--timeout-sec");
    return i >= 0 ? process.argv[i + 1] : undefined;
  })();
const timeoutSec = timeoutRaw != null ? Number(timeoutRaw) : DEFAULT_RESYNC_DEADLINE_MS / 1000;
const deadlineMs = Number.isFinite(timeoutSec) && timeoutSec > 0 ? Math.round(timeoutSec * 1000) : 0;

const startedAt = Date.now();
function progress(message: string) {
  console.log(`  [${formatResyncSeconds(Date.now() - startedAt)}] ${message}`);
}

async function main() {
  console.log("\nPATH playbook resync from Dock Implementation template (in-repo seed, not live Dock)");
  console.log(`  ${redactDatabaseUrl(env.DATABASE_URL)}`);
  console.log(`  mode: ${apply ? "APPLY" : "DRY-RUN (pass --apply to write)"}`);
  if (only.length) console.log(`  only: ${only.join(", ")}`);
  if (limit) console.log(`  limit: ${limit} project(s)`);
  console.log(`  timeout: ${deadlineMs > 0 ? `${deadlineMs / 1000}s` : "off"}`);
  console.log("");

  if (alsoSeed || apply) {
    progress("Refreshing Dock-parity catalogs (templates/checklists/library placeholders)…");
    await seedDockParityCatalogs();
    progress("Catalogs ready.");
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

  const opts = {
    only,
    actorId: actor?.id ?? null,
    limit: limit || undefined,
    deadlineMs,
    useDefaultDeadline: false,
    onProgress: progress,
  };

  const plan = apply
    ? await applyPlaybookResync({ ...opts, apply: true })
    : await planPlaybookResync({ ...opts, apply: false });

  console.log("");
  console.log(`Projects scanned: ${plan.projectsScanned}`);
  console.log(`Projects that would change: ${plan.projectsTouched}`);
  console.log(`Actions: ${plan.rows.length}`);
  console.log(`Elapsed: ${formatResyncSeconds(plan.elapsedMs)}`);
  if (plan.timedOut) {
    console.log("TIMED OUT — partial plan only. Re-run with --only CODE, --limit N, or --timeout-sec 0.\n");
  } else {
    console.log("");
  }

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
    console.log("\nDry-run only. Typical Azure Cloud Shell sequence:");
    console.log("  1. npm run db:seed -- --templates-only");
    console.log("  2. npm run db:resync:playbook-from-dock          # review (progress + timeout)");
    console.log("  3. npm run db:resync:playbook-from-dock -- --apply");
    console.log("Missing descriptions, area-to-cover checklists, Discovery Wizard LINKs, billing-sheet defaults, Billing Configuration connected copies, connect keys, and RCM-overlap moves are filled.");
    console.log("Staff-authored notes and user-uploaded files are never deleted. Completed / cancelled sites are skipped.");
    console.log("This script never talks to Dock. Do not edit live Dock Spaces from PATH.\n");
    return;
  }

  if (plan.timedOut) {
    console.log("\nApply did not finish. Remaining sites are unchanged. Slice with --only and retry.\n");
    process.exitCode = 2;
    return;
  }

  console.log("\nDone. Existing DONE/IN_PROGRESS rows kept their status.\n");
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error("\nPlaybook resync failed:", err);
    process.exit(1);
  });
