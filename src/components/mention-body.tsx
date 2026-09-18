import { splitMentionText } from "@/lib/mentions";
import { cn } from "@/lib/cn";

export function MentionBody({
  text,
  className,
  as: Tag = "p",
}: {
  text: string;
  className?: string;
  as?: "p" | "span" | "div";
}) {
  const parts = splitMentionText(text);
  return (
    <Tag className={className}>
      {parts.map((part, i) =>
        part.type === "mention" ? (
          <span
            key={`${part.userId}-${i}`}
            title={part.label}
            className={cn(
              "mx-0.5 inline-flex translate-y-px items-center rounded-md bg-brand-soft px-1 py-0 text-[12.5px] font-medium text-brand",
            )}
          >
            @{part.label}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </Tag>
  );
}
