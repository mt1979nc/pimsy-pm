import { notFound } from "next/navigation";
import { and, eq, ne, asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { projects, users, customerAccounts, phases, fileAssets, slipEvents, tasks } from "@/db/schema";
import { requireStaff } from "@/lib/guard";
import { assertProjectAccess, canDeletePortfolioRecords } from "@/lib/authz";
import { toDateInput } from "@/lib/dates";
import { trainingSessionsFromTasks } from "@/lib/training-session";
import { Card, CardHeader, Badge, Avatar, VisibilityBadge } from "@/components/ui";
import {
  ProjectSettingsForm,
  AddMemberForm,
  RemoveMemberButton,
  ArchiveProjectButton,
  DeleteProjectForm,
  CompleteHistoricalOnTimeForm,
  PhaseVisibilityList,
  RecordingsManager,
} from "./settings-forms";
import { ProjectContacts } from "./contacts";
import { SlipHistoryList } from "@/components/slip-history";
import { RecordSlipForm } from "@/components/record-slip-form";
import { staffingRoleLabel } from "@/lib/staffing";
import { AddRcmAlreadyOnNote, AddRcmTrackForm } from "./add-rcm-track-form";
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

  const recordings = await db.query.fileAssets.findMany({
    where: and(eq(fileAssets.projectId, id), eq(fileAssets.isRecording, true)),
    columns: { id: true, name: true, description: true, visibility: true, taskId: true },
    orderBy: [desc(fileAssets.createdAt)],
  });

  const trainingRows = await db.query.tasks.findMany({
    where: eq(tasks.projectId, id),
    columns: { id: true, title: true },
  });
  const trainingSessions = trainingSessionsFromTasks(trainingRows).map((t) => ({
    id: t.id,
    title: t.title,
    label: t.ref.sessionLabel,
  }));

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
              ? toDateInput(project.targetGoLiveDate) || null
              : null,
            portalEnabled: project.portalEnabled,
            portalWelcomeMessage: project.portalWelcomeMessage,
            excludeFromAnalytics: project.excludeFromAnalytics,
          }}
          staff={staff}
        />
        <div className="border-t border-border px-5 py-4">
          <div className="rounded-xl border border-transparent bg-amber-soft p-4">
            <h3 className="mb-2 text-[13px] font-semibold text-ink">Record a slip</h3>
            <RecordSlipForm
              projectId={project.id}
              currentGoLive={
                project.targetGoLiveDate ? toDateInput(project.targetGoLiveDate) : ""
              }
              source="settings"
              variant="settings"
            />
          </div>
        </div>
        {projectSlips.length > 0 ? (
          <div className="border-t border-border px-5 py-4">
            <SlipHistoryList slips={projectSlips} />
          </div>
        ) : (
          <p className="border-t border-border px-5 py-3 text-[12.5px] text-ink-3">
            No slips recorded yet. Record slip saves the event and confirmation here.
          </p>
        )}
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
          <Card id="add-rcm">
            <CardHeader
              title="Add RCM"
              subtitle={
                addRcm.ok
                  ? "Enable the RCM area on this live Implementation WIP. Does not rewrite EHR dates."
                  : "RCM area"
              }
            />
            {addRcm.ok ? (
              <AddRcmTrackForm projectId={id} staff={staff} defaultAssignments={rcmAssignments} />
            ) : (
              <AddRcmAlreadyOnNote />
            )}
          </Card>
        ) : null}

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
            subtitle="Dock eyelid: hide until ready, then expose (same control as the task list). Kickoff and Discovery start visible on a new workspace."
          />
          <PhaseVisibilityList phases={projectPhases} />
        </Card>

        <Card>
          <CardHeader
            title="Recordings"
            subtitle="Shown on the portal Recordings tab and mirrored onto the matching training task"
          />
          <RecordingsManager projectId={id} recordings={recordings} sessions={trainingSessions} />
        </Card>

        <Card>
          <CardHeader title="Danger zone" />
          <div className="space-y-5 p-5">
            <div>
              <h3 className="text-[13px] font-medium text-ink">Complete historical tasks on time</h3>
              {!historicalEligibility.ok ? (
                <p className="mt-2 text-[12.5px] text-ink-3">
                  {historicalEligibility.reason} Use About → Onboarded for overview exclusion
                  without rewriting task history, or add kickoff and go-live dates first.
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
            <div className="border-t border-border pt-5">
              <ArchiveProjectButton projectId={id} />
              <p className="mt-2 text-[12px] text-ink-3">
                Archiving hides the project from lists and immediately revokes portal access. Nothing
                is deleted.
              </p>
            </div>
            {canDeletePortfolioRecords(actor) ? (
              <div className="border-t border-border pt-5">
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
        </Card>
      </div>
    </div>
  );
}
