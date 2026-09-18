/**
 * People you can @ in comments / project updates for a site.
 * Server-only (loads users). Client picker receives the result as props.
 */

import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { projectMembers, projects, users } from "@/db/schema";
import { peopleToMentionCandidates, type MentionCandidate } from "@/lib/mentions";

const COLS = { id: true, name: true, email: true, role: true } as const;

/**
 * Staff composer: every active PATH teammate + this site’s customer contacts.
 * Portal composer: implementation-team members + this site’s customer contacts
 * (not the whole staff directory).
 */
export async function listMentionCandidates(
  projectId: string,
  audience: "staff" | "portal",
): Promise<MentionCandidate[]> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { customerAccountId: true, leadId: true },
  });
  if (!project) return [];

  const contacts = project.customerAccountId
    ? await db.query.users.findMany({
        where: and(
          eq(users.isActive, true),
          eq(users.role, "CUSTOMER"),
          eq(users.customerAccountId, project.customerAccountId),
        ),
        columns: COLS,
        orderBy: [asc(users.name)],
      })
    : [];

  let staff: { id: string; name: string | null; email: string; role: string }[];
  if (audience === "staff") {
    staff = await db.query.users.findMany({
      where: and(eq(users.isActive, true), ne(users.role, "CUSTOMER")),
      columns: COLS,
      orderBy: [asc(users.name)],
    });
  } else {
    const members = await db.query.projectMembers.findMany({
      where: eq(projectMembers.projectId, projectId),
      with: { user: { columns: { ...COLS, isActive: true } } },
    });
    const fromMembers: { id: string; name: string | null; email: string; role: string }[] = members
      .map((m) => m.user)
      .filter((u): u is NonNullable<typeof u> => Boolean(u) && u.role !== "CUSTOMER" && u.isActive !== false)
      .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role }));
    const ids = new Set(fromMembers.map((u) => u.id));
    if (project.leadId && !ids.has(project.leadId)) {
      const lead = await db.query.users.findFirst({
        where: and(eq(users.id, project.leadId), eq(users.isActive, true), ne(users.role, "CUSTOMER")),
        columns: COLS,
      });
      if (lead) fromMembers.push(lead);
    }
    staff = fromMembers.sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
  }

  return peopleToMentionCandidates([...staff, ...contacts]);
}
