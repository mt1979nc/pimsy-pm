"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function NavLink({
  href,
  children,
  badge,
  exact = false,
}: {
  href: string;
  children: React.ReactNode;
  badge?: number;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] font-medium transition-colors",
        active ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
      )}
    >
      <span className="flex-1 truncate">{children}</span>
      {badge && badge > 0 ? (
        <span className="rounded-full bg-brand px-1.5 py-0.5 text-[11px] font-semibold leading-none text-brand-ink">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

export function SubNavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "-mb-px border-b-2 px-1 pb-2.5 pt-1 text-[13.5px] font-medium transition-colors",
        active
          ? "border-brand text-ink"
          : "border-transparent text-ink-3 hover:border-border-strong hover:text-ink-2",
      )}
    >
      {children}
    </Link>
  );
}
