import { notFound } from "next/navigation";
import { and, eq, ne, asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { projects, users, customerAccounts, phases, slipEvents } from "@/db/schema";
import { requireStaff } from "@/lib/guard";
import { assertProjectAccess, canDeletePortfolioRecords } from "@/lib/authz";
import { toDateInput } from "@/lib/dates";
import { Card, CardHeader, Badge, Avatar, VisibilityBadge, LinkButton } from "@/components/ui";
import {
  ProjectSettingsForm,
  AddMemberForm,
  RemoveMemberButton,
  ArchiveProjectButton,
  DeleteProjectForm,
  CompleteHistoricalOnTimeForm,
  PhaseVisibilityList,
} from "./settings-forms";
import { ProjectContacts } from "./contacts";
import { SlipHistoryList } from "@/components/slip-history";
import { RecordSlipForm } from "@/components/record-slip-form";
import { staffingRoleLabel } from "@/lib/staffing";
import { AddRcmPanel } from "./add-rcm-track-form";
import { CollapsedSection } from "@/components/collapsed-section";
import { assessHistoricalComplete, loadOpenHistoricalTasks } from "@/lib/historical-complete";
import {
  addRcmEligibility,
  billingRcmAssignmentsFromMembers,
  isHandoffComplete,
} from "@/lib/add-rcm";

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
          phone: true,
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
  const contactsOnProject = accountContacts
    .filter((c) => contactIdsOnProject.has(c.id))
    .map((c) => ({
      ...c,
      memberRole: project.members.find((m) => m.userId === c.id)?.role ?? "CUSTOMER_CONTACT",
    }));
  const contactsAvailable = accountContacts.filter(
    (c) => !contactIdsOnProject.has(c.id) && c.isActive,
  );

  const memberIds = new Set(project.members.map((m) => m.userId));
  const candidates = staff.filter((u) => !memberIds.has(u.id));

  const projectPhases = await db.query.phases.findMany({
    where: eq(phases.projectId, id),
    columns: { id: true, name: true, visibility: true, status: true, notApplicable: true },
    orderBy: [asc(phases.order)],
  });

  const projectSlips = await db.query.slipEvents.findMany({
    where: eq(slipEvents.projectId, id),
    orderBy: [desc(slipEvents.createdAt)],
  });

  const historicalEligibility = assessHistoricalComplete(project);
  const openHistoricalTasks = historicalEligibility.ok ? await loadOpenHistoricalTasks(id) : [];

  const addRcm = addRcmEligibility({
    type: project.type,
    status: project.status,
    onboarded: project.onboarded,
    archivedAt: project.archivedAt,
    playbookPath: project.playbookPath,
    rcmTaskCountTotal: project.rcmTaskCountTotal,
    hasRcmWorkTrack: project.rcmTaskCountTotal > 0,
    handoffComplete: isHandoffComplete(
      projectPhases.map((p) => ({
        name: p.name,
        status: p.status,
        notApplicable: p.notApplicable,
      })),
    ),
  });
  const showAddRcm = addRcm.ok || (!addRcm.ok && addRcm.reason === "already-on");
  const rcmAssignments = billingRcmAssignmentsFromMembers(
    project.members.filter((m) => m.user.role !== "CUSTOMER"),
  );

  return (
    <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-[1.3fr_1fr]">
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
              ? toDateInput(project.targetGoLiveDate) || null
              : null,
            portalEnabled: project.portalEnabled,
            portalWelcomeMessage: project.portalWelcomeMessage,
            excludeFromAnalytics: project.excludeFromAnalytics,
          }}
          staff={staff}
        />
        <div className="border-t border-border">
          <CollapsedSection title="Record a slip" openLabel="Record" closeLabel="Cancel">
            <div className="px-4 py-3">
              <RecordSlipForm
                projectId={project.id}
                currentGoLive={
                  project.targetGoLiveDate ? toDateInput(project.targetGoLiveDate) : ""
                }
                source="settings"
                variant="settings"
              />
            </div>
          </CollapsedSection>
        </div>
        {projectSlips.length > 0 ? (
          <div className="border-t border-border px-5 py-4">
            <SlipHistoryList slips={projectSlips} />
          </div>
        ) : (
          <p className="border-t border-border px-4 py-2 text-[12px] text-ink-3">
            No slips recorded.
          </p>
        )}
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader
            title="Customer contacts"
            subtitle={customer ? customer.name : "No customer"}
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
          <CardHeader title="Your team" />
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
                    {staffingRoleLabel(m.role)}
                  </div>
                </div>
                <RemoveMemberButton projectId={id} userId={m.userId} />
              </div>
              ))}
          </div>
          <AddMemberForm projectId={id} candidates={candidates} />
        </Card>

        {showAddRcm ? (
          <AddRcmPanel
            projectId={id}
            staff={staff}
            defaultAssignments={rcmAssignments}
            alreadyOn={!addRcm.ok}
            summary={{
              startedAt: project.rcmStartedAt ? project.rcmStartedAt.toISOString() : null,
              targetGoLiveDate: project.rcmTargetGoLiveDate
                ? project.rcmTargetGoLiveDate.toISOString()
                : null,
              taskCountDone: project.rcmTaskCountDone,
              taskCountTotal: project.rcmTaskCountTotal,
            }}
          />
        ) : null}

        <Card>
          <CardHeader
            title="Portal status"
            action={
              <VisibilityBadge visibility={project.portalEnabled ? "SHARED" : "INTERNAL"} />
            }
          />
          <p className="px-4 py-3 text-[13px] text-ink-2">
            {project.portalEnabled
              ? "Contacts can sign in and see shared work."
              : "Portal is off. Contacts cannot open this project."}
          </p>
        </Card>

        <Card>
          <CardHeader title="Portal tabs" />
          <PhaseVisibilityList phases={projectPhases} />
        </Card>

        <Card>
          <CardHeader
            title="Recordings"
            action={
              <LinkButton href={`/projects/${id}/recordings`} size="sm">
                Recordings
              </LinkButton>
            }
          />
          <p className="px-4 py-3 text-[13px] text-ink-2">
            Attach Zoom links on each training task. The Recordings tab lists those same links — there
            is no separate upload here.
          </p>
        </Card>

        <Card>
          <CollapsedSection title="Danger zone" openLabel="Show" closeLabel="Hide">
          <div className="space-y-4 p-4">
            <div>
              <h3 className="text-[13px] font-medium text-ink">Complete historical tasks on time</h3>
              {!historicalEligibility.ok ? (
                <p className="mt-2 text-[12.5px] text-ink-3">
                  {historicalEligibility.reason}
                </p>
              ) : openHistoricalTasks.length === 0 ? (
                <p className="mt-2 text-[12.5px] text-ink-3">No open tasks to complete.</p>
              ) : (
                <div className="mt-2">
                  <CompleteHistoricalOnTimeForm
                    projectId={id}
                    confirmToken={project.crmAcronym || project.code}
                    openCount={openHistoricalTasks.length}
                  />
                </div>
              )}
            </div>
            <div className="border-t border-border pt-4">
              <ArchiveProjectButton projectId={id} />
              <p className="mt-2 text-[12px] text-ink-3">
                Archiving hides the project from lists and revokes portal access. Nothing is deleted.
              </p>
            </div>
            {canDeletePortfolioRecords(actor) ? (
              <div className="border-t border-border pt-4">
                <DeleteProjectForm
                  projectId={id}
                  confirmToken={project.crmAcronym || project.code}
                  historicalWarning={
                    project.status === "COMPLETED" || Boolean(project.actualGoLiveDate) || Boolean(project.archivedAt)
                  }
                />
              </div>
            ) : null}
          </div>
          </CollapsedSection>
        </Card>
      </div>
    </div>
  );
}
