import { notFound } from "next/navigation";
import Link from "next/link";
import { requireStaff } from "@/lib/guard";
import { loadLearningItem } from "@/lib/learning-center";
import { Card, CardHeader, Badge, LinkButton } from "@/components/ui";
import { LEARNING_AUDIENCE_LABEL, LEARNING_TOPIC_META, type LearningAudience, type LearningTopic } from "@/db/learning-center-catalog";

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

  return (
    <>
      <Link href="/learning" className="mb-3 inline-block text-[12.5px] text-ink-3 hover:text-brand">
        ← Learning Center
      </Link>
      <div className="mb-3 flex flex-wrap gap-2">
        <Badge>{topicLabel}</Badge>
        <Badge>{item.section.title}</Badge>
        {item.audienceRole !== "all" ? (
          <Badge>{LEARNING_AUDIENCE_LABEL[item.audienceRole as LearningAudience] ?? item.audienceRole}</Badge>
        ) : null}
        {!item.published ? <Badge tone="amber">Draft</Badge> : null}
      </div>
      <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{item.title}</h1>
      {item.summary ? <p className="mt-2 text-[14px] text-ink-2">{item.summary}</p> : null}
      {item.body ? (
        <Card className="mt-5">
          <CardHeader title="Overview" />
          <div className="whitespace-pre-wrap px-5 py-4 text-[14px] leading-relaxed text-ink">{item.body}</div>
        </Card>
      ) : null}
      {fileHref || item.url ? (
        <Card className="mt-5">
          <CardHeader title="File or link" />
          <div className="flex flex-wrap gap-2 px-5 py-4">
            {fileHref ? (
              <LinkButton href={fileHref} variant="primary">
                Download
              </LinkButton>
            ) : null}
            {item.url ? <LinkButton href={item.url}>Open link</LinkButton> : null}
          </div>
        </Card>
      ) : null}
    </>
  );
}
