/**
 * Remove PATH customers/projects that are on the active book but NOT on the
 * current Dock Implementation WIP allowlist.
 *
 * Default keeps post go-live / completed / archived sites for historical
 * Forecast and Analysis review. Named staff are never deleted.
 *
 * Dry-run by default. Allowlist defaults to content/dock-wip-allowlist.json
 * (Dock Implementation WIP as of 2026-09-14).
 *
 *   npm run db:cleanup:non-dock
 *   npm run db:cleanup:non-dock -- --apply
 *   npm run db:cleanup:non-dock -- ./dock-wip-acronyms.csv --apply
 *   npm run db:cleanup:non-dock -- --keep-prism-analytics
 *
 * RAC / TANC: Alexander (2026-09-14) — keep both on the allowlist until he
 * consolidates. Do not delete either site. Overlay JSON that omits RAC will
 * still flag RAC as DELETE; use the shipped fixture.
 *
 * Azure Cloud Shell: copy DATABASE_URL from App Service Configuration —
 * do not invent the connection string. See azure/README.md and v1.12-DOCK-PARITY.md.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { customerAccounts, projects, users, verificationTokens } from "@/db/schema";
import {
  parseDockAllowlistDocument,
  defaultDockWipAllowlistPath,
  expandAllowlist,
  aliasForAcronym,
} from "@/lib/dock-allowlist";
import {
  classifyNonDockCustomer,
  classifyNonDockProject,
  isProtectedStaffEmail,
  type NonDockClassify,
  type NonDockProjectRef,
} from "@/lib/non-dock-cleanup";
import { projectAcronyms, redactDatabaseUrl } from "@/lib/demo-entities";
import { env } from "@/lib/env";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1]!.startsWith("--")) {
    return process.argv[idx + 1];
  }
  const prefixed = process.argv.find((a) => a.startsWith(`${flag}=`));
  return prefixed ? prefixed.slice(flag.length + 1) : undefined;
}

function positionalAllowlist(): string | undefined {
  return process.argv.slice(2).find((a) => !a.startsWith("--"));
}

const apply = process.argv.includes("--apply");
const keepPrismAnalytics = process.argv.includes("--keep-prism-analytics");

async function main() {
  const shipped = defaultDockWipAllowlistPath();
  const allowPath =
    positionalAllowlist() ||
    argValue("--allowlist") ||
    process.env.DOCK_WIP_ALLOWLIST ||
    (existsSync(shipped) ? shipped : undefined);
  if (!allowPath) {
    console.error(`
PATH non-Dock cleanup — missing allowlist.

Expected content/dock-wip-allowlist.json (Dock Implementation WIP, 2026-09-14)
or pass a JSON/CSV overlay:

  npm run db:cleanup:non-dock
  npm run db:cleanup:non-dock -- --apply
  npm run db:cleanup:non-dock -- ./dock-wip-overlay.json --apply

Options:
  --apply                 actually delete (default is dry-run)
  --keep-prism-analytics  also keep pipeline/analytics-only sites not on Dock WIP
  --allowlist PATH        explicit file path

Default KEEP: completed / post go-live / archived / LIVE historical sites.
Default DELETE: active, pre-kickoff, pipeline, and other WIP not on the allowlist.
Dock test/draft names (MT Test, Test Dock, DRAFT Impl, …) are deleted unless
their acronym is on the allowlist. Named staff are never deleted. Playbooks are never deleted.
`);
    process.exit(1);
  }

  const abs = resolve(allowPath);
  const raw = readFileSync(abs, "utf8");
  const allowDoc = parseDockAllowlistDocument(raw, abs);
  const allowlist = expandAllowlist(allowDoc);

  console.log("\nPATH non-Dock cleanup (active book only)");
  console.log(`  ${redactDatabaseUrl(env.DATABASE_URL)}`);
  console.log(`  allowlist: ${abs} (${allowlist.size} acronyms)`);
  if (allowDoc.aliases.length > 0) {
    console.log("  related codes (keep both until Alexander consolidates):");
    for (const alias of allowDoc.aliases) {
      const names = alias.names.length > 0 ? `  ${alias.names.join(" / ")}` : "";
      const hold = alias.keepBothUntilConsolidated ? "  keep-both" : "";
      console.log(`    ${alias.from} / ${alias.to}${hold}${names}`);
    }
  }
  console.log(`  keep Prism analytics extras: ${keepPrismAnalytics ? "yes" : "no (default)"}`);
  console.log(`  mode: ${apply ? "APPLY (deletes)" : "DRY-RUN (pass --apply to delete)"}\n`);

  const allProjects = await db.query.projects.findMany({
    columns: {
      id: true,
      code: true,
      name: true,
      crmAcronym: true,
      prismClientId: true,
      customerAccountId: true,
      type: true,
      leadId: true,
      coLeadId: true,
      status: true,
      prismStatus: true,
      actualGoLiveDate: true,
      archivedAt: true,
      startDate: true,
      targetGoLiveDate: true,
      taskCountTotal: true,
    },
    with: {
      customerAccount: { columns: { id: true, slug: true, name: true, status: true } },
    },
  });

  const allCustomers = await db.query.customerAccounts.findMany({
    columns: { id: true, slug: true, name: true, status: true },
  });

  const allUsers = await db.query.users.findMany({
    columns: { id: true, email: true, name: true, role: true, customerAccountId: true },
  });

  const projectClass = new Map<string, NonDockClassify>();
  const toDelete: NonDockProjectRef[] = [];
  const keptAllow: NonDockProjectRef[] = [];
  const keptLegacy: NonDockProjectRef[] = [];
  const keptAnalytics: NonDockProjectRef[] = [];

  for (const p of allProjects) {
    const ref: NonDockProjectRef = {
      id: p.id,
      code: p.code,
      name: p.name,
      crmAcronym: p.crmAcronym,
      prismClientId: p.prismClientId,
      customerAccountId: p.customerAccountId,
      type: p.type,
      customerSlug: p.customerAccount?.slug ?? null,
      customerName: p.customerAccount?.name ?? null,
      status: p.status,
      prismStatus: p.prismStatus,
      actualGoLiveDate: p.actualGoLiveDate,
      archivedAt: p.archivedAt,
      customerStatus: p.customerAccount?.status ?? null,
      startDate: p.startDate,
      targetGoLiveDate: p.targetGoLiveDate,
      taskCountTotal: p.taskCountTotal,
    };
    const cls = classifyNonDockProject(ref, { allowlist, keepPrismAnalytics });
    projectClass.set(p.id, cls);
    if (cls === "delete") toDelete.push(ref);
    if (cls === "keep-allowlist") keptAllow.push(ref);
    if (cls === "keep-legacy") keptLegacy.push(ref);
    if (cls === "keep-analytics") keptAnalytics.push(ref);
  }

  const classByCustomer = new Map<string, NonDockClassify[]>();
  for (const p of allProjects) {
    if (!p.customerAccountId) continue;
    const list = classByCustomer.get(p.customerAccountId) ?? [];
    list.push(projectClass.get(p.id) ?? "keep-legacy");
    classByCustomer.set(p.customerAccountId, list);
  }

  const customersToDelete = allCustomers.filter(
    (c) => classifyNonDockCustomer(c, classByCustomer.get(c.id) ?? []) === "delete",
  );

  const deleteProjectIds = new Set(toDelete.map((p) => p.id));
  const remainingLeadIds = new Set<string>();
  for (const p of allProjects) {
    if (deleteProjectIds.has(p.id)) continue;
    if (p.leadId) remainingLeadIds.add(p.leadId);
    if (p.coLeadId) remainingLeadIds.add(p.coLeadId);
  }

  const demoCustomerIds = new Set(customersToDelete.map((c) => c.id));
  const usersToDelete = allUsers.filter((u) => {
    if (isProtectedStaffEmail(u.email)) return false;
    if (u.role !== "CUSTOMER") return false;
    if (!u.customerAccountId || !demoCustomerIds.has(u.customerAccountId)) return false;
    if (remainingLeadIds.has(u.id)) return false;
    return true;
  });

  function printBlock(title: string, lines: string[]) {
    console.log(`${title} (${lines.length})`);
    if (lines.length === 0) {
      console.log("  (none)\n");
      return;
    }
    for (const line of lines.slice(0, 40)) console.log(`  · ${line}`);
    if (lines.length > 40) console.log(`  · … ${lines.length - 40} more`);
    console.log("");
  }

  const tag = (p: NonDockProjectRef) =>
    [p.code, p.crmAcronym, p.prismClientId, p.status, p.prismStatus].filter(Boolean).join(" / ");

  printBlock(
    "Projects to DELETE (active/pre-kickoff/pipeline WIP not on Dock allowlist, plus Dock test/draft spaces)",
    toDelete.map((p) => `${tag(p)}  ${p.name ?? ""}`),
  );
  printBlock(
    "KEEP — on Dock WIP allowlist",
    keptAllow.map((p) => `${tag(p)}  ${p.name ?? ""}`),
  );
  printBlock(
    "KEEP — post go-live / completed / archived (historical Prism/PATH)",
    keptLegacy.map((p) => `${tag(p)}  ${p.name ?? ""}`),
  );
  if (keepPrismAnalytics) {
    printBlock(
      "KEEP — Prism analytics extras (--keep-prism-analytics)",
      keptAnalytics.map((p) => `${tag(p)}  ${p.name ?? ""}`),
    );
  }
  printBlock(
    "Customers to delete (no remaining keep projects)",
    customersToDelete.map((c) => `${c.slug ?? c.id}  ${c.name ?? ""} (${c.status ?? ""})`),
  );
  printBlock(
    "Portal contacts to delete with those customers",
    usersToDelete.map((u) => `${u.email ?? u.id}  ${u.name ?? ""}`),
  );

  const staffKept = allUsers.filter((u) => isProtectedStaffEmail(u.email)).length;
  console.log(`Protected staff emails in this database: ${staffKept}`);
  console.log(`Allowlist size: ${allowlist.size}\n`);

  const aliasNotes: string[] = [];
  for (const p of [...keptAllow, ...keptLegacy, ...toDelete]) {
    const alias = aliasForAcronym(projectAcronyms(p), allowDoc.aliases);
    if (!alias) continue;
    const stillFrom = projectAcronyms(p).includes(alias.from);
    const label = `${tag(p)}  ${p.customerName ?? p.name ?? ""}`;
    if (stillFrom) {
      aliasNotes.push(
        `${label}  — ${alias.from} and ${alias.to} both stay until Alexander consolidates. Do not delete.`,
      );
    }
  }
  if (aliasNotes.length > 0) {
    printBlock("RELATED — RAC + TANC both stay until Alexander consolidates", aliasNotes);
  }

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to delete the DELETE lists above.");
    console.log("Post go-live legacy sites are kept unless you are looking at the DELETE list.");
    if (allowDoc.aliases.some((a) => a.keepBothUntilConsolidated)) {
      console.log("RAC and TANC both stay on the shipped allowlist until Alexander consolidates. Do not delete either.\n");
    } else {
      console.log("");
    }
    return;
  }

  if (toDelete.length === 0 && customersToDelete.length === 0 && usersToDelete.length === 0) {
    console.log("Nothing to apply — active book already matches the Dock allowlist.\n");
    return;
  }

  for (const u of usersToDelete) {
    if (isProtectedStaffEmail(u.email)) {
      throw new Error(`Refusing to delete protected staff ${u.email}`);
    }
  }

  if (toDelete.length > 0) {
    await db.delete(projects).where(
      inArray(
        projects.id,
        toDelete.map((p) => p.id),
      ),
    );
    console.log(`  ✓ deleted ${toDelete.length} project(s)`);
  }

  if (usersToDelete.length > 0) {
    const emails = usersToDelete.map((u) => u.email).filter((e): e is string => Boolean(e));
    if (emails.length > 0) {
      await db.delete(verificationTokens).where(inArray(verificationTokens.identifier, emails));
    }
    await db.delete(users).where(
      inArray(
        users.id,
        usersToDelete.map((u) => u.id),
      ),
    );
    console.log(`  ✓ deleted ${usersToDelete.length} portal contact(s)`);
  }

  if (customersToDelete.length > 0) {
    await db.delete(customerAccounts).where(
      inArray(
        customerAccounts.id,
        customersToDelete.map((c) => c.id),
      ),
    );
    console.log(`  ✓ deleted ${customersToDelete.length} customer(s)`);
  }

  console.log("\nDone. Re-run without --apply to confirm.\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nNon-Dock cleanup failed:", err);
    process.exit(1);
  });
