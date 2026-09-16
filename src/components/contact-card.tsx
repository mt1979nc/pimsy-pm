import type { ReactNode } from "react";
import { Avatar, Badge } from "@/components/ui";
import { fmtRelative } from "@/lib/dates";
import { cn } from "@/lib/cn";

export type ContactCardPerson = {
  name: string | null;
  email: string;
  title?: string | null;
  phone?: string | null;
  image?: string | null;
  isActive?: boolean;
  lastSeenAt?: Date | string | null;
};

/**
 * One visual treatment for portal contacts — customer page, project settings,
 * People, and the project Team card. Actions stay with the caller.
 */
export function ContactCard({
  person,
  badges,
  actions,
  showLastSeen = true,
}: {
  person: ContactCardPerson;
  badges?: ReactNode;
  actions?: ReactNode;
  showLastSeen?: boolean;
}) {
  const active = person.isActive !== false;
  const seen = person.lastSeenAt ?? null;
  const neverSignedIn = showLastSeen && active && !seen;
  const meta = [
    person.email,
    person.title?.trim() || null,
    person.phone?.trim() || null,
    showLastSeen && seen ? `seen ${fmtRelative(seen)}` : null,
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Avatar name={person.name ?? person.email} image={person.image} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "truncate text-[13px] font-medium",
              active ? "text-ink" : "text-ink-3 line-through",
            )}
          >
            {person.name ?? person.email}
          </span>
          {!active ? <Badge tone="red">Access revoked</Badge> : null}
          {neverSignedIn ? <Badge tone="amber">Never signed in</Badge> : null}
          {badges}
        </div>
        {meta.length > 0 ? (
          <div className="truncate text-[12px] text-ink-3">{meta.join(" · ")}</div>
        ) : null}
      </div>
      {actions ? <div className="shrink-0 text-right">{actions}</div> : null}
    </div>
  );
}
