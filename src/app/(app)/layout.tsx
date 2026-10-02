import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/guard";
import { canSeePortfolio, canManageTemplates } from "@/lib/authz";
import { unreadThreadCount } from "@/lib/threads";
import { StaffSidebar } from "@/components/staff-sidebar";
import { StaffUtilityBar } from "@/components/staff-utility-bar";
import { APP_VERSION } from "@/lib/version";
import { PRODUCT_EXPANSION, PRODUCT_NAME } from "@/lib/brand";
import { staffSidebarSections } from "@/lib/staff-sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireStaff();
  if (actor.mustChangePassword) redirect("/change-password");
  const unread = await unreadThreadCount(actor);
  const showPortfolio = canSeePortfolio(actor);

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

        <StaffSidebar
          sections={staffSidebarSections({
            unread,
            showPortfolio,
            showTemplates: canManageTemplates(actor),
          })}
        />

        <div className="border-t border-border p-2.5">
          <p className="px-2 py-1 text-[11.5px] text-ink-3">v{APP_VERSION}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <StaffUtilityBar
          name={actor.name}
          email={actor.email}
          role={actor.role}
          unread={unread}
          showWeekly={showPortfolio}
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
