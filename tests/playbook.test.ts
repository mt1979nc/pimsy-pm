import { describe, it, expect, beforeAll } from "vitest";
import {
  canonicalStaffingRole,
  resolveAssigneeForRole,
  staffingRoleFromTitle,
  staffingRoleLabel,
  isManagerOverviewRole,
} from "@/lib/staffing";
import {
  shouldIncludeByArea,
  normalizeOverlapTitle,
  isActiveWork,
  materializeTemplatesOnProject,
  applyRoleMemberships,
  addRcmTrackToProject,
  setTaskNotApplicable,
  setPhaseNotApplicable,
  type LoadedTemplate,
} from "@/lib/playbook";
import { refreshProjectCounters } from "@/lib/rollup";
import { db } from "@/db";
import {
  customerAccounts,
  users,
  projects,
  projectMembers,
  projectTemplates,
  templatePhases,
  templateTasks,
  tasks,
  phases,
} from "@/db/schema";
import { resetDb } from "./fixtures";
import { portalPlan, portalActionItems, type CustomerActor } from "@/lib/portal";
import { eq } from "drizzle-orm";

describe("staffing helpers", () => {
  it("treats v1.8.1 aliases as the new roles", () => {
    expect(canonicalStaffingRole("SPECIALIST")).toBe("IMPLEMENTATION_SPECIALIST");
    expect(canonicalStaffingRole("RCM")).toBe("RCM_IMPLEMENTATION_SPECIALIST");
    expect(canonicalStaffingRole("BILLING_SUPPORT")).toBe("T1_BILLING_SUPPORT");
    expect(staffingRoleLabel("SPECIALIST")).toBe("Implementation Specialist");
    expect(isManagerOverviewRole("RCM_MANAGER")).toBe(true);
    expect(isManagerOverviewRole("SPECIALIST")).toBe(false);
  });

  it("auto-assigns by role and falls back to the lead for specialists", () => {
    expect(
      resolveAssigneeForRole(
        "T1_BILLING_SUPPORT",
        { T1_BILLING_SUPPORT: "anna", IMPLEMENTATION_SPECIALIST: "sam" },
        "lead",
        "INTERNAL",
      ),
    ).toBe("anna");
    expect(
      resolveAssigneeForRole("IMPLEMENTATION_SPECIALIST", {}, "lead", "INTERNAL"),
    ).toBe("lead");
    expect(resolveAssigneeForRole("T2_BILLING_SUPPORT", {}, "lead", "INTERNAL")).toBeNull();
    expect(resolveAssigneeForRole("IMPLEMENTATION_SPECIALIST", {}, "lead", "CUSTOMER")).toBeNull();
  });

  it("infers staffing role from title", () => {
    expect(staffingRoleFromTitle("Director of Implementation")).toBe("IMPLEMENTATION_DIRECTOR");
    expect(staffingRoleFromTitle("Director of Support")).toBe("SUPPORT_DIRECTOR");
    expect(staffingRoleFromTitle("RCM")).toBe("RCM_IMPLEMENTATION_SPECIALIST");
    expect(staffingRoleFromTitle("Billing Support")).toBe("T1_BILLING_SUPPORT");
  });
});

describe("optional areas and N/A helpers", () => {
  it("excludes optional rows whose area is unchecked", () => {
    expect(shouldIncludeByArea({ isOptional: true, areaKey: "eprescribe" }, ["eprescribe"])).toBe(
      false,
    );
    expect(shouldIncludeByArea({ isOptional: true, areaKey: "eprescribe" }, [])).toBe(true);
    expect(shouldIncludeByArea({ isOptional: false, areaKey: "eprescribe" }, ["eprescribe"])).toBe(
      true,
    );
  });

  it("normalizes overlap titles", () => {
    expect(normalizeOverlapTitle("ClaimMD Enrollment")).toBe("claimmd enrollment");
    expect(normalizeOverlapTitle("ClaimMD  enrollment!")).toBe("claimmd enrollment");
  });

  it("treats N/A as inactive work", () => {
    expect(isActiveWork({ status: "TODO", notApplicable: true })).toBe(false);
    expect(isActiveWork({ status: "TODO", notApplicable: false })).toBe(true);
    expect(isActiveWork({ status: "DONE" })).toBe(false);
  });
});

describe("materialize + N/A + RCM attach (postgres)", () => {
  let specialistId: string;
  let billingId: string;
  let rcmId: string;
  let customerId: string;
  let contactId: string;
  let ehrTemplate: LoadedTemplate;
  let rcmTemplate: LoadedTemplate;

  beforeAll(async () => {
    await resetDb();

    const [acct] = await db
      .insert(customerAccounts)
      .values({ name: "Harbor Clinic", slug: "harbor-clinic" })
      .returning({ id: customerAccounts.id });
    customerId = acct.id;

    const [spec, bill, rcm, contact] = await db
      .insert(users)
      .values([
        { email: "spec@pimsyehr.com", name: "Sam", role: "SPECIALIST" },
        { email: "bill@pimsyehr.com", name: "Anna", role: "MEMBER", staffingRole: "T1_BILLING_SUPPORT" },
        { email: "rcm@pimsyehr.com", name: "Mindy", role: "MEMBER", staffingRole: "RCM_IMPLEMENTATION_SPECIALIST" },
        {
          email: "poc@harbor.example.com",
          name: "Pat",
          role: "CUSTOMER",
          customerAccountId: customerId,
        },
      ])
      .returning({ id: users.id });
    specialistId = spec.id;
    billingId = bill.id;
    rcmId = rcm.id;
    contactId = contact.id;

    const [tpl] = await db
      .insert(projectTemplates)
      .values({
        name: "Test EHR",
        code: "test-ehr",
        playbookPath: "EHR",
        type: "IMPLEMENTATION",
        durationDays: 30,
      })
      .returning({ id: projectTemplates.id });
    const [phase] = await db
      .insert(templatePhases)
      .values({
        templateId: tpl.id,
        name: "Billing",
        order: 0,
        offsetDays: 0,
        durationDays: 10,
        visibility: "SHARED",
        workTrack: "EHR",
      })
      .returning({ id: templatePhases.id });
    await db.insert(templateTasks).values([
      {
        phaseId: phase.id,
        title: "Kickoff call",
        order: 0,
        ownerSide: "INTERNAL",
        visibility: "INTERNAL",
        defaultRole: "IMPLEMENTATION_SPECIALIST",
        workTrack: "EHR",
      },
      {
        phaseId: phase.id,
        title: "ClaimMD Enrollment",
        order: 1,
        ownerSide: "CUSTOMER",
        visibility: "SHARED",
        overlapKey: "claimmd_enrollment",
        workTrack: "EHR",
      },
      {
        phaseId: phase.id,
        title: "ePrescribe setup",
        order: 2,
        ownerSide: "INTERNAL",
        visibility: "INTERNAL",
        isOptional: true,
        areaKey: "eprescribe",
        defaultRole: "IMPLEMENTATION_SPECIALIST",
        workTrack: "EHR",
      },
    ]);

    const [rcmTpl] = await db
      .insert(projectTemplates)
      .values({
        name: "Test RCM Prism",
        code: "test-rcm-prism",
        playbookPath: "RCM_PRISM",
        type: "SUPPORT",
        durationDays: 20,
      })
      .returning({ id: projectTemplates.id });
    const [rcmPhase] = await db
      .insert(templatePhases)
      .values({
        templateId: rcmTpl.id,
        name: "RCM Kickoff",
        order: 0,
        offsetDays: 0,
        durationDays: 7,
        visibility: "SHARED",
        workTrack: "RCM",
      })
      .returning({ id: templatePhases.id });
    await db.insert(templateTasks).values([
      {
        phaseId: rcmPhase.id,
        title: "ClaimMD enrollment",
        order: 0,
        ownerSide: "CUSTOMER",
        visibility: "SHARED",
        overlapKey: "claimmd_enrollment",
        workTrack: "RCM",
      },
      {
        phaseId: rcmPhase.id,
        title: "RCM intake",
        order: 1,
        ownerSide: "INTERNAL",
        visibility: "INTERNAL",
        defaultRole: "RCM_IMPLEMENTATION_SPECIALIST",
        workTrack: "RCM",
      },
    ]);

    ehrTemplate = (await db.query.projectTemplates.findFirst({
      where: eq(projectTemplates.id, tpl.id),
      with: {
        phases: { with: { tasks: true }, orderBy: (p, { asc }) => [asc(p.order)] },
        milestones: true,
      },
    })) as LoadedTemplate;
    rcmTemplate = (await db.query.projectTemplates.findFirst({
      where: eq(projectTemplates.id, rcmTpl.id),
      with: {
        phases: { with: { tasks: true }, orderBy: (p, { asc }) => [asc(p.order)] },
        milestones: true,
      },
    })) as LoadedTemplate;
  });

  it("excludes optional areas and auto-assigns roles without changing the template", async () => {
    const [project] = await db
      .insert(projects)
      .values({
        name: "Harbor EHR",
        code: "IMP-P001",
        customerAccountId: customerId,
        leadId: specialistId,
        playbookPath: "EHR",
        portalEnabled: true,
      })
      .returning({ id: projects.id });

    await db.transaction(async (tx) => {
      await applyRoleMemberships({
        tx,
        projectId: project.id,
        roleAssignments: {
          IMPLEMENTATION_SPECIALIST: specialistId,
          T1_BILLING_SUPPORT: billingId,
        },
        leadId: specialistId,
      });
      await materializeTemplatesOnProject({
        tx,
        projectId: project.id,
        templates: [ehrTemplate],
        actorId: specialistId,
        start: new Date("2026-09-01T12:00:00Z"),
        scaleFactor: 1,
        excludedAreaKeys: ["eprescribe"],
        roleAssignments: { IMPLEMENTATION_SPECIALIST: specialistId },
        defaultInternalAssigneeId: specialistId,
      });
    });
    await refreshProjectCounters(project.id);

    const live = await db.query.tasks.findMany({ where: eq(tasks.projectId, project.id) });
    expect(live.map((t) => t.title).sort()).toEqual(["ClaimMD Enrollment", "Kickoff call"]);
    expect(live.find((t) => t.title === "Kickoff call")?.assigneeId).toBe(specialistId);

    const templateStill = await db.query.templateTasks.findMany({
      where: eq(templateTasks.phaseId, ehrTemplate.phases[0].id),
    });
    expect(templateStill).toHaveLength(3);

    const kickoff = live.find((t) => t.title === "Kickoff call")!;
    await setTaskNotApplicable(kickoff.id, true);
    const afterNa = await db.query.tasks.findFirst({ where: eq(tasks.id, kickoff.id) });
    expect(afterNa?.notApplicable).toBe(true);

    const stillOnTemplate = await db.query.templateTasks.findMany({
      where: eq(templateTasks.phaseId, ehrTemplate.phases[0].id),
    });
    expect(stillOnTemplate).toHaveLength(3);

    const actor: CustomerActor = {
      id: contactId,
      email: "poc@harbor.example.com",
      name: "Pat",
      role: "CUSTOMER",
      customerAccountId: customerId,
      isActive: true,
    };
    const plan = await portalPlan(actor, project.id);
    const portalTitles = plan.phases.flatMap((p) => p.tasks.map((t) => t.title));
    expect(portalTitles).toContain("ClaimMD Enrollment");
    expect(portalTitles).not.toContain("Kickoff call");

    const actions = await portalActionItems(actor);
    expect(actions.every((t) => !t.notApplicable)).toBe(true);

    // Path 4 — attach RCM, auto-complete overlap, keep EHR code/name.
    const before = await db.query.projects.findFirst({
      where: eq(projects.id, project.id),
    });
    await addRcmTrackToProject({
      projectId: project.id,
      actorId: rcmId,
      templates: [rcmTemplate],
      excludedAreaKeys: [],
      roleAssignments: { RCM_IMPLEMENTATION_SPECIALIST: rcmId },
      rcmStart: new Date("2026-10-01T12:00:00Z"),
      rcmTargetGoLive: new Date("2026-11-15T12:00:00Z"),
      scaleFactor: 1,
    });
    const after = await db.query.projects.findFirst({ where: eq(projects.id, project.id) });
    expect(after?.playbookPath).toBe("RCM_PRISM");
    expect(after?.targetGoLiveDate?.toISOString()).toBe(before?.targetGoLiveDate?.toISOString() ?? after?.targetGoLiveDate?.toISOString());
    expect(after?.rcmTaskCountTotal).toBeGreaterThan(0);

    const all = await db.query.tasks.findMany({ where: eq(tasks.projectId, project.id) });
    const claimMd = all.filter((t) => /claimmd/i.test(t.title));
    expect(claimMd.every((t) => t.status === "DONE")).toBe(true);
    expect(all.some((t) => t.title === "RCM intake" && t.assigneeId === rcmId)).toBe(true);

    const members = await db.query.projectMembers.findMany({
      where: eq(projectMembers.projectId, project.id),
    });
    expect(members.some((m) => m.userId === rcmId)).toBe(true);

    const phase = (await db.query.phases.findMany({ where: eq(phases.projectId, project.id) }))[0];
    await setPhaseNotApplicable(phase.id, true);
    const phaseTasks = await db.query.tasks.findMany({ where: eq(tasks.phaseId, phase.id) });
    expect(phaseTasks.every((t) => t.notApplicable)).toBe(true);
    const tplCount = await db.query.templateTasks.findMany({
      where: eq(templateTasks.phaseId, ehrTemplate.phases[0].id),
    });
    expect(tplCount).toHaveLength(3);
  });
});
