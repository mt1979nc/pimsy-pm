/**
 * Upserts Outlook roster staff for live / demo environments.
 *
 * Alexander Morse  — OWNER + canLead + isDirector, password + mustChangePassword
 * Morgan Davis     — SPECIALIST, capacityExempt, canLead=false, password + mustChangePassword
 * Other roster     — staff rows without forcing a password
 *
 * Temporary password for Alexander + Morgan (must change on first login):
 *   Demo-Nathan-2026!
 *
 * Safe to re-run.
 *
 *   npx tsx --env-file-if-exists=.env.local --env-file-if-exists=.env scripts/seed-staff-logins.ts
 *   # or: npm run db:seed:staff-logins
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/password";

const TEMP_PASSWORD = "Demo-Nathan-2026!";

type StaffRow = {
  email: string;
  name: string;
  role: "OWNER" | "SPECIALIST" | "MEMBER";
  title: string;
  capacityHoursPerWeek: number;
  capacityExempt: boolean;
  canLead: boolean;
  isDirector: boolean;
  prismTeamId: string | null;
  /** When true: set passwordHash + mustChangePassword. */
  forcePassword: boolean;
};

const ROSTER: StaffRow[] = [
  {
    email: "alexander@pimsyehr.com",
    name: "Alexander Morse",
    role: "OWNER",
    title: "Director of Implementation",
    capacityHoursPerWeek: 30,
    capacityExempt: false,
    canLead: true,
    isDirector: true,
    prismTeamId: "am",
    forcePassword: true,
  },
  {
    email: "morgan@pimsyehr.com",
    name: "Morgan Davis",
    role: "SPECIALIST",
    title: "Implementation Specialist",
    capacityHoursPerWeek: 23,
    capacityExempt: true,
    canLead: false,
    isDirector: false,
    prismTeamId: "md",
    forcePassword: true,
  },
  {
    email: "jeremy@pimsyehr.com",
    name: "Jeremy Reals",
    role: "SPECIALIST",
    title: "Implementation Specialist",
    capacityHoursPerWeek: 30,
    capacityExempt: false,
    canLead: true,
    isDirector: false,
    prismTeamId: "jr",
    forcePassword: false,
  },
  {
    email: "danielle@pimsyehr.com",
    name: "Danielle Piper",
    role: "SPECIALIST",
    title: "Implementation Specialist",
    capacityHoursPerWeek: 30,
    capacityExempt: false,
    canLead: true,
    isDirector: false,
    prismTeamId: "dp",
    forcePassword: false,
  },
  {
    email: "mindy@pimsyehr.com",
    name: "Mindy Douglas",
    role: "MEMBER",
    title: "RCM",
    capacityHoursPerWeek: 30,
    capacityExempt: true,
    canLead: false,
    isDirector: false,
    prismTeamId: "mind",
    forcePassword: false,
  },
  {
    email: "david@pimsyehr.com",
    name: "Dave Shepard",
    role: "MEMBER",
    title: "RCM",
    capacityHoursPerWeek: 30,
    capacityExempt: true,
    canLead: false,
    isDirector: false,
    prismTeamId: "dave",
    forcePassword: false,
  },
  {
    email: "anna@pimsyehr.com",
    name: "Anna Stokes",
    role: "MEMBER",
    title: "Billing Support",
    capacityHoursPerWeek: 30,
    capacityExempt: true,
    canLead: false,
    isDirector: false,
    prismTeamId: "anna",
    forcePassword: false,
  },
  {
    email: "kori@pimsyehr.com",
    name: "Kori Hale",
    role: "MEMBER",
    title: "Director of Support",
    capacityHoursPerWeek: 30,
    capacityExempt: true,
    canLead: false,
    isDirector: true,
    prismTeamId: "kori",
    forcePassword: false,
  },
];

async function main() {
  const passwordHash = await hashPassword(TEMP_PASSWORD);

  console.log("Seeding staff logins…\n");

  for (const s of ROSTER) {
    const existing = await db.query.users.findFirst({
      where: eq(users.email, s.email),
      columns: { id: true, role: true },
    });

    const base = {
      name: s.name,
      role: s.role,
      title: s.title,
      capacityHoursPerWeek: s.capacityHoursPerWeek,
      capacityExempt: s.capacityExempt,
      canLead: s.canLead,
      isDirector: s.isDirector,
      prismTeamId: s.prismTeamId,
      isActive: true,
    } as const;

    if (existing) {
      await db
        .update(users)
        .set({
          ...base,
          ...(s.forcePassword
            ? { passwordHash, mustChangePassword: true }
            : {}),
        })
        .where(eq(users.id, existing.id));
    } else {
      await db.insert(users).values({
        email: s.email,
        ...base,
        ...(s.forcePassword
          ? { passwordHash, mustChangePassword: true }
          : {}),
      });
    }

    const flags = [
      s.role,
      s.canLead ? "canLead" : "noLead",
      s.isDirector ? "director" : null,
      s.capacityExempt ? "exempt" : null,
      s.forcePassword ? "mustChangePassword" : null,
    ]
      .filter(Boolean)
      .join(", ");
    console.log(`  ✓ ${s.email.padEnd(28)} ${flags}`);
  }

  console.log("\nTemporary password (Alexander + Morgan only):");
  console.log(`  ${TEMP_PASSWORD}`);
  console.log("  → must change on first password login (/change-password).\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nseed-staff-logins failed:", err);
    process.exit(1);
  });
