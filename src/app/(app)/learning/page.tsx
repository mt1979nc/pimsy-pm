import Link from "next/link";
import { requireStaff } from "@/lib/guard";
import { canManageLearningCenter } from "@/lib/authz";
import { loadLearningCatalog } from "@/lib/learning-center";
import { LearningCatalog } from "@/components/learning-catalog";
import { PageHeader, Card, CardHeader, Badge, LinkButton } from "@/components/ui";
import { TemplateHubNav } from "@/components/template-hub-nav";
import { AddLearningItemForm, EditLearningItemForm } from "./learning-forms";
import { db } from "@/db";
import { libraryAssets } from "@/db/schema";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Learning Center" };

export default async function StaffLearningPage() {
  const actor = await requireStaff();
  const canEdit = canManageLearningCenter(actor);
  const sections = await loadLearningCatalog(actor, { includeDrafts: canEdit });
  const library = canEdit
    ? await db.query.libraryAssets.findMany({ orderBy: [asc(libraryAssets.name)] })
    : [];

  return (
    <>
      <PageHeader
        title="Learning Center"
        subtitle="PIMSY how-tos and Storylanes — Getting started, Password & access, Scheduling, Notes, Providers, Training. Titled cards, not unlabeled PDFs. Owners and admins can curate."
        actions={
          canEdit ? (
            <LinkButton href="/library" size="sm">
              File library
            </LinkButton>
          ) : null
        }
      />
      {canEdit ? <TemplateHubNav current="/learning" /> : null}

      <LearningCatalog
        sections={sections}
        emptyHint="No Learning Center items yet. Run npm run db:seed -- --templates-only."
      />

      {canEdit
        ? sections.map((section) => (
            <Card key={"edit-" + section.id} className="mt-5">
              <CardHeader
                title={section.title}
                subtitle="Add or edit items in this section"
                action={<Badge>{section.items.length}</Badge>}
              />
              {section.items.map((item) => (
                <details key={item.id} className="border-t border-border">
                  <summary className="cursor-pointer px-5 py-2.5 text-[13.5px] font-medium hover:bg-surface-2">
                    {item.title}
                    {item.isPlaceholder ? (
                      <span className="ml-2 text-[12px] font-normal text-ink-3">placeholder</span>
                    ) : null}
                  </summary>
                  <EditLearningItemForm
                    item={{
                      id: item.id,
                      title: item.title,
                      summary: item.summary,
                      body: item.body,
                      url: item.url,
                      published: item.published,
                    }}
                  />
                </details>
              ))}
              <AddLearningItemForm sectionId={section.id} />
            </Card>
          ))
        : null}

      {canEdit && library.length > 0 ? (
        <p className="mt-5 text-[12.5px] text-ink-3">
          Default Dock files (Discovery Wizard, billing sheets) live in the{" "}
          <Link href="/library" className="text-brand hover:underline">
            file library
          </Link>
          . Replacing a placeholder there updates new workspaces and Learning Center downloads.
        </p>
      ) : null}
    </>
  );
}
