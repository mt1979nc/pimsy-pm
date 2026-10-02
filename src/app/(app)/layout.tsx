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
    <div className="grid min-h-screen w-full min-w-0 grid-cols-1 overflow-x-clip bg-bg lg:grid-cols-[228px_minmax(0,1fr)]">
      <aside className="row-start-2 flex max-h-[40vh] min-h-0 w-full min-w-0 flex-col overflow-hidden border-b border-border bg-surface lg:sticky lg:top-0 lg:row-span-2 lg:row-start-1 lg:h-screen lg:max-h-screen lg:w-[228px] lg:self-start lg:border-b-0 lg:border-r">
        <div className="flex shrink-0 items-center gap-2.5 px-4 py-3 lg:py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/pimsy-icon-color.png" alt="" className="size-7 shrink-0" />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold leading-tight text-ink">
              {PRODUCT_NAME}
            </div>
            <div className="line-clamp-2 text-[11.5px] leading-tight text-ink-3" title={PRODUCT_EXPANSION}>
              {PRODUCT_EXPANSION}
            </div>
          </div>
        </div>

        <StaffSidebar
          sections={staffSidebarSections({
            unread,
            showPortfolio,
            showTemplates: canManageTemplates(actor),
          })}
        />

        <div className="shrink-0 border-t border-border p-2.5">
          <p className="px-2 py-1 text-[11.5px] text-ink-3">v{APP_VERSION}</p>
        </div>
      </aside>

      <div className="row-start-1 min-w-0 lg:col-start-2">
        <StaffUtilityBar
          name={actor.name}
          email={actor.email}
          role={actor.role}
          unread={unread}
        />
      </div>
      <main className="row-start-3 min-w-0 px-4 pb-16 pt-4 sm:px-6 lg:col-start-2 lg:row-start-2 lg:pt-6 lg:px-8">
        <div className="mx-auto w-full min-w-0 max-w-[1180px] has-[[data-page-width=full]]:max-w-none">
          {children}
        </div>
      </main>
    </div>
  );
}
