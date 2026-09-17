import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import { EHR_PLAYBOOK } from "@/db/template-playbooks";
import type { SeedTask } from "@/db/template-implementation";
import { db } from "@/db";
import {
  customerAccounts,
  phases,
  projectTemplates,
  projects,
  taskAssignees,
  tasks,
  templatePhases,
  templateTasks,
  users,
} from "@/db/schema";
import { materializeTemplatesOnProject, type LoadedTemplate } from "@/lib/playbook";
import {
  CUSTOMER_TEMPLATE_ROLES,
  parseTemplateDefaultRole,
  STAFFING_ROLES,
  suggestedTemplateDefaultRole,
  TEMPLATE_ASSIGNEE_ROLES,
} from "@/lib/staffing";
import { autoAssignForProjectRole, newTaskAssigneeIds, taskAssigneeIds } from "@/lib/task-assignees";
import { resetDb } from "./fixtures";

function flattenSeedTasks(tasks: SeedTask[]): SeedTask[] {
  return tasks.flatMap((t) => [t, ...(t.children ? flattenSeedTasks(t.children) : [])]);
}

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe("template default assignee is a role", () => {
  it("lists PATH staffing roles plus customer lead / billing — never a user id", () => {
    expect(TEMPLATE_ASSIGNEE_ROLES).toEqual([
      ...STAFFING_ROLES,
      "CUSTOMER_PROJECT_LEAD",
      "CUSTOMER_BILLING",
    ]);
    expect(CUSTOMER_TEMPLATE_ROLES).toEqual(["CUSTOMER_PROJECT_LEAD", "CUSTOMER_BILLING"]);
    expect(suggestedTemplateDefaultRole("INTERNAL")).toBe("IMPLEMENTATION_SPECIALIST");
    expect(suggestedTemplateDefaultRole("CUSTOMER")).toBe("CUSTOMER_PROJECT_LEAD");
  });

  it("parses a stored role and rejects a named person / junk", () => {
    expect(parseTemplateDefaultRole("IMPLEMENTATION_SPECIALIST")).toBe("IMPLEMENTATION_SPECIALIST");
    expect(parseTemplateDefaultRole("CUSTOMER_PROJECT_LEAD")).toBe("CUSTOMER_PROJECT_LEAD");
    expect(parseTemplateDefaultRole("")).toBeNull();
    expect(parseTemplateDefaultRole("sam@pimsyehr.com")).toBeNull();
    expect(parseTemplateDefaultRole("user_abc123")).toBeNull();
  });

  it("seeds customer playbook rows with customer lead / billing roles", () => {
    const rows = flattenSeedTasks(EHR_PLAYBOOK.phases.flatMap((p) => p.tasks));
    const logos = rows.find((t) => t.title === "Upload Company Logo(s)");
    const billingQ = rows.find((t) => t.title === "Billing Questionnaire" && t.ownerSide === "CUSTOMER");
    expect(logos?.defaultRole).toBe("CUSTOMER_PROJECT_LEAD");
    expect(billingQ?.defaultRole).toBe("CUSTOMER_BILLING");
    expect(rows.filter((t) => t.ownerSide === "CUSTOMER").every((t) => t.defaultRole)).toBe(true);
  });

  it("leaves a customer task unassigned when that role has no holder", () => {
    expect(
      newTaskAssigneeIds({
        task: {
          title: "Upload Company Logo(s)",
          ownerSide: "CUSTOMER",
          defaultRole: "CUSTOMER_PROJECT_LEAD",
        },
        roleAssignments: {},
        fallbackLeadId: "lead",
      }),
    ).toEqual([]);
  });
});

describe.skipIf(!dbOk)("template role → project assignee (postgres)", () => {
  let specialistId = "";
  let rcmId = "";
  let leadContactId = "";
  let template: LoadedTemplate;

  beforeAll(async () => {
    await resetDb();
    const [acct] = await db
      .insert(customerAccounts)
      .values({ name: "Harbor Clinic", slug: "harbor-role-tpl" })
      .returning({ id: customerAccounts.id });

    const [spec, rcm, lead] = await db
      .insert(users)
      .values([
        { email: "sam@pimsyehr.com", name: "Sam", role: "SPECIALIST" },
        {
          email: "mindy@pimsyehr.com",
          name: "Mindy",
          role: "MEMBER",
          staffingRole: "RCM_IMPLEMENTATION_SPECIALIST",
        },
        {
          email: "pat@harbor.example.com",
          name: "Pat",
          role: "CUSTOMER",
          customerAccountId: acct.id,
        },
      ])
      .returning({ id: users.id });
    specialistId = spec.id;
    rcmId = rcm.id;
    leadContactId = lead.id;

    const [tpl] = await db
      .insert(projectTemplates)
      .values({
        name: "Role playbook",
        code: "role-tpl",
        playbookPath: "EHR",
        type: "IMPLEMENTATION",
        durationDays: 30,
      })
      .returning({ id: projectTemplates.id });
    const [phase] = await db
      .insert(templatePhases)
      .values({
        templateId: tpl.id,
        name: "Kickoff",
        order: 0,
        offsetDays: 0,
        durationDays: 7,
        visibility: "SHARED",
      })
      .returning({ id: templatePhases.id });
    await db.insert(templateTasks).values([
      {
        phaseId: phase.id,
        title: "Schedule Kickoff",
        order: 0,
        ownerSide: "INTERNAL",
        visibility: "INTERNAL",
        defaultRole: "IMPLEMENTATION_SPECIALIST",
      },
      {
        phaseId: phase.id,
        title: "RCM intake",
        order: 1,
        ownerSide: "INTERNAL",
        visibility: "INTERNAL",
        defaultRole: "RCM_IMPLEMENTATION_SPECIALIST",
      },
      {
        phaseId: phase.id,
        title: "Upload Company Logo(s)",
        order: 2,
        ownerSide: "CUSTOMER",
        visibility: "SHARED",
        defaultRole: "CUSTOMER_PROJECT_LEAD",
      },
      {
        phaseId: phase.id,
        parentTaskId: null,
        title: "Confirm attendees",
        order: 3,
        ownerSide: "INTERNAL",
        visibility: "INTERNAL",
        defaultRole: "IMPLEMENTATION_SPECIALIST",
      },
    ]);

    template = (await db.query.projectTemplates.findFirst({
      where: eq(projectTemplates.id, tpl.id),
      with: {
        phases: { with: { tasks: true }, orderBy: (p, { asc }) => [asc(p.order)] },
        milestones: true,
      },
    })) as LoadedTemplate;
  });

  it("stores the role on the template task, not a person", async () => {
    const stored = await db.query.templateTasks.findMany({
      where: eq(templateTasks.phaseId, template.phases[0]!.id),
    });
    const byTitle = Object.fromEntries(stored.map((t) => [t.title, t]));
    expect(byTitle["Schedule Kickoff"]?.defaultRole).toBe("IMPLEMENTATION_SPECIALIST");
    expect(byTitle["RCM intake"]?.defaultRole).toBe("RCM_IMPLEMENTATION_SPECIALIST");
    expect(byTitle["Upload Company Logo(s)"]?.defaultRole).toBe("CUSTOMER_PROJECT_LEAD");
    expect(stored.every((t) => !("assigneeId" in t) || t.defaultRole)).toBe(true);
  });

  it("assigns create-time tasks to the project role holder, including customer lead", async () => {
    const [project] = await db
      .insert(projects)
      .values({
        name: "Harbor role assign",
        code: "IMP-ROLE1",
        portalEnabled: true,
      })
      .returning({ id: projects.id });

    await db.transaction(async (tx) => {
      await materializeTemplatesOnProject({
        tx,
        projectId: project.id,
        templates: [template],
        actorId: specialistId,
        start: new Date("2026-09-01T12:00:00Z"),
        scaleFactor: 1,
        excludedAreaKeys: [],
        roleAssignments: {
          IMPLEMENTATION_SPECIALIST: specialistId,
          RCM_IMPLEMENTATION_SPECIALIST: rcmId,
          CUSTOMER_PROJECT_LEAD: leadContactId,
        },
        defaultInternalAssigneeId: specialistId,
      });
    });

    const live = await db.query.tasks.findMany({ where: eq(tasks.projectId, project.id) });
    const kickoff = live.find((t) => t.title === "Schedule Kickoff")!;
    const rcm = live.find((t) => t.title === "RCM intake")!;
    const logos = live.find((t) => t.title === "Upload Company Logo(s)")!;
    const nested = live.find((t) => t.title === "Confirm attendees")!;

    expect(kickoff.assigneeId).toBe(specialistId);
    expect(kickoff.defaultRole).toBe("IMPLEMENTATION_SPECIALIST");
    expect(await taskAssigneeIds(kickoff.id)).toContain(specialistId);

    expect(rcm.assigneeId).toBe(specialistId);
    expect(await taskAssigneeIds(rcm.id)).toEqual(expect.arrayContaining([specialistId, rcmId]));

    expect(logos.assigneeId).toBe(leadContactId);
    expect(logos.defaultRole).toBe("CUSTOMER_PROJECT_LEAD");
    expect(await taskAssigneeIds(logos.id)).toEqual([leadContactId]);

    expect(nested.assigneeId).toBe(specialistId);
  });

  it("does not crash when a role holder is missing — customer task stays unassigned", async () => {
    const [project] = await db
      .insert(projects)
      .values({
        name: "Harbor missing role",
        code: "IMP-ROLE2",
        portalEnabled: true,
      })
      .returning({ id: projects.id });

    await expect(
      db.transaction(async (tx) => {
        await materializeTemplatesOnProject({
          tx,
          projectId: project.id,
          templates: [template],
          actorId: specialistId,
          start: new Date("2026-09-01T12:00:00Z"),
          scaleFactor: 1,
          excludedAreaKeys: [],
          roleAssignments: {},
          defaultInternalAssigneeId: null,
        });
      }),
    ).resolves.toBeUndefined();

    const live = await db.query.tasks.findMany({ where: eq(tasks.projectId, project.id) });
    expect(live).toHaveLength(4);
    const logos = live.find((t) => t.title === "Upload Company Logo(s)")!;
    expect(logos.assigneeId).toBeNull();
    expect(await taskAssigneeIds(logos.id)).toEqual([]);
    const joinRows = await db
      .select({ taskId: taskAssignees.taskId })
      .from(taskAssignees)
      .where(eq(taskAssignees.taskId, logos.id));
    expect(joinRows).toHaveLength(0);
  });

  it("auto-assigns a later RCM specialist onto tasks whose template defaultRole matches (additive)", async () => {
    const [project] = await db
      .insert(projects)
      .values({
        name: "Harbor later RCM",
        code: "IMP-ROLE3",
        portalEnabled: true,
      })
      .returning({ id: projects.id });

    const [phase] = await db
      .insert(phases)
      .values({ projectId: project.id, name: "RCM Kickoff", order: 0, visibility: "INTERNAL" })
      .returning({ id: phases.id });
    const [rcmTask, other] = await db
      .insert(tasks)
      .values([
        {
          projectId: project.id,
          phaseId: phase.id,
          title: "RCM intake",
          ownerSide: "INTERNAL",
          visibility: "INTERNAL",
          defaultRole: "RCM_IMPLEMENTATION_SPECIALIST",
          order: 0,
        },
        {
          projectId: project.id,
          phaseId: phase.id,
          title: "Schedule Kickoff",
          ownerSide: "INTERNAL",
          visibility: "INTERNAL",
          defaultRole: "IMPLEMENTATION_SPECIALIST",
          order: 1,
        },
      ])
      .returning({ id: tasks.id });

    const n = await autoAssignForProjectRole({
      projectId: project.id,
      userId: rcmId,
      role: "RCM_IMPLEMENTATION_SPECIALIST",
      notify: false,
    });
    expect(n).toBe(1);
    expect(await taskAssigneeIds(rcmTask.id)).toEqual([rcmId]);
    expect(await taskAssigneeIds(other.id)).toEqual([]);
  });
});
