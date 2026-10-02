import { requireStaff } from "@/lib/guard";
import { canManageLearningCenter } from "@/lib/authz";
import { loadLearningCatalog } from "@/lib/learning-center";
import { LearningCatalog } from "@/components/learning-catalog";
import { PageHeader } from "@/components/ui";
import { TemplateHubNav } from "@/components/template-hub-nav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Learning Center" };

export default async function StaffLearningPage() {
  const actor = await requireStaff();
  const canEdit = canManageLearningCenter(actor);
  const sections = await loadLearningCatalog(actor, { includeDrafts: canEdit });

  return (
    <>
      <PageHeader title="Learning Center" />
      {canEdit ? <TemplateHubNav current="/learning" /> : null}

      <LearningCatalog
        sections={sections}
        canEdit={canEdit}
        emptyHint="Nothing published yet. Seed with npm run db:seed -- --templates-only."
      />
    </>
  );
}
