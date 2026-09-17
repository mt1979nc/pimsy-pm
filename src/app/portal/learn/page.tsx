import Link from "next/link";
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
      <PageHeader
        title="Learning Center"
        subtitle="Guides and Storylanes for PIMSY — titled cards, not unlabeled PDFs."
      />
      <LearningCatalog
        sections={sections}
        hrefPrefix="/portal/learn"
        emptyHint="Nothing published yet. Your implementation specialist will add materials here."
      />
      <p className="mt-6 text-[13px] text-ink-2">
        Looking for a file on a configuration or training step? Open that step in{" "}
        <Link href="/portal" className="font-medium text-brand hover:underline">
          your workspace
        </Link>
        . This library is PIMSY how-tos.
      </p>
    </>
  );
}
