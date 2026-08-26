/**
 * Seeds templates and a small amount of demo data.
 *
 * Safe to re-run, and safe to re-run after a failure: templates are replaced
 * by name, and demo customers are keyed on their project code so a run that
 * died partway through gets repaired rather than skipped. It never touches
 * real customer records.
 *
 *   npm run db:seed
 *   npm run db:seed -- --templates-only     # production: no demo data
 */

import { eq } from "drizzle-orm";
import { db } from "./index";
import {
  projectTemplates,
  templatePhases,
  templateTasks,
  templateMilestones,
  customerAccounts,
  users,
  projects,
  projectMembers,
  phases,
  tasks,
  milestones,
  messageThreads,
  messages,
  threadParticipants,
} from "./schema";
import { IMPLEMENTATION_TEMPLATE, RCM_TEMPLATE } from "./template-implementation";
import { addDays } from "@/lib/dates";

type TemplateSeed = typeof IMPLEMENTATION_TEMPLATE | typeof RCM_TEMPLATE;

async function seedTemplate(seed: TemplateSeed) {
  const existing = await db.query.projectTemplates.findFirst({
    where: eq(projectTemplates.name, seed.name),
    columns: { id: true },
  });
  if (existing) {
    // Cascades to phases, tasks and milestones.
    await db.delete(projectTemplates).where(eq(projectTemplates.id, existing.id));
  }

  const [tpl] = await db
    .insert(projectTemplates)
    .values({
      name: seed.name,
      description: seed.description,
      type: seed.type,
      durationDays: seed.durationDays,
      isActive: true,
    })
    .returning({ id: projectTemplates.id });

  let phaseOrder = 0;
  let taskTotal = 0;

  for (const p of seed.phases) {
    const [phase] = await db
      .insert(templatePhases)
      .values({
        templateId: tpl.id,
        name: p.name,
        description: "description" in p ? (p.description ?? null) : null,
        order: phaseOrder++,
        visibility: p.visibility,
        offsetDays: p.offsetDays,
        durationDays: p.durationDays,
      })
      .returning({ id: templatePhases.id });

    let taskOrder = 0;
    if (p.tasks.length > 0) {
      await db.insert(templateTasks).values(
        p.tasks.map((t) => ({
          phaseId: phase.id,
          title: t.title,
          order: taskOrder++,
          priority: t.priority ?? ("MEDIUM" as const),
          visibility: t.ownerSide === "CUSTOMER" ? ("SHARED" as const) : (t.visibility ?? "INTERNAL"),
          ownerSide: t.ownerSide,
          offsetDays: t.offsetDays ?? 0,
          durationDays: t.durationDays ?? 2,
          estimateHours: t.estimateHours ?? null,
        })),
      );
      taskTotal += p.tasks.length;
    }
  }

  if (seed.milestones.length > 0) {
    await db.insert(templateMilestones).values(
      seed.milestones.map((m, i) => ({
        templateId: tpl.id,
        name: m.name,
        order: i,
        offsetDays: m.offsetDays,
        visibility: m.visibility,
        isGoLive: m.isGoLive,
      })),
    );
  }

  console.log(
    `  ✓ ${seed.name}: ${seed.phases.length} phases, ${taskTotal} tasks, ${seed.milestones.length} milestones`,
  );
  return tpl.id;
}

const DEMO_SPECIALIST_EMAIL = "demo.specialist@pimsyehr.com";

const DEMO_CUSTOMERS = [
  {
    name: "Riverbend Counseling Group",
    slug: "riverbend-counseling",
    practiceType: "Outpatient Behavioral Health",
    seatCount: 28,
    priorSystem: "TherapyNotes",
    city: "Asheville",
    state: "NC",
    status: "ONBOARDING" as const,
  },
  {
    name: "Northgate Recovery Services",
    slug: "northgate-recovery",
    practiceType: "SUD Treatment / MAT",
    seatCount: 64,
    priorSystem: "Kipu",
    city: "Columbus",
    state: "OH",
    status: "ONBOARDING" as const,
  },
  {
    name: "Cedar Hollow Family Health",
    slug: "cedar-hollow",
    practiceType: "Integrated Primary + Behavioral",
    seatCount: 15,
    priorSystem: "Spreadsheets / paper",
    city: "Bangor",
    state: "ME",
    status: "LIVE" as const,
  },
];

async function seedDemoData(implTemplateId: string) {
  const owner = await db.query.users.findFirst({
    where: eq(users.role, "OWNER"),
    columns: { id: true, name: true },
  });
  // The fallback specialist must survive a re-run: upsert on the unique email
  // rather than a bare insert, so seeding twice is never an error.
  const lead =
    owner ??
    (
      await db
        .insert(users)
        .values({
          email: DEMO_SPECIALIST_EMAIL,
          name: "Demo Specialist",
          role: "SPECIALIST",
          title: "Implementation Specialist",
        })
        .onConflictDoUpdate({
          target: users.email,
          set: { name: "Demo Specialist", title: "Implementation Specialist" },
        })
        .returning({ id: users.id, name: users.name })
    )[0];

  const template = await db.query.projectTemplates.findFirst({
    where: eq(projectTemplates.id, implTemplateId),
    with: {
      phases: { with: { tasks: true }, orderBy: (p, { asc }) => [asc(p.order)] },
      milestones: { orderBy: (m, { asc }) => [asc(m.order)] },
    },
  });
  if (!template) return;

  for (const [index, demo] of DEMO_CUSTOMERS.entries()) {
    const projectCode = `IMP-${String(9001 + index)}`;

    // Keyed on the project, not the account: if an earlier run died partway
    // through, this repairs the gap instead of skipping a half-built customer.
    const seededProject = await db.query.projects.findFirst({
      where: eq(projects.code, projectCode),
      columns: { id: true },
    });
    if (seededProject) {
      console.log(`  · ${demo.name} already present, skipping`);
      continue;
    }

    const [account] = await db
      .insert(customerAccounts)
      .values({
        ...demo,
        internalNotes:
          index === 1
            ? "Large MAT program. Bed management and eMAR both in scope — expect the Inpatient/MAT phase to run long."
            : null,
      })
      .onConflictDoUpdate({ target: customerAccounts.slug, set: { name: demo.name } })
      .returning({ id: customerAccounts.id });

    const [contact] = await db
      .insert(users)
      .values({
        email: `contact@${demo.slug}.example.com`,
        name: demoContactName(index),
        role: "CUSTOMER",
        title: "Practice Administrator",
        customerAccountId: account.id,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: { customerAccountId: account.id, name: demoContactName(index) },
      })
      .returning({ id: users.id });

    // Stagger the demo projects so the dashboard has variety.
    const start = addDays(new Date(), [-38, -66, -110][index]);
    const goLive = addDays(start, template.durationDays);

    const [project] = await db
      .insert(projects)
      .values({
        name: `${demo.name} — PIMSY implementation`,
        code: projectCode,
        type: "IMPLEMENTATION",
        status: index === 2 ? "COMPLETED" : "IN_PROGRESS",
        health: (["GREEN", "RED", "GREEN"] as const)[index],
        customerAccountId: account.id,
        leadId: lead.id,
        startDate: start,
        targetGoLiveDate: goLive,
        actualGoLiveDate: index === 2 ? addDays(goLive, -3) : null,
        templateId: template.id,
        portalEnabled: true,
        portalWelcomeMessage: `Welcome! This is where you'll find your project timeline, the items we need from you, and a direct line to your implementation team.`,
      })
      .returning({ id: projects.id });

    await db.insert(projectMembers).values([
      { projectId: project.id, userId: lead.id, role: "LEAD" },
      { projectId: project.id, userId: contact.id, role: "CUSTOMER_CONTACT" },
    ]);

    // Materialize the playbook, marking earlier phases complete.
    let total = 0;
    let done = 0;
    const cutoff = [0.45, 0.3, 1][index];
    let taskIndex = 0;
    const allTaskCount = template.phases.reduce((n, p) => n + p.tasks.length, 0);

    for (const tp of template.phases) {
      const phaseStart = addDays(start, tp.offsetDays);
      const [phase] = await db
        .insert(phases)
        .values({
          projectId: project.id,
          name: tp.name,
          description: tp.description,
          order: tp.order,
          visibility: tp.visibility,
          startDate: phaseStart,
          dueDate: addDays(phaseStart, tp.durationDays),
        })
        .returning({ id: phases.id });

      const ordered = [...tp.tasks].sort((a, b) => a.order - b.order);
      if (ordered.length === 0) continue;

      await db.insert(tasks).values(
        ordered.map((tt) => {
          const isDone = taskIndex++ / allTaskCount < cutoff;
          const tStart = addDays(phaseStart, tt.offsetDays);
          total++;
          if (isDone) done++;
          return {
            projectId: project.id,
            phaseId: phase.id,
            title: tt.title,
            description: tt.description,
            status: isDone ? ("DONE" as const) : ("TODO" as const),
            completedAt: isDone ? addDays(tStart, 1) : null,
            priority: tt.priority,
            visibility: tt.visibility,
            ownerSide: tt.ownerSide,
            order: tt.order,
            startDate: tStart,
            dueDate: addDays(tStart, tt.durationDays),
            estimateHours: tt.estimateHours,
            assigneeId: tt.ownerSide === "INTERNAL" ? lead.id : null,
            createdById: lead.id,
          };
        }),
      );
    }

    await db.insert(milestones).values(
      template.milestones.map((tm) => ({
        projectId: project.id,
        name: tm.name,
        order: tm.order,
        visibility: tm.visibility,
        isGoLive: tm.isGoLive,
        dueDate: tm.isGoLive ? goLive : addDays(start, tm.offsetDays),
        completedAt: addDays(start, tm.offsetDays) < new Date() && index === 2 ? addDays(start, tm.offsetDays) : null,
      })),
    );

    await db
      .update(projects)
      .set({ taskCountTotal: total, taskCountDone: done })
      .where(eq(projects.id, project.id));

    // One shared thread and one internal back-channel — the thing Dock can't do.
    const [sharedThread] = await db
      .insert(messageThreads)
      .values({
        subject: "Kickoff follow-ups",
        visibility: "SHARED",
        projectId: project.id,
        createdById: lead.id,
        messageCount: 2,
      })
      .returning({ id: messageThreads.id });

    await db.insert(messages).values([
      {
        threadId: sharedThread.id,
        authorId: lead.id,
        body: "Great kickoff today. I've added the discovery forms to your action items — the org details form and the clinical workflow form are the two that unblock configuration, so those first if you can.",
      },
      {
        threadId: sharedThread.id,
        authorId: contact.id,
        body: "Perfect, thank you. I'll get the org details form back to you this week. The billing spreadsheet may take a bit longer since I need our biller to confirm the payer list.",
      },
    ]);
    await db.insert(threadParticipants).values([
      { threadId: sharedThread.id, userId: lead.id, lastReadAt: new Date() },
      { threadId: sharedThread.id, userId: contact.id },
    ]);

    const [internalThread] = await db
      .insert(messageThreads)
      .values({
        subject: "Internal: import risk",
        visibility: "INTERNAL",
        projectId: project.id,
        createdById: lead.id,
        messageCount: 1,
      })
      .returning({ id: messageThreads.id });

    await db.insert(messages).values({
      threadId: internalThread.id,
      authorId: lead.id,
      body: "Heads up — their prior system export is going to need heavy cleanup. Flagging now so we don't promise the go-live date until we've seen the file. Customer can't see this thread.",
    });
    await db
      .insert(threadParticipants)
      .values({ threadId: internalThread.id, userId: lead.id, lastReadAt: new Date() });

    console.log(`  ✓ ${demo.name}: ${total} tasks (${done} complete)`);
  }
}

function demoContactName(i: number) {
  return ["Dana Whitfield", "Marcus Reyes", "Priya Nadkarni"][i] ?? "Practice Contact";
}

async function main() {
  const templatesOnly = process.argv.includes("--templates-only");

  console.log("\nSeeding templates…");
  const implId = await seedTemplate(IMPLEMENTATION_TEMPLATE);
  await seedTemplate(RCM_TEMPLATE);

  if (templatesOnly) {
    console.log("\nTemplates only — skipping demo data.\n");
    return;
  }

  console.log("\nSeeding demo data…");
  await seedDemoData(implId);
  console.log("\nDone.\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nSeed failed:", err);
    process.exit(1);
  });
