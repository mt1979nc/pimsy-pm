import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/guard";
import { canSeePortfolio, canManageTemplates } from "@/lib/authz";
import { unreadThreadCount } from "@/lib/threads";
import { NavLink } from "@/components/nav-link";
import { StaffUtilityBar } from "@/components/staff-utility-bar";
import { APP_VERSION } from "@/lib/version";
import { PRODUCT_EXPANSION, PRODUCT_NAME, PRISM_MODULE_NAME } from "@/lib/brand";
import { ADMIN_AREA_HREF, ADMIN_AREA_LABEL, PRISM_NAV } from "@/lib/area-nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireStaff();
  if (actor.mustChangePassword) redirect("/change-password");
  const unread = await unreadThreadCount(actor);

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="sticky top-0 hidden h-screen w-[228px] shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex items-center gap-2.5 px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/pimsy-icon-color.png" alt="" className="size-7 shrink-0" />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold leading-tight text-ink">
              {PRODUCT_NAME}
            </div>
            <div className="text-[11.5px] leading-tight text-ink-3">{PRODUCT_EXPANSION}</div>
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
              <NavLink href={ADMIN_AREA_HREF}>{ADMIN_AREA_LABEL}</NavLink>
              <NavLink href="/reports" exact>
                Portfolio
              </NavLink>
              <NavLink href="/reports/waiting-on">Waiting on</NavLink>

              <div className="px-2.5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                {PRISM_MODULE_NAME}
              </div>
              {PRISM_NAV.map((item) => (
                <NavLink key={item.href} href={item.href} exact={item.exact}>
                  {item.label}
                </NavLink>
              ))}
            </>
          ) : null}

          <div className="px-2.5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            Setup
          </div>
          {canManageTemplates(actor) ? (
            <>
              <NavLink href="/templates">Templates</NavLink>
              <NavLink href="/library">File library</NavLink>
            </>
          ) : null}
          <NavLink href="/learning">Learning Center</NavLink>
          <NavLink href="/updates">What&apos;s new</NavLink>
          <NavLink href="/settings">Settings</NavLink>
        </nav>

        <div className="border-t border-border p-2.5">
          <Link
            href="/updates"
            className="block rounded-lg px-2 py-1 text-[11.5px] text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            v{APP_VERSION} · What&apos;s new
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <StaffUtilityBar
          name={actor.name}
          email={actor.email}
          role={actor.role}
          unread={unread}
          showWeekly={canSeePortfolio(actor)}
        />
        <main className="min-w-0 flex-1 px-4 pb-16 pt-4 sm:px-6 md:pt-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1180px] has-[[data-page-width=full]]:max-w-none">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
