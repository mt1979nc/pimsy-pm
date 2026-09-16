import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { phases, projectTemplates, tasks } from "@/db/schema";
import { portalActionItems, portalPhaseTabs, portalTask } from "@/lib/portal";
import { previewPortalPhaseTabs } from "@/lib/portal-preview";
import { exposePhaseFromCompletedTask } from "@/lib/expose-phase";
import { TEMPLATE_LOCKED_MESSAGE } from "@/lib/template-lock";
import { buildFixture } from "./fixtures";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbOk)("expose/hide tabs and portal links (postgres)", () => {
  it("hides customer action items whose phase is still INTERNAL", async () => {
    const f = await buildFixture();
    const [hiddenPhase] = await db
      .insert(phases)
      .values({
        projectId: f.projects.a,
        name: "Site Configuration",
        order: 8,
        visibility: "INTERNAL",
      })
      .returning({ id: phases.id });

    await db.insert(tasks).values({
      projectId: f.projects.a,
      phaseId: hiddenPhase.id,
      title: "Customer: billing questionnaire",
      visibility: "SHARED",
      ownerSide: "CUSTOMER",
      order: 0,
    });

    const actions = await portalActionItems(f.actors.customerA);
    expect(actions.map((t) => t.title)).toContain("Customer: submit org details form");
    expect(actions.map((t) => t.title)).not.toContain("Customer: billing questionnaire");

    const tabs = await portalPhaseTabs(f.actors.customerA, f.projects.a);
    expect(tabs.map((p) => p.name)).toContain("Discovery");
    expect(tabs.map((p) => p.name)).not.toContain("Site Configuration");

    const previewTabs = await previewPortalPhaseTabs(f.projects.a);
    expect(previewTabs.map((p) => p.name)).not.toContain("Site Configuration");
  });

  it("completing Expose Configuration opens that tab and portalTask follows visibility", async () => {
    const f = await buildFixture();
    const [config] = await db
      .insert(phases)
      .values({
        projectId: f.projects.a,
        name: "Site Configuration",
        order: 9,
        visibility: "INTERNAL",
      })
      .returning({ id: phases.id });

    const [exposeTask] = await db
      .insert(tasks)
      .values({
        projectId: f.projects.a,
        phaseId: config.id,
        title: 'Expose the "Configuration" tab',
        visibility: "INTERNAL",
        ownerSide: "INTERNAL",
        order: 0,
      })
      .returning({ id: tasks.id });

    const [parent] = await db
      .insert(tasks)
      .values({
        projectId: f.projects.a,
        phaseId: config.id,
        title: "Organization Setup",
        visibility: "SHARED",
        ownerSide: "INTERNAL",
        order: 1,
      })
      .returning({ id: tasks.id });

    expect(await portalTask(f.actors.customerA, f.projects.a, parent.id)).toBeNull();

    const exposed = await exposePhaseFromCompletedTask({
      projectId: f.projects.a,
      taskTitle: 'Expose the "Configuration" tab',
    });
    expect(exposed?.name).toBe("Site Configuration");

    const after = await db.query.phases.findFirst({ where: eq(phases.id, config.id) });
    expect(after?.visibility).toBe("SHARED");
    expect((await portalTask(f.actors.customerA, f.projects.a, parent.id))?.title).toBe(
      "Organization Setup",
    );
    expect(exposeTask.id).toBeTruthy();
  });

  it("documents the lock message used when a Dock playbook is locked", () => {
    expect(TEMPLATE_LOCKED_MESSAGE).toMatch(/locked/i);
    expect(TEMPLATE_LOCKED_MESSAGE).toMatch(/db:seed -- --templates-only/);
  });

  it("stores is_locked on project_template", async () => {
    const [row] = await db
      .insert(projectTemplates)
      .values({
        name: "Lock probe",
        code: `lock-probe-${Date.now()}`,
        type: "IMPLEMENTATION",
        isLocked: true,
      })
      .returning({ id: projectTemplates.id, isLocked: projectTemplates.isLocked });
    expect(row.isLocked).toBe(true);
  });
});
