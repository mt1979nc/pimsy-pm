import Link from "next/link";
import { cn } from "@/lib/cn";

export function CommentCountBadge({
  count,
  href,
  className,
}: {
  count: number;
  href?: string | null;
  className?: string;
}) {
  if (count < 1) return null;
  const label = `${count} comment${count === 1 ? "" : "s"}`;
  const body = (
    <>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {count}
    </>
  );
  const classes = cn(
    "inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11.5px] font-semibold text-[#113c64] dark:text-[#cee0e7]",
    className,
  );
  if (href) {
    return (
      <Link href={href} title={label} className={classes}>
        {body}
      </Link>
    );
  }
  return (
    <span title={label} className={classes}>
      {body}
    </span>
  );
}
