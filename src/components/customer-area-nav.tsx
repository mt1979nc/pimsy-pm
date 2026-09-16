"use client";

import { SideNavLink } from "@/components/nav-link";

export function CustomerAreaNav({
  overviewHref,
  aboutHref,
  learnHref,
  phases,
  recordingsHref,
  messagesHref,
}: {
  overviewHref: string;
  aboutHref?: string;
  learnHref?: string;
  phases: Array<{ id: string; name: string; href: string }>;
  recordingsHref?: string;
  messagesHref?: string;
}) {
  return (
    <nav className="rounded-xl border border-border bg-surface p-2" aria-label="Customer-visible areas">
      <div className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        Areas
      </div>
      <SideNavLink href={overviewHref}>Overview</SideNavLink>
      {aboutHref ? <SideNavLink href={aboutHref}>About</SideNavLink> : null}
      {learnHref ? <SideNavLink href={learnHref}>Learning Center</SideNavLink> : null}
      {phases.map((phase) => (
        <SideNavLink key={phase.id} href={phase.href}>
          {phase.name}
        </SideNavLink>
      ))}
      {recordingsHref || messagesHref ? <div className="my-2 border-t border-border" /> : null}
      {recordingsHref ? <SideNavLink href={recordingsHref}>Recordings</SideNavLink> : null}
      {messagesHref ? <SideNavLink href={messagesHref}>Messages</SideNavLink> : null}
    </nav>
  );
}
