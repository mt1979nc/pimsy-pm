import { Avatar, Badge } from "@/components/ui";
import type { AboutContactCard } from "@/lib/about-profile";
import { cn } from "@/lib/cn";

export function AboutContactCardView({
  card,
  showEmail,
  footnote,
}: {
  card: AboutContactCard;
  showEmail: boolean;
  footnote?: string | null;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border border-border bg-surface p-4",
        !card.isActive && "opacity-70",
      )}
    >
      <Avatar name={card.name} image={card.image} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="truncate text-[14px] font-medium text-ink">{card.name}</div>
          {!card.isActive ? <Badge>Revoked</Badge> : null}
          {card.kind === "customer" && !card.onProject ? (
            <Badge tone="amber">Account only</Badge>
          ) : null}
        </div>
        <div className="mt-0.5 text-[12.5px] text-ink-3">{card.roleLabel}</div>
        {showEmail ? (
          <a
            href={`mailto:${card.email}`}
            className="mt-1 block truncate text-[12.5px] text-brand hover:underline"
          >
            {card.email}
          </a>
        ) : null}
        {card.phone ? <div className="mt-0.5 text-[12.5px] text-ink-2">{card.phone}</div> : null}
        {footnote ? <div className="mt-1 text-[11.5px] text-ink-3">{footnote}</div> : null}
      </div>
    </div>
  );
}

export function AboutContactCardGrid({
  cards,
  showEmail,
  empty,
}: {
  cards: AboutContactCard[];
  showEmail: boolean;
  empty: string;
}) {
  if (cards.length === 0) {
    return <p className="px-1 py-2 text-[13px] text-ink-3">{empty}</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((card) => (
        <AboutContactCardView key={card.id} card={card} showEmail={showEmail} />
      ))}
    </div>
  );
}
