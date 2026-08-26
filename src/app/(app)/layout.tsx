import Link from "next/link";
import { requireStaff } from "@/lib/guard";
import { canSeePortfolio, canManageTemplates } from "@/lib/authz";
import { unreadThreadCount } from "@/lib/threads";
import { NavLink } from "@/components/nav-link";
import { SignOutButton } from "@/components/sign-out-button";
import { Avatar } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireStaff();
  const unread = await unreadThreadCount(actor);

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="sticky top-0 hidden h-screen w-[228px] shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex items-center gap-2.5 px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/pimsy-icon-color.png" alt="" className="size-7 shrink-0" />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold leading-tight text-ink">
              Implementations
            </div>
            <div className="truncate text-[11.5px] leading-tight text-ink-3">PIMSY EHR</div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-2">
          <NavLink href="/dashboard">Dashboard</NavLink>
          <NavLink href="/my-work">My work</NavLink>
          <NavLink href="/inbox" badge={unread}>
            Inbox
          </NavLink>

          <div className="px-2.5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            Delivery
          </div>
          <NavLink href="/projects">Projects</NavLink>
          <NavLink href="/customers">Customers</NavLink>

          {canSeePortfolio(actor) ? (
            <>
              <div className="px-2.5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                Leadership
              </div>
              <NavLink href="/admin">Management</NavLink>
              <NavLink href="/reports">Portfolio</NavLink>
              <NavLink href="/reports/capacity">Team capacity</NavLink>
              <NavLink href="/reports/analysis">Analysis</NavLink>
            </>
          ) : null}

          <div className="px-2.5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            Setup
          </div>
          {canManageTemplates(actor) ? <NavLink href="/templates">Templates</NavLink> : null}
          <NavLink href="/settings">Settings</NavLink>
        </nav>

        <div className="border-t border-border p-2.5">
          <Link
            href="/settings"
            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2"
          >
            <Avatar name={actor.name ?? actor.email} size={26} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-medium leading-tight text-ink">
                {actor.name ?? actor.email}
              </div>
              <div className="truncate text-[11.5px] leading-tight capitalize text-ink-3">
                {actor.role.toLowerCase()}
              </div>
            </div>
          </Link>
          <SignOutButton />
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-20 flex items-center gap-3 border-b border-border bg-surface px-4 py-2.5 md:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/pimsy-icon-color.png" alt="" className="size-6 shrink-0" />
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto text-[13px]">
          <NavLink href="/dashboard">Home</NavLink>
          <NavLink href="/projects">Projects</NavLink>
          <NavLink href="/inbox" badge={unread}>
            Inbox
          </NavLink>
          <NavLink href="/my-work">Mine</NavLink>
        </nav>
      </div>

      <main className="min-w-0 flex-1 px-4 pb-16 pt-16 sm:px-6 md:pt-7 lg:px-8">
        <div className="mx-auto max-w-[1180px]">{children}</div>
      </main>
    </div>
  );
}
