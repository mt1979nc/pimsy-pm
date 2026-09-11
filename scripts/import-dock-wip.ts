/**
 * Import live Dock Implementation WIP sites as customers + Implementation
 * projects (scaled playbook from the PIMSY Implementation template).
 *
 * Dates / leads: prefer Prism ACTIVE rows from seed-prism-import when the
 * acronym matches; otherwise use Dock targetEnd and Dock owners (canLead only).
 *
 * NEVER creates contacts. NEVER sends invite/registration emails.
 * Idempotent by projects.crmAcronym / projects.code. Skips GROK E2E if present.
 * Does not delete existing projects.
 *
 *   npx tsx --env-file-if-exists=.env.local --env-file-if-exists=.env \
 *     scripts/import-dock-wip.ts \
 *     [/workspace/shared-morning-snapshot-2026-09-11/dock-wip.json]
 *
 *   DOCK_WIP_JSON=/path/to/dock-wip.json npm run db:import:dock-wip
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import {
  customerAccounts,
  users,
  projects,
  projectMembers,
  projectTemplates,
  phases,
  tasks,
  milestones,
} from "@/db/schema";
import { parseDateInput, addDays } from "@/lib/dates";
import {
  resolvePlaybookScale,
  scheduleFromOffsets,
} from "@/lib/project-timeline";

// ---------------------------------------------------------------------------
// Prism ACTIVE (kickoff / go-live / owner) — mirrored from seed-prism-import
// ---------------------------------------------------------------------------

type PrismActive = {
  acronym: string;
  name: string;
  ownerEmail: string;
  kickoff: string | null;
  initialGoLive: string | null;
  currentGoLive: string | null;
  prekickoff?: boolean;
};

const PRISM_ACTIVE: PrismActive[] = [
  { acronym: "BHC", name: "BridgeHill Crossing", ownerEmail: "jeremy@pimsyehr.com", kickoff: "2026-08-24", initialGoLive: "2026-10-05", currentGoLive: null },
  { acronym: "CCCCARE", name: "Connected Community Care", ownerEmail: "danielle@pimsyehr.com", kickoff: "2026-08-07", initialGoLive: "2026-09-28", currentGoLive: "2026-10-05" },
  { acronym: "CEDAR", name: "CEDAR Health", ownerEmail: "alexander@pimsyehr.com", kickoff: "2026-08-12", initialGoLive: "2026-10-05", currentGoLive: "2026-10-05" },
  { acronym: "DYM", name: "DYM BHSO", ownerEmail: "danielle@pimsyehr.com", kickoff: "2026-08-19", initialGoLive: "2026-09-21", currentGoLive: "2026-09-21" },
  { acronym: "EBHKY", name: "Epic Behavioral Health - KY", ownerEmail: "danielle@pimsyehr.com", kickoff: "2026-07-07", initialGoLive: "2026-08-31", currentGoLive: "2026-09-21" },
  { acronym: "LECHRIS", name: "Le Chris Health Systems", ownerEmail: "alexander@pimsyehr.com", kickoff: "2026-03-11", initialGoLive: "2026-06-08", currentGoLive: "2026-10-26" },
  { acronym: "MMHSS", name: "Mid-Maine Homeless Shelter & Services", ownerEmail: "danielle@pimsyehr.com", kickoff: "2026-08-06", initialGoLive: "2026-09-21", currentGoLive: "2026-09-21" },
  { acronym: "PWMI", name: "Project Wellness", ownerEmail: "alexander@pimsyehr.com", kickoff: null, initialGoLive: null, currentGoLive: null, prekickoff: true },
  { acronym: "RBH", name: "Riverview Behavioral Health", ownerEmail: "jeremy@pimsyehr.com", kickoff: "2026-07-29", initialGoLive: "2026-09-28", currentGoLive: "2026-10-05" },
  { acronym: "SWMCCC", name: "SWMCCC Community Treatment Program", ownerEmail: "alexander@pimsyehr.com", kickoff: "2026-07-29", initialGoLive: "2026-09-21", currentGoLive: "2026-10-26" },
  { acronym: "THS", name: "Triangle Health Services", ownerEmail: "jeremy@pimsyehr.com", kickoff: "2026-08-14", initialGoLive: "2026-10-05", currentGoLive: "2026-10-05" },
];

const OWNER_NAME_TO_EMAIL: Record<string, string> = {
  "Alexander Morse": "alexander@pimsyehr.com",
  "Danielle Piper": "danielle@pimsyehr.com",
  "Jeremy Reals": "jeremy@pimsyehr.com",
  "Morgan Davis": "morgan@pimsyehr.com",
  "Mindy Douglas": "mindy@pimsyehr.com",
  "Anna Stokes": "anna@pimsyehr.com",
  "Dave Shepard": "david@pimsyehr.com",
  "Kori Hale": "kori@pimsyehr.com",
};

type DockWorkspace = {
  name: string;
  acronym: string;
  owners: string[];
  targetEnd: string | null;
  actualEnd: string | null;
};

type DockSnapshot = {
  workspaces: DockWorkspace[];
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function isGrokE2E(w: DockWorkspace) {
  const blob = `${w.name} ${w.acronym}`.toLowerCase();
  return blob.includes("grok") && blob.includes("e2e");
}

async function upsertCustomer(name: string) {
  let slug = slugify(name);
  const bySlug = await db.query.customerAccounts.findFirst({
    where: eq(customerAccounts.slug, slug),
    columns: { id: true },
  });
  if (bySlug) return bySlug.id;

  for (let i = 2; i < 100; i++) {
    const clash = await db.query.customerAccounts.findFirst({
      where: eq(customerAccounts.slug, `${slugify(name)}-${i}`),
      columns: { id: true },
    });
    if (!clash) {
      slug = `${slugify(name)}-${i}`;
      break;
    }
  }

  const [row] = await db
    .insert(customerAccounts)
    .values({
      name,
      slug,
      status: "ONBOARDING",
      seatCount: 0,
    })
    .returning({ id: customerAccounts.id });
  return row.id;
}

async function resolveLeadId(
  acronym: string,
  dockOwners: string[],
): Promise<string | null> {
  const prism = PRISM_ACTIVE.find((p) => p.acronym === acronym);
  const emails: string[] = [];
  if (prism) emails.push(prism.ownerEmail);
  for (const name of dockOwners) {
    const e = OWNER_NAME_TO_EMAIL[name];
    if (e) emails.push(e);
  }

  for (const email of emails) {
    const u = await db.query.users.findFirst({
      where: eq(users.email, email),
      columns: { id: true, canLead: true, isActive: true },
    });
    if (u?.isActive && u.canLead) return u.id;
  }
  return null;
}

async function materializePlaybook(opts: {
  projectId: string;
  templateId: string;
  kickoff: Date;
  targetGoLive: Date | null;
  leadId: string | null;
  createdById: string;
}) {
  const template = await db.query.projectTemplates.findFirst({
    where: eq(projectTemplates.id, opts.templateId),
    with: {
      phases: { with: { tasks: true }, orderBy: (p, { asc }) => [asc(p.order)] },
      milestones: { orderBy: (m, { asc }) => [asc(m.order)] },
    },
  });
  if (!template) throw new Error("Implementation template missing");

  const playbook = resolvePlaybookScale({
    kickoff: opts.kickoff,
    templateDurationDays: template.durationDays,
    forecastCalendarDays: null,
    targetGoLive: opts.targetGoLive,
  });
  const scaleFactor = playbook.scaleFactor;
  const targetGoLive = opts.targetGoLive ?? playbook.goLive;

  for (const tp of template.phases) {
    const { startDate: phaseStart, dueDate: phaseDue } = scheduleFromOffsets({
      anchor: opts.kickoff,
      offsetDays: tp.offsetDays,
      durationDays: tp.durationDays,
      scaleFactor,
    });
    const [phase] = await db
      .insert(phases)
      .values({
        projectId: opts.projectId,
        name: tp.name,
        description: tp.description,
        order: tp.order,
        visibility: tp.visibility,
        startDate: phaseStart,
        dueDate: phaseDue,
      })
      .returning({ id: phases.id });

    const orderedTasks = [...tp.tasks].sort((a, b) => a.order - b.order);
    const templateIdToTaskId = new Map<string, string>();
    const parents = orderedTasks.filter((tt) => !tt.parentTaskId);
    const children = orderedTasks.filter((tt) => tt.parentTaskId);
    for (const tt of [...parents, ...children]) {
      const { startDate: taskStart, dueDate: taskDue } = scheduleFromOffsets({
        anchor: phaseStart,
        offsetDays: tt.offsetDays,
        durationDays: tt.durationDays,
        scaleFactor,
      });
      const parentLiveId = tt.parentTaskId
        ? (templateIdToTaskId.get(tt.parentTaskId) ?? null)
        : null;
      const [created] = await db
        .insert(tasks)
        .values({
          projectId: opts.projectId,
          phaseId: phase.id,
          parentTaskId: parentLiveId,
          title: tt.title,
          description: tt.description,
          priority: tt.priority,
          visibility: tt.ownerSide === "CUSTOMER" ? ("SHARED" as const) : tt.visibility,
          ownerSide: tt.ownerSide,
          order: tt.order,
          startDate: taskStart,
          dueDate: taskDue,
          estimateHours: tt.estimateHours,
          assigneeId: tt.ownerSide === "INTERNAL" ? opts.leadId : null,
          createdById: opts.createdById,
        })
        .returning({ id: tasks.id });
      templateIdToTaskId.set(tt.id, created.id);
    }
  }

  if (template.milestones.length > 0) {
    await db.insert(milestones).values(
      template.milestones.map((tm) => {
        const { startDate: msDue } = scheduleFromOffsets({
          anchor: opts.kickoff,
          offsetDays: tm.offsetDays,
          durationDays: 0,
          scaleFactor,
        });
        return {
          projectId: opts.projectId,
          name: tm.name,
          description: tm.description,
          order: tm.order,
          visibility: tm.visibility,
          isGoLive: tm.isGoLive,
          dueDate: tm.isGoLive && targetGoLive ? targetGoLive : msDue,
        };
      }),
    );
  }

  return { targetGoLive, scaleFactor };
}

async function main() {
  const jsonPath =
    process.argv[2] ||
    process.env.DOCK_WIP_JSON ||
    "/workspace/shared-morning-snapshot-2026-09-11/dock-wip.json";

  const abs = resolve(jsonPath);
  console.log(`Dock WIP import ← ${abs}\n`);
  console.log("NOTE: contacts are NOT created; no invite/registration emails are sent.\n");

  const snap = JSON.parse(readFileSync(abs, "utf8")) as DockSnapshot;
  const workspaces = snap.workspaces ?? [];
  if (workspaces.length === 0) {
    console.error("No workspaces in snapshot.");
    process.exit(1);
  }

  const template = await db.query.projectTemplates.findFirst({
    where: eq(projectTemplates.name, "PIMSY Implementation"),
    columns: { id: true, durationDays: true, name: true },
  });
  if (!template) {
    console.error('Template "PIMSY Implementation" not found — run npm run db:seed -- --templates-only first.');
    process.exit(1);
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
  if (!actor) {
    console.error("No OWNER / alexander@pimsyehr.com to attribute createdBy — run seed-staff-logins first.");
    process.exit(1);
  }

  const imported: string[] = [];
  const skipped: string[] = [];

  for (const w of workspaces) {
    const acronym = (w.acronym || "").trim().toUpperCase();
    if (!acronym) {
      console.log(`  · skip (no acronym): ${w.name}`);
      skipped.push(w.name);
      continue;
    }
    if (isGrokE2E(w) || acronym === "GROK" || acronym.includes("GROK")) {
      console.log(`  · skip GROK E2E: ${acronym}`);
      skipped.push(acronym);
      continue;
    }

    const existing = await db.query.projects.findFirst({
      where: or(eq(projects.crmAcronym, acronym), eq(projects.code, acronym)),
      columns: { id: true, code: true, crmAcronym: true },
    });
    if (existing) {
      console.log(`  · ${acronym} already present (${existing.code}) — skip`);
      skipped.push(acronym);
      continue;
    }

    const prism = PRISM_ACTIVE.find((p) => p.acronym === acronym);
    const customerId = await upsertCustomer(prism?.name ?? w.name);
    const leadId = await resolveLeadId(acronym, w.owners ?? []);

    const dockGoLive = w.targetEnd ? parseDateInput(w.targetEnd) : null;
    const kickoff =
      (prism?.kickoff ? parseDateInput(prism.kickoff) : null) ??
      (dockGoLive ? addDays(dockGoLive, -template.durationDays) : new Date());
    const initialGoLive =
      (prism?.initialGoLive ? parseDateInput(prism.initialGoLive) : null) ?? dockGoLive;
    const targetGoLive =
      (prism?.currentGoLive
        ? parseDateInput(prism.currentGoLive)
        : null) ??
      initialGoLive ??
      dockGoLive;

    const status = prism?.prekickoff ? ("NOT_STARTED" as const) : ("IN_PROGRESS" as const);

    const [project] = await db
      .insert(projects)
      .values({
        name: `${prism?.name ?? w.name} — PIMSY implementation`,
        code: acronym,
        type: "IMPLEMENTATION",
        status,
        customerAccountId: customerId,
        leadId,
        startDate: kickoff,
        initialGoLiveDate: initialGoLive,
        targetGoLiveDate: targetGoLive,
        templateId: template.id,
        portalEnabled: true,
        crmAcronym: acronym,
        prismClientId: acronym,
        prismStatus: prism?.prekickoff ? "pre-kickoff" : "active",
        description:
          "Imported from Dock Implementation WIP snapshot. No customer contacts were created; invites were not sent.",
        ownerSplitPercent: 100,
      })
      .returning({ id: projects.id });

    if (leadId) {
      await db
        .insert(projectMembers)
        .values({ projectId: project.id, userId: leadId, role: "LEAD" })
        .onConflictDoNothing();
    }

    const { scaleFactor } = await materializePlaybook({
      projectId: project.id,
      templateId: template.id,
      kickoff: kickoff!,
      targetGoLive,
      leadId,
      createdById: actor.id,
    });

    // Ensure project go-live matches scaled playbook when Dock/Prism omitted it.
    if (!targetGoLive) {
      const playbook = resolvePlaybookScale({
        kickoff: kickoff!,
        templateDurationDays: template.durationDays,
        forecastCalendarDays: null,
        targetGoLive: null,
      });
      await db
        .update(projects)
        .set({
          targetGoLiveDate: playbook.goLive,
          initialGoLiveDate: playbook.goLive,
        })
        .where(eq(projects.id, project.id));
    }

    imported.push(acronym);
    console.log(
      `  ✓ ${acronym} — lead=${leadId ? "set" : "none"} scale=${scaleFactor.toFixed(2)} kickoff=${kickoff?.toISOString().slice(0, 10) ?? "?"} goLive=${targetGoLive?.toISOString().slice(0, 10) ?? "?"}`,
    );
  }

  console.log(`\nImported acronyms (${imported.length}): ${imported.join(", ") || "(none)"}`);
  console.log(`Skipped (${skipped.length}): ${skipped.join(", ") || "(none)"}`);
  console.log("\nDone. No contacts created. No emails sent.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nimport-dock-wip failed:", err);
    process.exit(1);
  });
