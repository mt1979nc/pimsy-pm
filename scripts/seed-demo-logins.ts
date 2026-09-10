/**
 * Upserts three password-ready demo accounts for Nathan walkthroughs:
 *   Management (MANAGER), Specialist, Customer (Riverbend / IMP-9001).
 *
 * Safe to re-run. Does not touch non-demo customers.
 *
 *   npx tsx --env-file-if-exists=.env.local --env-file-if-exists=.env scripts/seed-demo-logins.ts
 *
 * Shared demo password (change after the pitch if this env is shared):
 *   Demo-Nathan-2026!
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, customerAccounts, projects, projectMembers } from "@/db/schema";
import { hashPassword } from "@/lib/password";

const DEMO_PASSWORD = "Demo-Nathan-2026!";

const ACCOUNTS = [
  {
    email: "demo.manager@pimsyehr.com",
    name: "Demo Manager",
    role: "MANAGER" as const,
    title: "Director of Implementation",
  },
  {
    email: "demo.specialist@pimsyehr.com",
    name: "Demo Specialist",
    role: "SPECIALIST" as const,
    title: "Implementation Specialist",
  },
] as const;

async function main() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  for (const a of ACCOUNTS) {
    await db
      .insert(users)
      .values({
        email: a.email,
        name: a.name,
        role: a.role,
        title: a.title,
        passwordHash,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          name: a.name,
          role: a.role,
          title: a.title,
          passwordHash,
          isActive: true,
        },
      });
    console.log(`  ✓ ${a.role.padEnd(11)} ${a.email}`);
  }

  // Ensure Riverbend customer contact exists and has the demo password.
  let account = await db.query.customerAccounts.findFirst({
    where: eq(customerAccounts.slug, "riverbend-counseling"),
    columns: { id: true, name: true },
  });

  if (!account) {
    console.log(
      "  · Riverbend customer missing — run `npm run db:seed` (full, not --templates-only) first, then re-run this.",
    );
  } else {
    const email = "contact@riverbend-counseling.example.com";
    await db
      .insert(users)
      .values({
        email,
        name: "Dana Whitfield",
        role: "CUSTOMER",
        title: "Practice Administrator",
        customerAccountId: account.id,
        passwordHash,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          name: "Dana Whitfield",
          role: "CUSTOMER",
          title: "Practice Administrator",
          customerAccountId: account.id,
          passwordHash,
          isActive: true,
        },
      });
    console.log(`  ✓ CUSTOMER    ${email}`);

    // Make sure specialist is on IMP-9001 so their dashboard isn't empty.
    const project = await db.query.projects.findFirst({
      where: eq(projects.code, "IMP-9001"),
      columns: { id: true },
    });
    const specialist = await db.query.users.findFirst({
      where: eq(users.email, "demo.specialist@pimsyehr.com"),
      columns: { id: true },
    });
    if (project && specialist) {
      const existing = await db.query.projectMembers.findFirst({
        where: (m, { and, eq }) =>
          and(eq(m.projectId, project.id), eq(m.userId, specialist.id)),
        columns: { id: true },
      });
      if (!existing) {
        await db.insert(projectMembers).values({
          projectId: project.id,
          userId: specialist.id,
          role: "LEAD",
        });
      }
      console.log("  ✓ Specialist membership on IMP-9001");
    }
  }

  // Optional: give bootstrap owner the same password if they already exist.
  const owner = await db.query.users.findFirst({
    where: eq(users.role, "OWNER"),
    columns: { id: true, email: true },
  });
  if (owner) {
    await db.update(users).set({ passwordHash }).where(eq(users.id, owner.id));
    console.log(`  ✓ OWNER       ${owner.email} (password synced for demo)`);
  }

  console.log("\nDemo password for all of the above:");
  console.log(`  ${DEMO_PASSWORD}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nseed-demo-logins failed:", err);
    process.exit(1);
  });

