import { notFound } from "next/navigation";
import { and, eq, ne, asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { projects, users, customerAccounts, phases, fileAssets } from "@/db/schema";
import { requireStaff } from "@/lib/guard";
import { assertProjectAccess } from "@/lib/authz";
import { Card, CardHeader, Badge, Avatar, VisibilityBadge } from "@/components/ui";
import {
  ProjectSettingsForm,
  AddMemberForm,
  RemoveMemberButton,
  ArchiveProjectButton,
  PhaseVisibilityList,
  RecordingsManager,
} from "./settings-forms";
import { ProjectContacts } from "./contacts";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireStaff();
  await assertProjectAccess(actor, id);

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, id),
    with: {
      members: {
        with: {
          user: { columns: { id: true, name: true, email: true, image: true, role: true } },
        },
      },
    },
  });
  if (!project) notFound();

  const staff = await db.query.users.findMany({
    where: and(eq(users.isActive, true), ne(users.role, "CUSTOMER")),
    columns: { id: true, name: true, email: true, role: true },
    orderBy: [asc(users.name)],
  });

  const accountContacts = project.customerAccountId
    ? await db.query.users.findMany({
        where: and(
          eq(users.role, "CUSTOMER"),
          eq(users.customerAccountId, project.customerAccountId),
        ),
        columns: {
          id: true,
          name: true,
          email: true,
          role: true,
          title: true,
          image: true,
          isActive: true,
          lastSeenAt: true,
        },
        orderBy: [asc(users.name)],
      })
    : [];

  const customer = project.customerAccountId
    ? await db.query.customerAccounts.findFirst({
        where: eq(customerAccounts.id, project.customerAccountId),
        columns: { id: true, name: true },
      })
    : null;

  const contactIdsOnProject = new Set(
    project.members.filter((m) => m.user.role === "CUSTOMER").map((m) => m.userId),
  );
  const contactsOnProject = accountContacts.filter((c) => contactIdsOnProject.has(c.id));
  const contactsAvailable = accountContacts.filter(
    (c) => !contactIdsOnProject.has(c.id) && c.isActive,
  );

  const memberIds = new Set(project.members.map((m) => m.userId));
  const candidates = staff.filter((u) => !memberIds.has(u.id));

  const projectPhases = await db.query.phases.findMany({
    where: eq(phases.projectId, id),
    columns: { id: true, name: true, visibility: true },
    orderBy: [asc(phases.order)],
  });

  const recordings = await db.query.fileAssets.findMany({
    where: and(eq(fileAssets.projectId, id), eq(fileAssets.isRecording, true)),
    columns: { id: true, name: true, description: true, visibility: true },
    orderBy: [desc(fileAssets.createdAt)],
  });

  return (
    <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1.3fr_1fr]">
      <Card>
        <CardHeader title="Project settings" />
        <ProjectSettingsForm
          project={{
            id: project.id,
            name: project.name,
            description: project.description,
            status: project.status,
            health: project.health,
            leadId: project.leadId,
            targetGoLiveDate: project.targetGoLiveDate
              ? new Date(project.targetGoLiveDate).toISOString().slice(0, 10)
              : null,
            portalEnabled: project.portalEnabled,
            portalWelcomeMessage: project.portalWelcomeMessage,
          }}
          staff={staff}
        />
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Customer contacts"
            subtitle={
              customer
                ? `Who at ${customer.name} can open this project`
                : "Internal project — no customer contacts"
            }
          />
          <ProjectContacts
            projectId={id}
            customerId={project.customerAccountId}
            customerName={customer?.name ?? null}
            onProject={contactsOnProject}
            available={contactsAvailable}
            portalEnabled={project.portalEnabled}
          />
        </Card>

        <Card>
          <CardHeader
            title="Your team"
            subtitle="Internal people working on this project"
          />
          <div className="divide-y divide-border">
            {project.members
              .filter((m) => m.user.role !== "CUSTOMER")
              .map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 px-4 py-2.5">
                <Avatar name={m.user.name} image={m.user.image} size={26} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] text-ink">{m.user.name}</span>
                    {m.user.role === "CUSTOMER" ? <Badge tone="violet">Customer</Badge> : null}
                  </div>
                  <div className="truncate text-[12px] capitalize text-ink-3">
                    {m.role.toLowerCase().replace("_", " ")}
                  </div>
                </div>
                <RemoveMemberButton projectId={id} userId={m.userId} />
              </div>
              ))}
          </div>
          <AddMemberForm projectId={id} candidates={candidates} />
        </Card>

        <Card>
          <CardHeader
            title="Portal status"
            action={
              <VisibilityBadge visibility={project.portalEnabled ? "SHARED" : "INTERNAL"} />
            }
          />
          <p className="px-5 py-4 text-[13px] leading-relaxed text-ink-2">
            {project.portalEnabled
              ? "Contacts on this customer account can sign in and see shared phases, milestones, their action items and shared conversations."
              : "The portal is off. Customer contacts cannot open this project at all."}
          </p>
        </Card>

        <Card>
          <CardHeader
            title="Customer portal tabs"
            subtitle="Which phases show up as a tab in their portal"
          />
          <PhaseVisibilityList phases={projectPhases} />
        </Card>

        <Card>
          <CardHeader
            title="Recordings"
            subtitle="Training session links shown in the portal's Recordings tab"
          />
          <RecordingsManager projectId={id} recordings={recordings} />
        </Card>

        <Card>
          <CardHeader title="Danger zone" />
          <div className="p-5">
            <ArchiveProjectButton projectId={id} />
            <p className="mt-2 text-[12px] text-ink-3">
              Archiving hides the project from lists and immediately revokes portal access. Nothing
              is deleted.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
