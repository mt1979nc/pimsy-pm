import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { libraryAssets, projectTemplates } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import { PageHeader, LinkButton } from "@/components/ui";
import { TemplateHubNav } from "@/components/template-hub-nav";
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

  const [row, library] = await Promise.all([
    db.query.projectTemplates.findFirst({
      where: eq(projectTemplates.id, id),
      with: {
        phases: {
          with: {
            tasks: {
              with: {
                defaultAttachments: { with: { libraryAsset: true } },
                checklistItems: true,
              },
            },
          },
          orderBy: (p, { asc: a }) => [a(p.order)],
        },
      },
    }),
    db.query.libraryAssets.findMany({
      orderBy: [asc(libraryAssets.name)],
      columns: {
        id: true,
        name: true,
        slug: true,
        kind: true,
        isPlaceholder: true,
      },
    }),
  ]);
  if (!row) notFound();

  const phases = row.phases.map((p) => ({
    ...p,
    tasks: [...p.tasks]
      .sort((a, b) => a.order - b.order)
      .map((task) => ({
        ...task,
        checklistItems: [...task.checklistItems].sort((a, b) => a.order - b.order),
        attachments: task.defaultAttachments.map((att) => ({
          id: att.id,
          name: att.libraryAsset?.name ?? "Attachment",
          kind: att.libraryAsset?.kind ?? "FILE",
          isPlaceholder: att.libraryAsset?.isPlaceholder ?? false,
          libraryAssetId: att.libraryAssetId,
          url: att.libraryAsset?.url ?? null,
          storageKey: att.libraryAsset?.storageKey ?? null,
        })),
      })),
  }));

  return (
    <>
      <PageHeader
        title={row.name}
        subtitle="Dock-style editor: descriptions, nested tasks, connected keys, move to another tab, training checklists, default files, and optional areas. Live projects are not rewritten."
        breadcrumb={
          <LinkButton href="/templates" variant="ghost" size="sm" className="-ml-2.5">
            ← Templates
          </LinkButton>
        }
      />
      <TemplateHubNav current={`/templates/${row.id}`} />
      <TemplateEditor
        template={{
          id: row.id,
          name: row.name,
          description: row.description,
          durationDays: row.durationDays,
          isActive: row.isActive,
          playbookPath: row.playbookPath,
          isLocked: row.isLocked,
          phases,
        }}
        library={library}
      />
    </>
  );
}
