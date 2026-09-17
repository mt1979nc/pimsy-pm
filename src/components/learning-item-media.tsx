import { LinkButton } from "@/components/ui";
import {
  learningIframeSrc,
  learningOpenLabel,
  isLearningStorylaneUrl,
  isLearningPdfUrl,
} from "@/db/learning-center-catalog";

export function LearningItemMedia({
  title,
  kind,
  url,
}: {
  title: string;
  kind: string;
  url: string;
}) {
  const iframeSrc = learningIframeSrc(url);
  const openLabel = learningOpenLabel(title, kind);
  const frameTitle = isLearningStorylaneUrl(url)
    ? `${title} walkthrough`
    : isLearningPdfUrl(url)
      ? `${title} PDF`
      : title;

  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-border bg-surface">
      {iframeSrc ? (
        <iframe
          title={frameTitle}
          src={iframeSrc}
          className="h-[min(640px,70vh)] w-full bg-white"
          allow="fullscreen"
        />
      ) : null}
      <div className="flex flex-wrap gap-2 px-4 py-3">
        <LinkButton href={url} variant={iframeSrc ? "secondary" : "primary"} target="_blank" rel="noopener noreferrer">
          {openLabel}
        </LinkButton>
      </div>
    </div>
  );
}
