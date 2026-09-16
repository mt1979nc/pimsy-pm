import { describe, it, expect, beforeAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { phases, tasks } from "@/db/schema";
import { buildFixture, type Fixture } from "./fixtures";
import { NotFoundError } from "@/lib/authz";
import { expandPathDeepLink, resolvePathDeepLink } from "@/lib/path-deep-link-resolve";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbOk)("PATH /go deep-link resolve (postgres)", () => {
  let f: Fixture;
  let orgTaskId: string;
  let createUsersId: string;
  let configPhaseId: string;

  beforeAll(async () => {
    f = await buildFixture();
    const [config] = await db
      .insert(phases)
      .values([
        {
          projectId: f.projects.a,
          name: "Site Configuration",
          order: 2,
          visibility: "INTERNAL",
        },
      ])
      .returning({ id: phases.id });
    configPhaseId = config!.id;

    const inserted = await db
      .insert(tasks)
      .values([
        {
          projectId: f.projects.a,
          phaseId: f.phases.shared,
          title: "Organization Details Form",
          visibility: "SHARED",
          ownerSide: "CUSTOMER",
          order: 10,
        },
        {
          projectId: f.projects.a,
          phaseId: configPhaseId,
          title: "Create Users",
          visibility: "INTERNAL",
          ownerSide: "INTERNAL",
          order: 0,
        },
      ])
      .returning({ id: tasks.id, title: tasks.title });
    orgTaskId = inserted.find((t) => t.title === "Organization Details Form")!.id;
    createUsersId = inserted.find((t) => t.title === "Create Users")!.id;
  });

  it("sends a customer to the portal Organization Details Form", async () => {
    const resolved = await resolvePathDeepLink(f.actors.customerA, {
      project: "IMP-T001",
      task: "Organization Details Form",
    });
    expect(resolved.audience).toBe("portal");
    expect(resolved.path).toBe(`/portal/projects/${f.projects.a}/tasks/${orgTaskId}`);
    expect(resolved.taskId).toBe(orgTaskId);
  });

  it("sends staff to the staff task for the same wizard step", async () => {
    const resolved = await resolvePathDeepLink(f.actors.specialist, {
      project: "imp-t001",
      step: "org",
    });
    expect(resolved.audience).toBe("staff");
    expect(resolved.path).toBe(`/projects/${f.projects.a}/tasks/${orgTaskId}`);
  });

  it("does not send a customer to an INTERNAL Configuration consumer", async () => {
    const resolved = await resolvePathDeepLink(f.actors.customerA, {
      project: "IMP-T001",
      step: "users",
    });
    expect(resolved.path).not.toContain(createUsersId);
    expect(resolved.path.startsWith("/portal/")).toBe(true);
  });

  it("sends staff to Create Users for the wizard users step", async () => {
    const resolved = await resolvePathDeepLink(f.actors.specialist, {
      project: "IMP-T001",
      step: "users",
    });
    expect(resolved.path).toBe(`/projects/${f.projects.a}/tasks/${createUsersId}`);
  });

  it("opens About for booking dest (Zoom URL lives there)", async () => {
    const customer = await resolvePathDeepLink(f.actors.customerA, {
      project: "IMP-T001",
      dest: "about",
    });
    expect(customer.path).toBe(`/portal/projects/${f.projects.a}/about`);
    const staff = await resolvePathDeepLink(f.actors.specialist, {
      projectId: f.projects.a,
      dest: "about",
    });
    expect(staff.path).toBe(`/projects/${f.projects.a}/about`);
  });

  it("does not confirm another customer's project", async () => {
    await expect(
      resolvePathDeepLink(f.actors.customerA, { project: "IMP-T002" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("expands both audiences for Power Automate without PHI", async () => {
    const expanded = await expandPathDeepLink({
      project: "IMP-T001",
      task: "Organization Details Form",
    });
    expect(expanded.projectCode).toBe("IMP-T001");
    expect(expanded.staff.path).toBe(`/projects/${f.projects.a}/tasks/${orgTaskId}`);
    expect(expanded.portal.path).toBe(`/portal/projects/${f.projects.a}/tasks/${orgTaskId}`);
    expect(JSON.stringify(expanded)).not.toMatch(/\bPHI\b|ssn|patient/i);
  });
});
