import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/guard";
import { loadLearningItem } from "@/lib/learning-center";
import { LearningItemMedia } from "@/components/learning-item-media";
import { Badge, LinkButton } from "@/components/ui";
import {
  learningIframeSrc,
  learningKindLabel,
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
      <Link href="/portal/learn" className="mb-3 inline-block text-[12.5px] text-ink-3 hover:text-brand">
        ← Learning Center
      </Link>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge>{learningKindLabel(item.kind, openUrl)}</Badge>
        {showPending ? <Badge tone="amber">{learningPlaceholderLabel(item.kind)}</Badge> : null}
      </div>
      <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">{item.title}</h1>
      {openUrl ? <LearningItemMedia title={item.title} kind={item.kind} url={openUrl} /> : null}
      {fileHref ? (
        <div className="mt-5">
          <LinkButton href={fileHref} variant="primary">
            {learningOpenLabel(item.libraryAsset?.name ?? item.title, "FILE")}
          </LinkButton>
        </div>
      ) : null}
      {helper ? (
        <p className="mt-5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-2">{helper}</p>
      ) : null}
      {showPending && !openUrl && !fileHref ? (
        <p className="mt-5 text-[14px] text-ink-2">Ask your specialist for the live copy.</p>
      ) : null}
    </>
  );
}
