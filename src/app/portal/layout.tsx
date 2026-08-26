import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customerAccounts } from "@/db/schema";
import { requireCustomer } from "@/lib/guard";
import { unreadThreadCount } from "@/lib/threads";
import { SignOutButton } from "@/components/sign-out-button";
import { Avatar } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Your workspace", template: "%s · PIMSY" } };

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireCustomer();
  const [account, unread] = await Promise.all([
    db.query.customerAccounts.findFirst({
      where: eq(customerAccounts.id, actor.customerAccountId),
      columns: { id: true, name: true },
    }),
    unreadThreadCount(actor),
  ]);

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1000px] items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/portal" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/pimsy-icon-color.png" alt="" className="size-7 shrink-0" />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold leading-tight text-ink">
                {account?.name ?? "Your workspace"}
              </div>
              <div className="truncate text-[11.5px] leading-tight text-ink-3">
                PIMSY implementation
              </div>
            </div>
          </Link>

          <div className="flex-1" />

          {unread > 0 ? (
            <span className="rounded-full bg-brand px-2 py-0.5 text-[11.5px] font-semibold text-brand-ink">
              {unread} new
            </span>
          ) : null}

          <Link
            href="/portal/settings"
            className="text-[12.5px] font-medium text-ink-2 hover:text-brand"
          >
            Settings
          </Link>

          <div className="flex items-center gap-2.5">
            <Avatar name={actor.name ?? actor.email} size={26} />
            <div className="hidden sm:block">
              <div className="text-[12.5px] font-medium leading-tight text-ink">
                {actor.name ?? actor.email}
              </div>
              <SignOutButton />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1000px] px-4 py-7 sm:px-6">{children}</main>

      <footer className="mx-auto max-w-[1000px] px-4 pb-10 sm:px-6">
        <p className="border-t border-border pt-4 text-[12px] leading-relaxed text-ink-3">
          This workspace covers your PIMSY implementation only. Please don&apos;t post patient
          information here — if you need to send clinical detail, ask your implementation
          specialist for the secure channel.
        </p>
      </footer>
    </div>
  );
}
