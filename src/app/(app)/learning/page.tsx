import { requireStaff } from "@/lib/guard";
import { canManageLearningCenter } from "@/lib/authz";
import { loadLearningCatalog } from "@/lib/learning-center";
import { LearningCatalog } from "@/components/learning-catalog";
import { PageHeader, Card, CardHeader, Badge, LinkButton } from "@/components/ui";
import { TemplateHubNav } from "@/components/template-hub-nav";
import { AddLearningItemForm, EditLearningItemForm } from "./learning-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Learning Center" };

export default async function StaffLearningPage() {
  const actor = await requireStaff();
  const canEdit = canManageLearningCenter(actor);
  const sections = await loadLearningCatalog(actor, { includeDrafts: canEdit });

  return (
    <>
      <PageHeader
        title="Learning Center"
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
        emptyHint="Nothing published yet. Seed with npm run db:seed -- --templates-only."
      />

      {canEdit
        ? sections.map((section) => (
            <Card key={"edit-" + section.id} className="mt-5">
              <CardHeader title={section.title} action={<Badge>{section.items.length}</Badge>} />
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
    </>
  );
}
