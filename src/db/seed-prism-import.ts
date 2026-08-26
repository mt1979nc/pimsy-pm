/**
 * One-time historical import from PRISM (Pipeline Resource & Implementation
 * Staffing Monitor) — the separate forecasting/analytics tool this data used
 * to live in. Brings its book of business (13 active/pre-kickoff engagements
 * and 38 completed implementations, as of the 2026-08-25 PRISM review) into
 * Patio's real schema, so /reports/analysis has a real on-time baseline and
 * the estimator can be checked against real history from day one instead of
 * starting cold.
 *
 * Safe to re-run: every project is upserted on its PRISM acronym as the
 * project code, and every customer on a slug derived from its name, so a
 * partial run gets repaired rather than duplicated.
 *
 *   npm run db:seed:prism-import
 *
 * What this does NOT attempt to bring over, and why:
 *  - Individual slip *events* for accounts that re-slipped more than once
 *    (LECHRIS ×3, MHC ×1, FFCS ×2, SWMCCC ×3) — PRISM only ever showed the
 *    net total, not each event's date/size. One aggregate, untagged
 *    slip_event is recorded per account instead of fabricating a breakdown
 *    that was never observed.
 *  - Task/phase-level detail for any of these 51 engagements — PRISM never
 *    tracked tasks, only phase-level hour/day estimates, so these projects
 *    are created without a template and without child phases/tasks. They're
 *    portfolio/analytics records, not live task boards.
 *  - Per-project service lines for the 38 completed implementations — PRISM's
 *    completed-implementation table recorded complexity tier and hours but
 *    not the service-line list. Only the 13 active/pre-kickoff records (which
 *    came from PRISM's live Customer Roster) carry service lines.
 */

import { eq } from "drizzle-orm";
import { db } from "./index";
import { customerAccounts, users, projects, projectMembers, projectScopes, slipEvents } from "./schema";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Staff — matched by email to PIMSY's real address convention. If a user
// already exists for that email, only capacity/name are filled in where
// missing; an existing role (e.g. the bootstrap OWNER) is never downgraded.
// ---------------------------------------------------------------------------

const PRISM_STAFF = [
  { key: "Alexander", email: "alexander@pimsyehr.com", name: "Alexander Morse", capacityHoursPerWeek: 30, active: true },
  { key: "Danielle", email: "danielle.piper@pimsyehr.com", name: "Danielle Piper", capacityHoursPerWeek: 30, active: true },
  { key: "Jeremy", email: "jeremy.reals@pimsyehr.com", name: "Jeremy Reals", capacityHoursPerWeek: 30, active: true },
  { key: "Morgan", email: "morgan.davis@pimsyehr.com", name: "Morgan Davis", capacityHoursPerWeek: 23, active: true },
  // Departed before this import — kept for history, not for assignment.
  { key: "ReShawn", email: "reshawn.beard@pimsyehr.com", name: "ReShawn Beard", capacityHoursPerWeek: 30, active: false },
] as const;

type StaffKey = (typeof PRISM_STAFF)[number]["key"];

// ---------------------------------------------------------------------------
// Active + pre-kickoff engagements, from PRISM's Customer Roster (v6.4).
// ---------------------------------------------------------------------------

type ActiveRow = {
  acronym: string;
  name: string;
  owner: StaffKey;
  users: number;
  trainingsPerWeek: number;
  serviceLines: string[];
  complexityTier: "STANDARD" | "MODERATE" | "HIGH";
  estimatedHours: number;
  kickoff: string | null;
  initialGoLive: string | null;
  currentGoLive: string | null;
  prekickoff?: boolean;
};

const ACTIVE: ActiveRow[] = [
  { acronym: "BHC", name: "BridgeHill Crossing", owner: "Jeremy", users: 6, trainingsPerWeek: 2, serviceLines: ["OUTPATIENT_THERAPY", "MEDICATION_MANAGEMENT", "MAT", "OTHER_SERVICES"], complexityTier: "STANDARD", estimatedHours: 30.5, kickoff: "2026-08-24", initialGoLive: "2026-10-05", currentGoLive: null },
  { acronym: "CCCCARE", name: "Connected Community Care", owner: "Danielle", users: 12, trainingsPerWeek: 2, serviceLines: ["OUTPATIENT_THERAPY", "GROUP_THERAPY", "MESSAGING", "PAYROLL"], complexityTier: "MODERATE", estimatedHours: 33.8, kickoff: "2026-08-07", initialGoLive: "2026-09-28", currentGoLive: "2026-10-05" },
  { acronym: "CEDAR", name: "CEDAR Health", owner: "Alexander", users: 9, trainingsPerWeek: 2, serviceLines: ["OUTPATIENT_THERAPY", "MEDICATION_MANAGEMENT", "IOP", "GROUP_THERAPY", "MESSAGING", "LABS", "OTHER_SERVICES"], complexityTier: "STANDARD", estimatedHours: 42.8, kickoff: "2026-08-12", initialGoLive: "2026-10-05", currentGoLive: "2026-10-05" },
  { acronym: "DYM", name: "DYM BHSO", owner: "Danielle", users: 10, trainingsPerWeek: 3, serviceLines: ["OUTPATIENT_THERAPY", "GROUP_THERAPY", "OTHER_SERVICES"], complexityTier: "STANDARD", estimatedHours: 27.3, kickoff: "2026-08-19", initialGoLive: "2026-09-21", currentGoLive: "2026-09-21" },
  { acronym: "EBHKY", name: "Epic Behavioral Health - KY", owner: "Danielle", users: 15, trainingsPerWeek: 2, serviceLines: ["OUTPATIENT_THERAPY", "MEDICATION_MANAGEMENT", "MAT", "IOP", "GROUP_THERAPY", "PSYCH_TESTING", "MESSAGING", "OTHER_SERVICES"], complexityTier: "MODERATE", estimatedHours: 36.1, kickoff: "2026-07-07", initialGoLive: "2026-08-31", currentGoLive: "2026-09-21" },
  { acronym: "FFCS", name: "Family First Community Services", owner: "Jeremy", users: 40, trainingsPerWeek: 2, serviceLines: ["OUTPATIENT_THERAPY", "MEDICATION_MANAGEMENT", "GROUP_THERAPY", "MESSAGING", "PAYROLL", "OTHER_SERVICES"], complexityTier: "MODERATE", estimatedHours: 39.4, kickoff: "2026-06-05", initialGoLive: "2026-08-05", currentGoLive: "2026-08-31" },
  { acronym: "LECHRIS", name: "Le Chris Health Systems", owner: "Alexander", users: 170, trainingsPerWeek: 2, serviceLines: ["MEDICATION_MANAGEMENT", "GROUP_THERAPY", "PSR_PSYCHOSOCIAL_REHAB"], complexityTier: "HIGH", estimatedHours: 45, kickoff: "2026-03-11", initialGoLive: "2026-06-08", currentGoLive: "2026-10-26" },
  { acronym: "MHC", name: "Mental Health Connecticut", owner: "Jeremy", users: 200, trainingsPerWeek: 2, serviceLines: ["INPATIENT_RESIDENTIAL"], complexityTier: "HIGH", estimatedHours: 4, kickoff: "2026-01-05", initialGoLive: "2026-03-01", currentGoLive: "2026-09-01" },
  { acronym: "MMHSS", name: "Mid-Maine Homeless Shelter & Services", owner: "Danielle", users: 15, trainingsPerWeek: 2, serviceLines: ["OUTPATIENT_THERAPY", "IOP", "GROUP_THERAPY"], complexityTier: "MODERATE", estimatedHours: 31.8, kickoff: "2026-08-06", initialGoLive: "2026-09-21", currentGoLive: "2026-09-21" },
  { acronym: "PWMI", name: "Project Wellness", owner: "Alexander", users: 3, trainingsPerWeek: 2, serviceLines: ["OUTPATIENT_THERAPY", "MEDICATION_MANAGEMENT", "MESSAGING"], complexityTier: "STANDARD", estimatedHours: 29.8, kickoff: null, initialGoLive: null, currentGoLive: null, prekickoff: true },
  { acronym: "RBH", name: "Riverview Behavioral Health", owner: "Jeremy", users: 5, trainingsPerWeek: 2, serviceLines: ["PHP", "GROUP_THERAPY"], complexityTier: "STANDARD", estimatedHours: 27.9, kickoff: "2026-07-29", initialGoLive: "2026-09-28", currentGoLive: "2026-10-05" },
  { acronym: "SWMCCC", name: "SWMCCC Community Treatment Program", owner: "Alexander", users: 4, trainingsPerWeek: 2, serviceLines: ["OUTPATIENT_THERAPY", "MAT", "IOP", "GROUP_THERAPY"], complexityTier: "STANDARD", estimatedHours: 39.8, kickoff: "2026-07-29", initialGoLive: "2026-09-21", currentGoLive: "2026-10-26" },
  { acronym: "THS", name: "Triangle Health Services", owner: "Jeremy", users: 8, trainingsPerWeek: 2, serviceLines: ["OUTPATIENT_THERAPY", "IOP", "GROUP_THERAPY", "PSR_PSYCHOSOCIAL_REHAB", "EFAX", "EVV"], complexityTier: "STANDARD", estimatedHours: 35.4, kickoff: "2026-08-14", initialGoLive: "2026-10-05", currentGoLive: "2026-10-05" },
];

// ---------------------------------------------------------------------------
// Completed implementations, from PRISM's Analysis + Capacity "Completed"
// tables. `forecastDays` is null for the one record PRISM itself recorded as
// incomplete data (ICT) — initialGoLiveDate is left unset for that one.
// ---------------------------------------------------------------------------

type CompletedRow = {
  acronym: string;
  name: string;
  owner: StaffKey;
  users: number;
  complexityTier: "STANDARD" | "MODERATE" | "HIGH";
  estimatedHours: number;
  kickoff: string;
  forecastDays: number | null;
  actualGoLive: string;
  era: "legacy" | "current";
};

const COMPLETED: CompletedRow[] = [
  { acronym: "LIFECONN", name: "Life Connections", owner: "Alexander", users: 100, complexityTier: "MODERATE", estimatedHours: 35.9, kickoff: "2026-06-01", forecastDays: 63, actualGoLive: "2026-08-17", era: "current" },
  { acronym: "SENSORI", name: "SensoriWorks", owner: "Jeremy", users: 7, complexityTier: "STANDARD", estimatedHours: 38.6, kickoff: "2026-02-03", forecastDays: 48, actualGoLive: "2026-08-10", era: "current" },
  { acronym: "CAPSTONE", name: "Capstone Behavioral", owner: "Alexander", users: 30, complexityTier: "MODERATE", estimatedHours: 37.8, kickoff: "2026-05-12", forecastDays: 62, actualGoLive: "2026-07-28", era: "current" },
  { acronym: "RENWICK", name: "Renwick Recovery", owner: "Jeremy", users: 5, complexityTier: "STANDARD", estimatedHours: 41.9, kickoff: "2026-01-13", forecastDays: 48, actualGoLive: "2026-07-27", era: "current" },
  { acronym: "GHW", name: "Greentree", owner: "Morgan", users: 7, complexityTier: "STANDARD", estimatedHours: 38.1, kickoff: "2026-05-18", forecastDays: 63, actualGoLive: "2026-07-20", era: "current" },
  { acronym: "LBH", name: "Lakeside Behavioral Health", owner: "Danielle", users: 14, complexityTier: "MODERATE", estimatedHours: 34.5, kickoff: "2026-01-21", forecastDays: 54, actualGoLive: "2026-07-20", era: "legacy" },
  { acronym: "ROH", name: "Rae of Hope", owner: "Danielle", users: 8, complexityTier: "STANDARD", estimatedHours: 28.3, kickoff: "2026-04-27", forecastDays: 35, actualGoLive: "2026-06-22", era: "current" },
  { acronym: "EHW", name: "Elevate Health & Wellness", owner: "Jeremy", users: 6, complexityTier: "MODERATE", estimatedHours: 43.7, kickoff: "2025-11-21", forecastDays: 108, actualGoLive: "2026-06-01", era: "legacy" },
  { acronym: "NEOES", name: "Easterseals of NE Ohio", owner: "Alexander", users: 30, complexityTier: "MODERATE", estimatedHours: 40.1, kickoff: "2026-01-14", forecastDays: 124, actualGoLive: "2026-05-18", era: "current" },
  { acronym: "SMSS", name: "Southern Maine Support Services", owner: "Alexander", users: 2, complexityTier: "STANDARD", estimatedHours: 19.5, kickoff: "2026-04-06", forecastDays: 28, actualGoLive: "2026-05-18", era: "current" },
  { acronym: "RPI", name: "Resilient", owner: "Danielle", users: 2, complexityTier: "STANDARD", estimatedHours: 29.8, kickoff: "2026-04-07", forecastDays: 42, actualGoLive: "2026-05-11", era: "current" },
  { acronym: "ABQW", name: "ABQ Wellness", owner: "Jeremy", users: 6, complexityTier: "STANDARD", estimatedHours: 28.8, kickoff: "2026-03-06", forecastDays: 38, actualGoLive: "2026-05-05", era: "current" },
  { acronym: "MPA", name: "McAlester Psychological Associates", owner: "Morgan", users: 10, complexityTier: "STANDARD", estimatedHours: 35.8, kickoff: "2026-03-12", forecastDays: 46, actualGoLive: "2026-04-27", era: "current" },
  { acronym: "DPS", name: "Dickinson Psychological Services", owner: "Jeremy", users: 2, complexityTier: "STANDARD", estimatedHours: 22.3, kickoff: "2026-01-29", forecastDays: 39, actualGoLive: "2026-03-30", era: "current" },
  { acronym: "GTS", name: "Gard Therapeutic Services", owner: "Danielle", users: 1, complexityTier: "STANDARD", estimatedHours: 39.2, kickoff: "2026-01-28", forecastDays: 58, actualGoLive: "2026-03-27", era: "current" },
  { acronym: "UES", name: "Urban Evaluation Solution", owner: "Alexander", users: 7, complexityTier: "STANDARD", estimatedHours: 23.3, kickoff: "2026-02-06", forecastDays: 45, actualGoLive: "2026-03-18", era: "current" },
  { acronym: "AVOH", name: "Anthony's Villa", owner: "Danielle", users: 25, complexityTier: "MODERATE", estimatedHours: 21.4, kickoff: "2025-11-06", forecastDays: 88, actualGoLive: "2026-02-16", era: "legacy" },
  { acronym: "MPB", name: "MPB Group", owner: "Danielle", users: 40, complexityTier: "MODERATE", estimatedHours: 33.8, kickoff: "2025-10-22", forecastDays: 72, actualGoLive: "2026-02-02", era: "legacy" },
  { acronym: "EMPNV", name: "The Empowerment Center", owner: "Danielle", users: 16, complexityTier: "MODERATE", estimatedHours: 26.3, kickoff: "2025-06-10", forecastDays: 285, actualGoLive: "2026-01-23", era: "legacy" },
  { acronym: "CVMH", name: "Central Valley Mental Health", owner: "Danielle", users: 6, complexityTier: "STANDARD", estimatedHours: 23.7, kickoff: "2025-12-22", forecastDays: 28, actualGoLive: "2026-01-19", era: "legacy" },
  { acronym: "CANVAS", name: "Canvas Outpatient", owner: "ReShawn", users: 4, complexityTier: "STANDARD", estimatedHours: 25.3, kickoff: "2025-12-10", forecastDays: 26, actualGoLive: "2026-01-05", era: "legacy" },
  { acronym: "GGNC", name: "Growth & Grace", owner: "Danielle", users: 5, complexityTier: "STANDARD", estimatedHours: 24.4, kickoff: "2025-11-04", forecastDays: 38, actualGoLive: "2025-12-12", era: "legacy" },
  { acronym: "OMEGA", name: "Omega Behavior Health Solutions", owner: "ReShawn", users: 6, complexityTier: "STANDARD", estimatedHours: 19.8, kickoff: "2025-06-17", forecastDays: 55, actualGoLive: "2025-12-10", era: "legacy" },
  { acronym: "ICT", name: "ICT Case Management", owner: "ReShawn", users: 15, complexityTier: "MODERATE", estimatedHours: 22.1, kickoff: "2025-09-25", forecastDays: null, actualGoLive: "2025-12-01", era: "legacy" },
  { acronym: "CPP", name: "Creative Passion Partners", owner: "Jeremy", users: 5, complexityTier: "STANDARD", estimatedHours: 19.7, kickoff: "2025-08-11", forecastDays: 39, actualGoLive: "2025-10-07", era: "legacy" },
  { acronym: "RENEW", name: "Renew Counseling Center", owner: "ReShawn", users: 9, complexityTier: "STANDARD", estimatedHours: 22, kickoff: "2025-09-02", forecastDays: 34, actualGoLive: "2025-10-06", era: "legacy" },
  { acronym: "FORTALEZA", name: "Fortaleza", owner: "ReShawn", users: 3, complexityTier: "STANDARD", estimatedHours: 25, kickoff: "2025-08-07", forecastDays: 18, actualGoLive: "2025-09-22", era: "legacy" },
  { acronym: "C2C", name: "Courage to Caregivers", owner: "ReShawn", users: 5, complexityTier: "STANDARD", estimatedHours: 19.7, kickoff: "2025-07-24", forecastDays: 31, actualGoLive: "2025-09-15", era: "legacy" },
  { acronym: "TMSNC", name: "TMS of the Carolinas", owner: "Danielle", users: 18, complexityTier: "MODERATE", estimatedHours: 24.2, kickoff: "2025-07-08", forecastDays: 56, actualGoLive: "2025-09-02", era: "legacy" },
  { acronym: "ITOWA", name: "ITOWA Services", owner: "Jeremy", users: 4, complexityTier: "STANDARD", estimatedHours: 19.6, kickoff: "2025-06-18", forecastDays: 13, actualGoLive: "2025-09-01", era: "legacy" },
  { acronym: "PPSYCH", name: "Professional Psychiatric Services", owner: "Danielle", users: 11, complexityTier: "MODERATE", estimatedHours: 30.1, kickoff: "2025-03-20", forecastDays: 87, actualGoLive: "2025-08-25", era: "legacy" },
  { acronym: "FIRM", name: "Firm Foundation to Thrive", owner: "Jeremy", users: 10, complexityTier: "STANDARD", estimatedHours: 20.6, kickoff: "2025-04-23", forecastDays: 68, actualGoLive: "2025-08-04", era: "legacy" },
  { acronym: "SWC", name: "Serenity Wellness Center", owner: "Danielle", users: 21, complexityTier: "STANDARD", estimatedHours: 25.5, kickoff: "2025-06-02", forecastDays: 60, actualGoLive: "2025-08-01", era: "legacy" },
  { acronym: "ABOVE", name: "Above it All", owner: "Danielle", users: 10, complexityTier: "STANDARD", estimatedHours: 23, kickoff: "2025-06-06", forecastDays: 56, actualGoLive: "2025-07-14", era: "legacy" },
  { acronym: "CRC", name: "Crossroads", owner: "Danielle", users: 3, complexityTier: "STANDARD", estimatedHours: 19.6, kickoff: "2025-02-28", forecastDays: 94, actualGoLive: "2025-06-02", era: "legacy" },
  { acronym: "EAVES", name: "Eaves Health Partners", owner: "Danielle", users: 21, complexityTier: "MODERATE", estimatedHours: 21.1, kickoff: "2025-02-13", forecastDays: 109, actualGoLive: "2025-06-02", era: "legacy" },
  { acronym: "RCA", name: "Recovery Club America", owner: "Danielle", users: 15, complexityTier: "MODERATE", estimatedHours: 20.6, kickoff: "2025-03-21", forecastDays: 73, actualGoLive: "2025-06-02", era: "legacy" },
  { acronym: "CCSIC", name: "Congruent Counseling/Integrative Counseling", owner: "Danielle", users: 79, complexityTier: "HIGH", estimatedHours: 30.3, kickoff: "2025-02-27", forecastDays: 63, actualGoLive: "2025-05-12", era: "legacy" },
];

// ---------------------------------------------------------------------------

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function addDaysUTC(d: Date, days: number) {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

async function upsertStaff(): Promise<Record<StaffKey, string>> {
  const ids = {} as Record<StaffKey, string>;
  for (const s of PRISM_STAFF) {
    const existing = await db.query.users.findFirst({
      where: eq(users.email, s.email),
      columns: { id: true, name: true, capacityHoursPerWeek: true },
    });
    if (existing) {
      ids[s.key] = existing.id;
      await db
        .update(users)
        .set({
          name: existing.name ?? s.name,
          capacityHoursPerWeek: s.capacityHoursPerWeek,
          isActive: s.active,
        })
        .where(eq(users.id, existing.id));
      continue;
    }
    // Auth.js only promotes an address to OWNER the moment it creates that
    // user's row for the very first time (src/auth.ts's createUser event). If
    // this import inserts the bootstrap owner's row first — which it does on
    // a fresh install, since setup runs before anyone has signed in — that
    // promotion never fires and the owner is stuck as a plain specialist.
    // Match auth.ts's own bootstrap rule here so the two can't race.
    const isBootstrapOwner = env.BOOTSTRAP_OWNER_EMAIL && s.email.toLowerCase() === env.BOOTSTRAP_OWNER_EMAIL;

    const [row] = await db
      .insert(users)
      .values({
        email: s.email,
        name: s.name,
        role: isBootstrapOwner ? "OWNER" : "SPECIALIST",
        title: isBootstrapOwner ? "Owner" : "Implementation Specialist",
        capacityHoursPerWeek: s.capacityHoursPerWeek,
        isActive: s.active,
      })
      .returning({ id: users.id });
    ids[s.key] = row.id;
  }
  return ids;
}

async function upsertCustomer(name: string, seatCount: number, status: "ONBOARDING" | "LIVE") {
  let slug = slugify(name);
  const existing = await db.query.customerAccounts.findFirst({ where: eq(customerAccounts.slug, slug) });
  if (existing) return existing.id;
  for (let i = 2; i < 100; i++) {
    const clash = await db.query.customerAccounts.findFirst({ where: eq(customerAccounts.slug, slug) });
    if (!clash) break;
    slug = `${slugify(name)}-${i}`;
  }
  const [row] = await db
    .insert(customerAccounts)
    .values({ name, slug, seatCount, status })
    .returning({ id: customerAccounts.id });
  return row.id;
}

async function importActive(staffIds: Record<StaffKey, string>) {
  for (const row of ACTIVE) {
    const existing = await db.query.projects.findFirst({ where: eq(projects.code, row.acronym) });
    if (existing) {
      console.log(`  · ${row.acronym} already imported, skipping`);
      continue;
    }
    const customerId = await upsertCustomer(row.name, row.users, "ONBOARDING");
    const leadId = staffIds[row.owner];

    const [project] = await db
      .insert(projects)
      .values({
        name: `${row.name} — PIMSY implementation`,
        code: row.acronym,
        type: "IMPLEMENTATION",
        status: row.prekickoff ? "NOT_STARTED" : "IN_PROGRESS",
        customerAccountId: customerId,
        leadId,
        startDate: row.kickoff ? new Date(row.kickoff) : null,
        initialGoLiveDate: row.initialGoLive ? new Date(row.initialGoLive) : null,
        targetGoLiveDate: row.currentGoLive
          ? new Date(row.currentGoLive)
          : row.initialGoLive
            ? new Date(row.initialGoLive)
            : null,
        estimatedHours: Math.round(row.estimatedHours),
        portalEnabled: true,
        description: "Imported from PRISM — the pipeline/capacity forecasting tool this project's data used to live in, before PRISM's estimator and analytics were folded into Patio.",
      })
      .returning({ id: projects.id });

    await db.insert(projectMembers).values({ projectId: project.id, userId: leadId, role: "LEAD" }).onConflictDoNothing();

    await db.insert(projectScopes).values({
      projectId: project.id,
      userCount: row.users,
      locationCount: 1,
      formPageCount: 25,
      trainingsPerWeek: row.trainingsPerWeek,
      serviceLines: row.serviceLines,
      complexityTier: row.complexityTier,
      estimatedHours: row.estimatedHours,
      discoveryScenario: "TYPICAL",
    });

    // One aggregate slip event when PRISM's roster showed the current go-live
    // had moved past the initial commitment. See file header — the individual
    // re-slip events (LECHRIS ×3, etc.) weren't preserved at that granularity.
    if (row.initialGoLive && row.currentGoLive && row.initialGoLive !== row.currentGoLive) {
      const days = Math.round(
        (new Date(row.currentGoLive).getTime() - new Date(row.initialGoLive).getTime()) / 86_400_000,
      );
      await db.insert(slipEvents).values({
        projectId: project.id,
        fromDate: new Date(row.initialGoLive),
        toDate: new Date(row.currentGoLive),
        days,
        cause: null,
        note: "Aggregate total imported from PRISM — the individual re-slip events weren't preserved at that granularity.",
        createdById: null,
      });
    }

    console.log(`  ✓ ${row.acronym} — ${row.name}`);
  }
}

async function importCompleted(staffIds: Record<StaffKey, string>) {
  for (const row of COMPLETED) {
    const existing = await db.query.projects.findFirst({ where: eq(projects.code, row.acronym) });
    if (existing) {
      console.log(`  · ${row.acronym} already imported, skipping`);
      continue;
    }
    const customerId = await upsertCustomer(row.name, row.users, "LIVE");
    const leadId = staffIds[row.owner];
    const kickoff = new Date(row.kickoff);
    const actualGoLive = new Date(row.actualGoLive);
    const initialGoLive = row.forecastDays !== null ? addDaysUTC(kickoff, row.forecastDays) : null;

    const [project] = await db
      .insert(projects)
      .values({
        name: `${row.name} — PIMSY implementation`,
        code: row.acronym,
        type: "IMPLEMENTATION",
        status: "COMPLETED",
        customerAccountId: customerId,
        leadId,
        startDate: kickoff,
        initialGoLiveDate: initialGoLive,
        targetGoLiveDate: initialGoLive ?? actualGoLive,
        actualGoLiveDate: actualGoLive,
        estimatedHours: Math.round(row.estimatedHours),
        portalEnabled: false,
        archivedAt: new Date(),
        description: `Imported from PRISM (${row.era} process). This project's data used to live in a separate forecasting tool before PRISM's estimator and analytics were folded into Patio.`,
      })
      .returning({ id: projects.id });

    await db.insert(projectMembers).values({ projectId: project.id, userId: leadId, role: "LEAD" }).onConflictDoNothing();

    await db.insert(projectScopes).values({
      projectId: project.id,
      userCount: row.users,
      locationCount: 1,
      formPageCount: 25,
      trainingsPerWeek: 2,
      serviceLines: [],
      complexityTier: row.complexityTier,
      estimatedHours: row.estimatedHours,
      discoveryScenario: "TYPICAL",
    });

    if (initialGoLive && initialGoLive.getTime() !== actualGoLive.getTime()) {
      const days = Math.round((actualGoLive.getTime() - initialGoLive.getTime()) / 86_400_000);
      await db.insert(slipEvents).values({
        projectId: project.id,
        fromDate: initialGoLive,
        toDate: actualGoLive,
        days,
        cause: null,
        note: "Backfilled from PRISM's forecast-vs-actual variance — imported in aggregate, not as individual events.",
        createdById: null,
      });
    }

    console.log(`  ✓ ${row.acronym} — ${row.name} (completed)`);
  }
}

async function main() {
  console.log("Importing PRISM history into Patio…\n");

  console.log("Staff:");
  const staffIds = await upsertStaff();
  for (const s of PRISM_STAFF) console.log(`  ✓ ${s.name}${s.active ? "" : " (former — kept for history)"}`);

  console.log("\nActive / pre-kickoff engagements:");
  await importActive(staffIds);

  console.log("\nCompleted implementations:");
  await importCompleted(staffIds);

  const totalProjects = ACTIVE.length + COMPLETED.length;
  await audit({
    actor: { id: staffIds.Alexander, email: "alexander@pimsyehr.com", name: "Alexander Morse", role: "OWNER", customerAccountId: null, isActive: true },
    action: "prism.import.completed",
    entityType: "system",
    entityId: "prism-import",
    summary: `Imported ${totalProjects} engagements from PRISM`,
    metadata: { active: ACTIVE.length, completed: COMPLETED.length },
  });

  console.log(`\nDone — ${ACTIVE.length} active/pre-kickoff + ${COMPLETED.length} completed imported.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("PRISM import failed:", err);
    process.exit(1);
  });
