import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { Avatar } from "@/components/ui";

/**
 * Navy utility strip echoing the PIMSY EHR top bar: search, alerts, profile.
 * The accordion sidebar is the section menu, including on a narrow window.
 */
export function StaffUtilityBar({
  name,
  email,
  role,
  unread,
}: {
  name: string | null;
  email: string;
  role: string;
  unread: number;
}) {
  const label = name ?? email;
  const alertLabel = unread > 0 ? `Alerts, ${unread} unread` : "Alerts";

  return (
    <header className="sticky top-0 z-30 border-b border-[#0d2f4f] bg-[#113c64] text-white">
      <div className="flex min-h-12 flex-wrap items-center gap-2 px-3 py-1.5 sm:gap-3 sm:px-4">
        <form action="/projects" role="search" className="min-w-[8rem] flex-1">
          <label htmlFor="staff-site-search" className="sr-only">
            Search sites
          </label>
          <input
            id="staff-site-search"
            name="q"
            type="search"
            placeholder="Search sites"
            className="h-8 w-full max-w-md rounded-md border border-white/25 bg-white/10 px-2.5 text-[13px] text-white placeholder:text-white/70 focus:border-white focus:bg-white focus:text-[#14181d] focus:placeholder:text-[#5a6572] focus:outline-none"
          />
        </form>
        <Link
          href="/inbox"
          aria-label={alertLabel}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-white hover:bg-white/10"
        >
          <BellIcon />
          <span className="hidden sm:inline">Alerts</span>
          {unread > 0 ? (
            <span className="rounded-full bg-ehr-gold px-1.5 text-[11px] font-semibold leading-4 text-[#113c64]">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Link>
        <Link
          href="/settings"
          aria-label={`Profile, ${label}`}
          title={role.toLowerCase()}
          className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-1.5 hover:bg-white/10"
        >
          <Avatar name={label} size={24} className="ring-1 ring-white/50" />
          <span className="hidden max-w-[10rem] truncate text-[13px] font-medium sm:inline">{label}</span>
        </Link>
        <SignOutButton className="w-auto shrink-0 rounded-md px-2 py-1 text-white/90 hover:bg-white/10 hover:text-white" />
      </div>
    </header>
  );
}

function BellIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  );
}
