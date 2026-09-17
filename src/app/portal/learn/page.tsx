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
                        subtitle="Searchable topic cards for your implementation — Intro, Training Guide, Discovery, and reference how-tos. No unlabeled PDFs or blank embeds. Nothing here should include patient information."
                      />
              <LearningCatalog
                        sections={sections}
                        emptyHint="Nothing published yet. Your implementation specialist will add materials here."
                      />
              <p className="mt-6 text-[12.5px] text-ink-3">
                      Looking for a file your specialist attached to a specific step? Open that task under{" "}
                      <Link href="/portal" className="text-brand hover:underline">
                                your workspace
                      </Link>Link>
                      .
              </p>p>
        </>>
      );
}
</>
