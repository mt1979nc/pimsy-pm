import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/guard";
import { loadLearningItem } from "@/lib/learning-center";
import { Card, CardHeader, Badge, LinkButton } from "@/components/ui";
import {
  LEARNING_AUDIENCE_LABEL,
  LEARNING_TOPIC_META,
  learningKindLabel,
  learningOpenLabel,
  learningPlaceholderLabel,
  type LearningAudience,
  type LearningTopic,
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

  const topicLabel =
    LEARNING_TOPIC_META[item.section.topic as LearningTopic]?.label ?? item.section.topic;
  const fileHref =
    item.storageKey || item.libraryAsset?.storageKey ? `/api/learn/${item.id}/file` : null;
  const openUrl = item.url ?? item.libraryAsset?.url ?? null;
  const showPending = item.isPlaceholder && !fileHref && !openUrl;

  return (
    <>
      <Link href="/portal/learn" className="mb-3 inline-block text-[12.5px] text-ink-3 hover:text-brand">
        ← Learning Center
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge>{topicLabel}</Badge>
        <Badge>{item.section.title}</Badge>
        <Badge>{learningKindLabel(item.kind)}</Badge>
        {item.audienceRole !== "all" ? (
          <Badge>{LEARNING_AUDIENCE_LABEL[item.audienceRole as LearningAudience] ?? item.audienceRole}</Badge>
        ) : null}
        {showPending ? (
          <Badge tone="amber">
            {learningPlaceholderLabel(item.kind)} — ask your specialist for the live copy
          </Badge>
        ) : null}
      </div>
      <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">{item.title}</h1>
      {item.summary ? <p className="mt-2 text-[14px] text-ink-2">{item.summary}</p> : null}

      <div className="mt-5 space-y-5">
        {item.body ? (
          <Card>
            <CardHeader title="Overview" />
            <div className="whitespace-pre-wrap px-5 py-4 text-[14px] leading-relaxed text-ink">{item.body}</div>
          </Card>
        ) : null}

        {fileHref || openUrl ? (
          <Card>
            <CardHeader title="Open" />
            <div className="flex flex-wrap gap-2 px-5 py-4">
              {fileHref ? (
                <LinkButton href={fileHref} variant="primary">
                  {learningOpenLabel(item.libraryAsset?.name ?? item.title, "FILE")}
                </LinkButton>
              ) : null}
              {openUrl ? (
                <LinkButton href={openUrl} variant="secondary" target="_blank" rel="noopener noreferrer">
                  {learningOpenLabel(item.title, item.kind)}
                </LinkButton>
              ) : null}
            </div>
          </Card>
        ) : showPending ? (
          <Card>
            <CardHeader title={learningPlaceholderLabel(item.kind)} />
            <p className="px-5 py-4 text-[14px] leading-relaxed text-ink-2">
              The live Storylane or Dock file is not attached yet. Your specialist will paste the
              cohort URL on this card. PATH does not invent Storylane or unlabeled “View PDF” links.
            </p>
          </Card>
        ) : null}
      </div>
    </>
  );
}
