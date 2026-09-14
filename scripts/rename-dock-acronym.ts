/**
 * Optional rename of PATH/Prism project acronyms to a Dock WIP canonical code.
 * Never deletes a project or customer.
 *
 * Current decision (2026-09-14): keep both RAC and TANC. Shipped aliases with
 * keepBothUntilConsolidated do not auto-remap. When Alexander consolidates:
 *
 *   npm run db:rename:dock-acronym -- --from RAC --to TANC
 *   npm run db:rename:dock-acronym -- --from RAC --to TANC --apply
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { loadRepoDockAllowlistDocument } from "@/lib/dock-allowlist";
import { planAcronymRename, remapsFromAliases, type AcronymRenameTarget } from "@/lib/dock-acronym-rename";
import { redactDatabaseUrl } from "@/lib/demo-entities";
import { env } from "@/lib/env";

const apply = process.argv.includes("--apply");

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1]!.startsWith("--")) {
    return process.argv[idx + 1];
  }
  const prefixed = process.argv.find((a) => a.startsWith(`${flag}=`));
  return prefixed ? prefixed.slice(flag.length + 1) : undefined;
}

async function main() {
  const fromFlag = argValue("--from");
  const toFlag = argValue("--to");
  const doc = loadRepoDockAllowlistDocument();
  const remaps =
    fromFlag && toFlag
      ? [{ from: fromFlag, to: toFlag, note: "CLI override. Rename — do not delete." }]
      : remapsFromAliases(doc.aliases);

  console.log("\nPATH Dock acronym rename (never deletes)");
  console.log(`  ${redactDatabaseUrl(env.DATABASE_URL)}`);
  console.log(`  mode: ${apply ? "APPLY" : "DRY-RUN (pass --apply to write)"}`);
  if (remaps.length === 0) {
    const deferred = doc.aliases.filter((a) => a.keepBothUntilConsolidated);
    if (deferred.length > 0) {
      console.log("  Keep-both (no auto-rename until Alexander consolidates):");
      for (const alias of deferred) {
        console.log(`    ${alias.from} + ${alias.to}  ${alias.note || alias.names.join(" / ")}`);
      }
      console.log("  When consolidating: npm run db:rename:dock-acronym -- --from RAC --to TANC\n");
    } else {
      console.log("  No aliases in content/dock-wip-allowlist.json and no --from/--to.");
      console.log("  Example: npm run db:rename:dock-acronym -- --from RAC --to TANC\n");
    }
    return;
  }

  const rows = await db.query.projects.findMany({
    columns: {
      id: true,
      code: true,
      name: true,
      crmAcronym: true,
      prismClientId: true,
      status: true,
    },
    with: { customerAccount: { columns: { name: true } } },
  });
  const targets: AcronymRenameTarget[] = rows.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    crmAcronym: p.crmAcronym,
    prismClientId: p.prismClientId,
    customerName: p.customerAccount?.name ?? null,
    status: p.status,
  }));

  let collisions = 0;
  let actions = 0;

  for (const remap of remaps) {
    const plan = planAcronymRename(targets, remap);
    console.log(`\n  ${plan.remap.from} → ${plan.remap.to}`);
    if (plan.remap.note) console.log(`    ${plan.remap.note}`);
    console.log(`    already on ${plan.remap.to}: ${plan.alreadyCanonical}`);
    console.log(`    would rename: ${plan.actions.length}`);
    console.log(`    collisions (refused): ${plan.collisions.length}`);

    for (const row of plan.actions) {
      const fields = Object.entries(row.patch)
        .map(([k, v]) => `${k}: ${row.before[k as keyof typeof row.before] ?? "∅"} → ${v}`)
        .join(", ");
      console.log(`    · ${row.before.code ?? row.projectId}  ${row.customerName ?? row.name ?? ""}  (${fields})`);
    }
    for (const hit of plan.collisions) {
      collisions += 1;
      console.log(`    ! ${hit.detail}`);
      console.log(`      from: ${hit.fromLabel}`);
      console.log(`      to:   ${hit.toLabel}`);
    }

    if (!apply) {
      actions += plan.actions.length;
      continue;
    }
    if (plan.collisions.length > 0) {
      console.log("    skipped APPLY for this remap because of collisions.");
      continue;
    }
    for (const row of plan.actions) {
      await db
        .update(projects)
        .set({
          ...row.patch,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, row.projectId));
      actions += 1;
    }
  }

  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply to write. Then prune:");
    console.log("  npm run db:cleanup:non-dock");
    console.log("RAC and TANC both stay until Alexander consolidates. Do not delete either.\n");
    return;
  }

  if (collisions > 0) {
    console.error(`\nFinished with ${collisions} collision(s). Nothing was merged or deleted.\n`);
    process.exit(1);
  }
  console.log(`\nRenamed ${actions} project field-set(s). Re-run dry-run to confirm RAC is gone.\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nDock acronym rename failed:", err);
    process.exit(1);
  });
