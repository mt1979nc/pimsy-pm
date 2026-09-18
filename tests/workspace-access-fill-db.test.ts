import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customerAccounts, fileAssets, phases, projects, tasks, users } from "@/db/schema";
import { resetDb } from "./fixtures";
import { ACCESSING_PIMSY_CATALOG_BLURB, PIMSY_DESKTOP_INSTALL_URL } from "@/lib/accessing-pimsy";
import { fillWorkspaceAccessTasks, resolveWorkspaceAccess } from "@/lib/workspace-access-fill";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbOk)("workspace Accessing Pimsy + Zendesk fill (postgres)", () => {
  let projectId: string;
  let actorId: string;
  let customerId: string;

  beforeAll(async () => {
    await resetDb();
    const [customer] = await db
      .insert(customerAccounts)
      .values({
        name: "CEDAR Health",
        slug: "cedar-health",
        website: "https://www.cedarhealth.org",
      })
      .returning({ id: customerAccounts.id });
    customerId = customer.id;

    const [owner] = await db
      .insert(users)
      .values({ email: "alexander@pimsyehr.com", name: "Alexander", role: "OWNER" })
      .returning({ id: users.id });
    actorId = owner.id;

    await db.insert(users).values({
      email: "jane@cedar.example",
      name: "Jane Cedar",
      role: "CUSTOMER",
      customerAccountId: customerId,
      isActive: true,
    });

    const [project] = await db
      .insert(projects)
      .values({
        name: "CEDAR implementation",
        code: "IMP-C001",
        customerAccountId: customerId,
        leadId: actorId,
        crmAcronym: "CEDAR",
        crmKey: "site-key-cedar",
        customFields: { bookmark: "https://cedar.pimsyehr.com" },
      })
      .returning({ id: projects.id });
    projectId = project.id;

    const [phase] = await db
      .insert(phases)
      .values({
        projectId,
        name: "Accessing Pimsy",
        order: 0,
        visibility: "INTERNAL",
      })
      .returning({ id: phases.id });

    await db.insert(tasks).values([
      {
        projectId,
        phaseId: phase.id,
        title: "Accessing Pimsy",
        description: ACCESSING_PIMSY_CATALOG_BLURB,
        order: 0,
        visibility: "SHARED",
        ownerSide: "CUSTOMER",
        createdById: actorId,
      },
      {
        projectId,
        phaseId: phase.id,
        title: "Zendesk Company Setup",
        description: "Create the Zendesk organization.",
        order: 1,
        visibility: "INTERNAL",
        ownerSide: "INTERNAL",
        createdById: actorId,
      },
      {
        projectId,
        phaseId: phase.id,
        title: "Add Zendesk Users to Org",
        description: "Add contacts.",
        order: 2,
        visibility: "INTERNAL",
        ownerSide: "INTERNAL",
        createdById: actorId,
      },
    ]);
  });

  it("fills Accessing Pimsy from stored fields and attaches Zendesk org/email searches", async () => {
    const access = await resolveWorkspaceAccess({
      customerAccountId: customerId,
      form: {},
      inheritMissing: true,
    });
    expect(access.crmAcronym).toBe("CEDAR");
    expect(access.crmKey).toBe("site-key-cedar");
    expect(access.bookmarkUrl).toContain("cedar.pimsyehr.com");
    expect(access.orgName).toBe("CEDAR Health");
    expect(access.emails).toContain("jane@cedar.example");

    const result = await fillWorkspaceAccessTasks(db, {
      projectId,
      actorId,
      access,
    });
    expect(result.updated).toBe(1);
    expect(result.attached).toBeGreaterThanOrEqual(3);

    const accessingRow = (
      await db.query.tasks.findMany({
        where: eq(tasks.projectId, projectId),
        columns: { id: true, title: true, description: true },
      })
    ).find((t) => t.title === "Accessing Pimsy");
    expect(accessingRow?.description).toContain("Practice acronym: CEDAR");
    expect(accessingRow?.description).toContain("Security key: site-key-cedar");
    expect(accessingRow?.description).toContain("Live site:");
    expect(accessingRow?.description).not.toMatch(/Bookmark \/ CRM link:/);
    expect(accessingRow?.description).toContain(PIMSY_DESKTOP_INSTALL_URL);

    const links = await db.query.fileAssets.findMany({
      where: eq(fileAssets.projectId, projectId),
      columns: { name: true, url: true, kind: true, visibility: true, taskId: true },
    });
    expect(links.every((l) => l.kind === "LINK")).toBe(true);
    expect(links.some((l) => l.url === PIMSY_DESKTOP_INSTALL_URL)).toBe(true);
    expect(links.some((l) => l.url?.includes("cedar.pimsyehr.com") && l.name === "Live site")).toBe(
      true,
    );
    const zdOrg = links.find((l) => l.name === "Zendesk organization search");
    expect(zdOrg?.visibility).toBe("INTERNAL");
    expect(zdOrg?.url).toContain("pimsyemr.zendesk.com/agent/search/1");
    expect(decodeURIComponent(zdOrg?.url ?? "")).toContain("CEDAR Health");
    const zdUsers = links.find((l) => l.name === "Zendesk user / email search");
    expect(zdUsers?.url).toContain("pimsyemr.zendesk.com");
    expect(decodeURIComponent(zdUsers?.url ?? "")).toContain("jane@cedar.example");
    expect(JSON.stringify(links)).not.toMatch(/ZENDESK_API|token=|password=/i);
  });

  it("does not invent a security key when none exists", async () => {
    const access = await resolveWorkspaceAccess({
      customerAccountId: customerId,
      form: { crmAcronym: "NEWCO" },
      inheritMissing: false,
    });
    expect(access.crmKey).toBeNull();
    expect(access.fields.securityKey).toBeNull();
    expect(access.fields.acronym).toBe("NEWCO");
  });
});
