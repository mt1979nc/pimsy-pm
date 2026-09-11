import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projectTemplates } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import { PageHeader, LinkButton } from "@/components/ui";
import { TemplateEditor } from "./template-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit template" };

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const row = await db.query.projectTemplates.findFirst({
    where: eq(projectTemplates.id, id),
    with: {
      phases: {
        with: { tasks: true },
        orderBy: (p, { asc: a }) => [a(p.order)],
      },
    },
  });
  if (!row) notFound();

  const phases = row.phases.map((p) => ({
    ...p,
    tasks: [...p.tasks].sort((a, b) => a.order - b.order),
  }));

  return (
    <>
      <PageHeader
        title={row.name}
        subtitle="Fully editable playbook — add, remove, and drag to reorder phases and tasks."
        breadcrumb={
          <LinkButton href="/templates" variant="ghost" size="sm" className="-ml-2.5">
            ← Templates
          </LinkButton>
        }
      />
      <TemplateEditor
        template={{
          id: row.id,
          name: row.name,
          description: row.description,
          durationDays: row.durationDays,
          isActive: row.isActive,
          playbookPath: row.playbookPath,
          phases,
        }}
      />
    </>
  );
}
