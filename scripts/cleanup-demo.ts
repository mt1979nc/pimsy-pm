/**
 * Remove Nathan/Grok/fixture demo entities from a PATH database.
 *
 * Dry-run by default. Does not touch playbooks, named staff, or imported
 * Prism/Dock WIP (BDMH, BHC, CCCCARE, CEDAR, …).
 *
 *   npm run db:cleanup:demo              # print what would be removed
 *   npm run db:cleanup:demo -- --apply   # actually delete
 *
 * Azure Cloud Shell (production): copy DATABASE_URL from App Service
 * Configuration — do not invent the connection string. See azure/README.md.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  customerAccounts,
  users,
  projects,
  verificationTokens,
} from "@/db/schema";
import {
  classifyCustomer,
  classifyProject,
  classifyUser,
  isProtectedStaffEmail,
  projectTouchesProtectedWip,
  redactDatabaseUrl,
  type ClassifyResult,
  type DemoCustomerRef,
  type DemoProjectRef,
  type DemoUserRef,
} from "@/lib/demo-entities";
import { env } from "@/lib/env";

const apply = process.argv.includes("--apply");

function uniq<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

async function main() {
  console.log("\nPATH demo cleanup");
  console.log(`  ${redactDatabaseUrl(env.DATABASE_URL)}`);
  console.log(`  mode: ${apply ? "APPLY (deletes)" : "DRY-RUN (pass --apply to delete)"}\n`);

  const allProjects = await db.query.projects.findMany({
    columns: {
      id: true,
      code: true,
      name: true,
      crmAcronym: true,
      prismClientId: true,
      customerAccountId: true,
      leadId: true,
      coLeadId: true,
    },
    with: {
      customerAccount: { columns: { id: true, slug: true, name: true } },
    },
  });

  const allUsers = await db.query.users.findMany({
    columns: { id: true, email: true, name: true, role: true, customerAccountId: true },
  });

  const allCustomers = await db.query.customerAccounts.findMany({
    columns: { id: true, slug: true, name: true },
  });

  const projectClass = new Map<string, ClassifyResult>();
  const projectsToDelete: DemoProjectRef[] = [];
  const projectsProtected: { ref: DemoProjectRef; reason: string }[] = [];

  for (const p of allProjects) {
    const ref: DemoProjectRef = {
      id: p.id,
      code: p.code,
      name: p.name,
      crmAcronym: p.crmAcronym,
      prismClientId: p.prismClientId,
      customerSlug: p.customerAccount?.slug ?? null,
      customerName: p.customerAccount?.name ?? null,
    };
    const cls = classifyProject(ref);
    projectClass.set(p.id, cls);
    if (cls === "delete") projectsToDelete.push(ref);
    if (cls === "protect") {
      projectsProtected.push({ ref, reason: "imported Prism/Dock acronym" });
    }
  }

  const classByCustomer = new Map<string, ClassifyResult[]>();
  for (const p of allProjects) {
    if (!p.customerAccountId) continue;
    const list = classByCustomer.get(p.customerAccountId) ?? [];
    list.push(projectClass.get(p.id) ?? "keep");
    classByCustomer.set(p.customerAccountId, list);
  }

  const customersToDelete: DemoCustomerRef[] = [];
  for (const c of allCustomers) {
    const cls = classifyCustomer(c, classByCustomer.get(c.id) ?? []);
    if (cls === "delete") customersToDelete.push(c);
  }

  const protectedProjectIds = new Set(
    allProjects.filter((p) => projectClass.get(p.id) === "protect").map((p) => p.id),
  );
  const leadOnProtected = new Set<string>();
  for (const p of allProjects) {
    if (!protectedProjectIds.has(p.id)) continue;
    if (p.leadId) leadOnProtected.add(p.leadId);
    if (p.coLeadId) leadOnProtected.add(p.coLeadId);
  }

  const usersToDelete: DemoUserRef[] = [];
  const usersDeactivate: DemoUserRef[] = [];

  const demoCustomerIds = new Set(customersToDelete.map((c) => c.id));

  for (const u of allUsers) {
    const cls = classifyUser(u);
    if (cls === "protect") {
      continue;
    }
    const viaDemoCustomer = u.customerAccountId != null && demoCustomerIds.has(u.customerAccountId);
    if (cls !== "delete" && !viaDemoCustomer) continue;
    if (leadOnProtected.has(u.id)) {
      usersDeactivate.push(u);
      continue;
    }
    usersToDelete.push(u);
  }

  const deleteProjects = uniq(projectsToDelete);
  const deleteCustomers = uniq(customersToDelete);
  const deleteUsers = uniq(usersToDelete);
  const deactivateUsers = uniq(usersDeactivate);

  function printBlock(title: string, lines: string[]) {
    console.log(`${title} (${lines.length})`);
    if (lines.length === 0) {
      console.log("  (none)\n");
      return;
    }
    for (const line of lines) console.log(`  · ${line}`);
    console.log("");
  }

  printBlock(
    "Projects to delete",
    deleteProjects.map((p) => {
      const tags = [p.code, p.crmAcronym, p.prismClientId].filter(Boolean).join(" / ");
      return `${tags || p.id}  ${p.name ?? ""}`;
    }),
  );
  printBlock(
    "Customers to delete",
    deleteCustomers.map((c) => `${c.slug ?? c.id}  ${c.name ?? ""}`),
  );
  printBlock(
    "Users to delete",
    deleteUsers.map((u) => `${u.email ?? u.id}  ${u.name ?? ""} (${u.role ?? ""})`),
  );
  printBlock(
    "Users to deactivate (lead on protected WIP — not deleted)",
    deactivateUsers.map((u) => `${u.email ?? u.id}  ${u.name ?? ""}`),
  );

  if (projectsProtected.length > 0) {
    console.log(`Protected WIP skipped (${projectsProtected.length})`);
    for (const p of projectsProtected.slice(0, 20)) {
      console.log(`  · ${p.ref.code} ${p.ref.crmAcronym ?? ""} ${p.ref.name ?? ""}`);
    }
    if (projectsProtected.length > 20) console.log(`  · … ${projectsProtected.length - 20} more`);
    console.log("");
  }

  const staffKept = allUsers.filter((u) => isProtectedStaffEmail(u.email)).length;
  console.log(`Protected staff emails in this database: ${staffKept}`);
  console.log(`Protected WIP projects skipped: ${projectsProtected.length}\n`);

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to delete the lists above.");
    console.log("Playbooks / templates are never modified.\n");
    return;
  }

  if (
    deleteProjects.length === 0 &&
    deleteCustomers.length === 0 &&
    deleteUsers.length === 0 &&
    deactivateUsers.length === 0
  ) {
    console.log("Nothing to apply — live book has no matching demo/test entities.\n");
    return;
  }

  // Extra guard: refuse to delete a project that still classifies as protect.
  for (const p of deleteProjects) {
    if (projectTouchesProtectedWip(p)) {
      throw new Error(`Refusing to delete protected WIP ${p.code} / ${p.crmAcronym}`);
    }
  }
  for (const u of deleteUsers) {
    if (isProtectedStaffEmail(u.email)) {
      throw new Error(`Refusing to delete protected staff ${u.email}`);
    }
  }

  if (deleteProjects.length > 0) {
    await db.delete(projects).where(
      inArray(
        projects.id,
        deleteProjects.map((p) => p.id),
      ),
    );
    console.log(`  ✓ deleted ${deleteProjects.length} project(s)`);
  }

  if (deleteCustomers.length > 0) {
    await db.delete(customerAccounts).where(
      inArray(
        customerAccounts.id,
        deleteCustomers.map((c) => c.id),
      ),
    );
    console.log(`  ✓ deleted ${deleteCustomers.length} customer(s)`);
  }

  if (deleteUsers.length > 0) {
    const emails = deleteUsers.map((u) => u.email).filter((e): e is string => Boolean(e));
    if (emails.length > 0) {
      await db.delete(verificationTokens).where(inArray(verificationTokens.identifier, emails));
    }
    await db.delete(users).where(
      inArray(
        users.id,
        deleteUsers.map((u) => u.id),
      ),
    );
    console.log(`  ✓ deleted ${deleteUsers.length} user(s)`);
  }

  for (const u of deactivateUsers) {
    await db
      .update(users)
      .set({ isActive: false, passwordHash: null, mustChangePassword: false, updatedAt: new Date() })
      .where(eq(users.id, u.id));
  }
  if (deactivateUsers.length > 0) {
    console.log(`  ✓ deactivated ${deactivateUsers.length} user(s) still tied to protected WIP`);
  }

  console.log("\nDone. Re-run without --apply to confirm the book is clean.\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nDemo cleanup failed:", err);
    process.exit(1);
  });
