import { notFound } from "next/navigation";
import Link from "next/link";
import { requireStaff } from "@/lib/guard";
import { loadLearningItem } from "@/lib/learning-center";
import { LearningItemMedia } from "@/components/learning-item-media";
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

export default async function StaffLearningItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const actor = await requireStaff();
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
      <Link href="/learning" className="mb-3 inline-block text-[12.5px] text-ink-3 hover:text-brand">
        ← Learning Center
      </Link>
      <div className="mb-3 flex flex-wrap gap-2">
        <Badge>{topicLabel}</Badge>
        <Badge>{item.section.title}</Badge>
        <Badge>{learningKindLabel(item.kind, openUrl)}</Badge>
        {item.audienceRole !== "all" ? (
          <Badge>{LEARNING_AUDIENCE_LABEL[item.audienceRole as LearningAudience] ?? item.audienceRole}</Badge>
        ) : null}
        {!item.published ? <Badge tone="amber">Draft</Badge> : null}
        {showPending ? <Badge tone="amber">{learningPlaceholderLabel(item.kind)}</Badge> : null}
      </div>
      <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{item.title}</h1>
      {item.summary ? <p className="mt-2 text-[14px] text-ink-2">{item.summary}</p> : null}
      {item.body ? (
        <Card className="mt-5">
          <CardHeader title="Overview" />
          <div className="whitespace-pre-wrap px-5 py-4 text-[14px] leading-relaxed text-ink">{item.body}</div>
        </Card>
      ) : null}
      {openUrl ? <LearningItemMedia title={item.title} kind={item.kind} url={openUrl} /> : null}
      {fileHref ? (
        <Card className="mt-5">
          <CardHeader title="Download" />
          <div className="flex flex-wrap gap-2 px-5 py-4">
            <LinkButton href={fileHref} variant="primary">
              {learningOpenLabel(item.libraryAsset?.name ?? item.title, "FILE")}
            </LinkButton>
          </div>
        </Card>
      ) : null}
      {showPending && !openUrl && !fileHref ? (
        <Card className="mt-5">
          <CardHeader title={learningPlaceholderLabel(item.kind)} />
          <p className="px-5 py-4 text-[14px] leading-relaxed text-ink-2">
            The live Storylane or Dock file is not attached yet. Do not invent a Storylane address.
          </p>
        </Card>
      ) : null}
    </>
  );
}
