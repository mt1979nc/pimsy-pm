"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { isNavLinkActive } from "@/lib/nav";

export function NavLink({
  href,
  children,
  badge,
  exact = false,
  tone = "default",
}: {
  href: string;
  children: React.ReactNode;
  badge?: number;
  exact?: boolean;
  /** `inverse` is for the navy utility bar, where the page background is dark. */
  tone?: "default" | "inverse";
}) {
  const pathname = usePathname();
  const active = isNavLinkActive(pathname, href, exact);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
        tone === "inverse"
          ? active
            ? "bg-white/15 text-white shadow-[inset_3px_0_0_#ffe28e]"
            : "text-white/80 hover:bg-white/10 hover:text-white"
          : active
            ? "bg-brand-soft text-brand shadow-[inset_3px_0_0_var(--color-ehr-slate)]"
            : "text-ink-2 hover:bg-surface-2 hover:text-ink",
      )}
    >
      <span className="flex-1 truncate">{children}</span>
      {badge && badge > 0 ? (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none",
            tone === "inverse" ? "bg-ehr-gold text-[#113c64]" : "bg-brand text-brand-ink",
          )}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

export function SubNavLink({
  href,
  children,
  match = "exact",
}: {
  href: string;
  children: React.ReactNode;
  match?: "exact" | "prefix";
}) {
  const pathname = usePathname();
  const active = match === "prefix" ? isNavLinkActive(pathname, href) : pathname === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "-mb-px border-b-2 px-1 pb-2 pt-1 text-[13px] font-medium transition-colors",
        active
          ? "border-brand text-ink"
          : "border-transparent text-ink-3 hover:border-border-strong hover:text-ink-2",
      )}
    >
      {children}
    </Link>
  );
}

export function SideNavLink({ href, children, count }: { href: string; children: React.ReactNode; count?: number }) {
  const pathname = usePathname();
  const isActive = pathname === href;
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
        isActive ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
      )}
    >
      <span className="min-w-0 truncate">{children}</span>
      {typeof count === "number" ? (
        <span className={cn("shrink-0 tabular-nums text-[11.5px]", isActive ? "text-brand" : "text-ink-3")}>
          {count}
        </span>
      ) : null}
    </Link>
  );
}
