import { redirect } from "next/navigation";
import { and, eq, ne, asc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { customerAccounts, users, projectTemplates, projects } from "@/db/schema";
import { requireStaff } from "@/lib/guard";
import { canCreateProjects } from "@/lib/authz";
import { PageHeader, LinkButton, Card, EmptyState } from "@/components/ui";
import { NewProjectForm } from "./new-project-form";
import { collectOptionalAreas, type LoadedTemplate } from "@/lib/playbook";

export const dynamic = "force-dynamic";
export const metadata = { title: "New project" };

export default async function NewProjectPage() {
  const actor = await requireStaff();
  if (!canCreateProjects(actor)) redirect("/projects");

  const [customers, staff, templates, existingProjects] = await Promise.all([
    db.query.customerAccounts.findMany({
      where: isNull(customerAccounts.archivedAt),
      columns: { id: true, name: true },
      orderBy: [asc(customerAccounts.name)],
    }),
    db.query.users.findMany({
      where: and(eq(users.isActive, true), ne(users.role, "CUSTOMER")),
      columns: { id: true, name: true, staffingRole: true },
      orderBy: [asc(users.name)],
    }),
    db.query.projectTemplates.findMany({
      where: eq(projectTemplates.isActive, true),
      with: {
        phases: {
          with: {
            tasks: true,
          },
        },
      },
      orderBy: [asc(projectTemplates.name)],
    }),
    db.query.projects.findMany({
      where: isNull(projects.archivedAt),
      columns: { id: true, name: true, code: true, customerAccountId: true },
      orderBy: [asc(projects.name)],
    }),
  ]);

  const templateSummaries = templates.map((t) => {
    const allTasks = t.phases.flatMap((p) => p.tasks);
    const optionalAreas = collectOptionalAreas([t as unknown as LoadedTemplate]);
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      durationDays: t.durationDays,
      type: t.type,
      code: t.code,
      playbookPath: t.playbookPath,
      phaseCount: t.phases.length,
      taskCount: allTasks.length,
      customerTaskCount: allTasks.filter((x) => x.ownerSide === "CUSTOMER").length,
      optionalAreas,
    };
  });

  return (
    <>
      <PageHeader
        title="New project"
        breadcrumb={
          <LinkButton href="/projects" variant="ghost" size="sm" className="-ml-2.5">
            ← Projects
          </LinkButton>
        }
      />
      {customers.length === 0 ? (
        <Card>
          <EmptyState
            title="Add a customer first"
            description="Projects belong to a customer account. Create one, then come back here."
            action={
              <LinkButton href="/customers/new" variant="primary" size="sm">
                Add customer
              </LinkButton>
            }
          />
        </Card>
      ) : (
        <NewProjectForm
          customers={customers}
          staff={staff}
          templates={templateSummaries}
          existingProjects={existingProjects}
          defaultLeadId={actor.id}
        />
      )}
    </>
  );
}
