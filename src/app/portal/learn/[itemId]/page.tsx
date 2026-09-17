import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/guard";
import { loadLearningItem } from "@/lib/learning-center";
import { LearningItemMedia } from "@/components/learning-item-media";
import { LinkButton } from "@/components/ui";
import {
  learningIframeSrc,
  learningOpenLabel,
  learningPlaceholderLabel,
} from "@/db/learning-center-catalog";

export const dynamic = "force-dynamic";

export default async function PortalLearnItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const actor = await requireCustomer();
  const item = await loadLearningItem(actor, itemId);
  if (!item) notFound();

  const fileHref =
    item.storageKey || item.libraryAsset?.storageKey ? `/api/learn/${item.id}/file` : null;
  const openUrl = item.url ?? item.libraryAsset?.url ?? null;
  const showPending = item.isPlaceholder && !fileHref && !openUrl;
  const iframe = openUrl ? learningIframeSrc(openUrl) : null;
  const helper = iframe ? null : item.body || item.summary;

  return (
    <>
      <Link href="/portal/learn" className="mb-4 inline-block text-[12.5px] text-ink-3 hover:text-brand">
        ← Learning Center
      </Link>
      <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">{item.title}</h1>
      {showPending ? (
        <p className="mt-1 text-[12.5px] text-ink-3">{learningPlaceholderLabel(item.kind)}</p>
      ) : null}
      {openUrl ? <LearningItemMedia title={item.title} kind={item.kind} url={openUrl} /> : null}
      {fileHref ? (
        <div className="mt-4">
          <LinkButton href={fileHref} variant="primary">
            {learningOpenLabel(item.libraryAsset?.name ?? item.title, "FILE")}
          </LinkButton>
        </div>
      ) : null}
      {helper ? (
        <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-2">{helper}</p>
      ) : null}
    </>
  );
}
