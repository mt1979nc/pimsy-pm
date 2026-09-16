/**
 * Server loader for About / kickoff / CRM contact cards.
 * Staff and portal pages share the same builders; portal filters happen in
 * `toPortalAbout` so HubSpot / CRM keys / reserved extras never leak.
 */
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { phases, projectMembers, projects, tasks, users } from "@/db/schema";
import {
  customerContactCards,
  implementationTeamCards,
  isKickoffPhaseName,
  isoDateOrNull,
  type AboutContactInput,
  type KickoffSnapshot,
  type KickoffSnapshotItem,
} from "@/lib/about-profile";

const PERSON_COLUMNS = {
  id: true,
  name: true,
  email: true,
  title: true,
  phone: true,
  image: true,
  isActive: true,
  role: true,
  staffingRole: true,
  customerAccountId: true,
} as const;

export async function loadProjectAbout(projectId: string) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: {
      lead: { columns: PERSON_COLUMNS },
      coLead: { columns: PERSON_COLUMNS },
      customerAccount: { columns: { id: true, name: true } },
    },
  });
  if (!project) return null;

  const memberships = await db.query.projectMembers.findMany({
    where: eq(projectMembers.projectId, projectId),
    with: { user: { columns: PERSON_COLUMNS } },
  });

  const kickoff = await loadKickoffSnapshot(projectId);
  const kickoffAssigneeIds = [
    ...new Set(
      kickoff.items
        .map((item) => item.assigneeId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const extraAssignees =
    kickoffAssigneeIds.length > 0
      ? await db.query.users.findMany({
          where: inArray(users.id, kickoffAssigneeIds),
          columns: PERSON_COLUMNS,
        })
      : [];

  const memberByUserId = new Map(memberships.map((m) => [m.userId, m]));
  const implInputs: AboutContactInput[] = [];

  if (project.lead) {
    implInputs.push({
      id: project.lead.id,
      name: project.lead.name,
      email: project.lead.email,
      title: project.lead.title,
      phone: project.lead.phone,
      image: project.lead.image,
      isActive: project.lead.isActive,
      memberRole: memberByUserId.get(project.lead.id)?.role ?? "LEAD",
      staffingRole: project.lead.staffingRole,
      userRole: project.lead.role,
      onProject: true,
    });
  }
  if (project.coLead) {
    implInputs.push({
      id: project.coLead.id,
      name: project.coLead.name,
      email: project.coLead.email,
      title: project.coLead.title,
      phone: project.coLead.phone,
      image: project.coLead.image,
      isActive: project.coLead.isActive,
      memberRole: memberByUserId.get(project.coLead.id)?.role ?? "CONTRIBUTOR",
      staffingRole: project.coLead.staffingRole,
      userRole: project.coLead.role,
      onProject: true,
    });
  }
  for (const row of memberships) {
    if (row.user.role === "CUSTOMER") continue;
    implInputs.push({
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      title: row.user.title,
      phone: row.user.phone,
      image: row.user.image,
      isActive: row.user.isActive,
      memberRole: row.role,
      staffingRole: row.user.staffingRole,
      userRole: row.user.role,
      onProject: true,
    });
  }
  for (const person of extraAssignees) {
    if (person.role === "CUSTOMER") continue;
    implInputs.push({
      id: person.id,
      name: person.name,
      email: person.email,
      title: person.title,
      phone: person.phone,
      image: person.image,
      isActive: person.isActive,
      memberRole: memberByUserId.get(person.id)?.role ?? person.staffingRole,
      staffingRole: person.staffingRole,
      userRole: person.role,
      onProject: memberByUserId.has(person.id),
    });
  }

  const accountContacts = project.customerAccountId
    ? await db.query.users.findMany({
        where: and(
          eq(users.role, "CUSTOMER"),
          eq(users.customerAccountId, project.customerAccountId),
        ),
        columns: PERSON_COLUMNS,
        orderBy: [asc(users.name)],
      })
    : [];

  const onProjectIds = new Set(
    memberships.filter((m) => m.user.role === "CUSTOMER").map((m) => m.userId),
  );
  const customerInputs: AboutContactInput[] = accountContacts.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    title: c.title,
    phone: c.phone,
    image: c.image,
    isActive: c.isActive,
    memberRole: onProjectIds.has(c.id) ? "CUSTOMER_CONTACT" : null,
    userRole: "CUSTOMER",
    onProject: onProjectIds.has(c.id),
  }));

  return {
    project,
    kickoff: {
      phaseName: kickoff.phaseName,
      phaseVisibility: kickoff.phaseVisibility,
      items: kickoff.items.map(({ assigneeId: _a, ...item }) => item),
    } satisfies KickoffSnapshot,
    implementationTeam: implementationTeamCards(implInputs),
    customerContacts: customerContactCards(customerInputs),
    customerInputs,
  };
}

type KickoffLoadedItem = KickoffSnapshotItem & { assigneeId: string | null };
type KickoffLoaded = Omit<KickoffSnapshot, "items"> & { items: KickoffLoadedItem[] };

async function loadKickoffSnapshot(projectId: string): Promise<KickoffLoaded> {
  const rows = await db.query.phases.findMany({
    where: eq(phases.projectId, projectId),
    columns: { id: true, name: true, visibility: true, notApplicable: true, order: true },
    orderBy: [asc(phases.order)],
    with: {
      tasks: {
        where: and(isNull(tasks.parentTaskId), eq(tasks.notApplicable, false), ne(tasks.status, "CANCELLED")),
        columns: {
          id: true,
          title: true,
          status: true,
          dueDate: true,
          visibility: true,
          assigneeId: true,
          order: true,
        },
        orderBy: [asc(tasks.order)],
      },
    },
  });
  const phase = rows.find((p) => !p.notApplicable && isKickoffPhaseName(p.name)) ?? null;
  if (!phase) {
    return { phaseName: null, phaseVisibility: null, items: [] };
  }
  return {
    phaseName: phase.name,
    phaseVisibility: phase.visibility,
    items: phase.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      dueDate: isoDateOrNull(t.dueDate),
      visibility: t.visibility,
      assigneeId: t.assigneeId,
    })),
  };
}
