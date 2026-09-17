import { requireCustomer } from "@/lib/guard";
import { loadLearningCatalog } from "@/lib/learning-center";
import { LearningCatalog } from "@/components/learning-catalog";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Learning Center" };

export default async function PortalLearnPage() {
  const actor = await requireCustomer();
  const sections = await loadLearningCatalog(actor);

  return (
    <>
      <PageHeader title="Learning Center" />
      <LearningCatalog
        sections={sections}
        hrefPrefix="/portal/learn"
        emptyHint="Nothing published yet."
      />
    </>
  );
}
