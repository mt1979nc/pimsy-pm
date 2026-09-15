import Link from "next/link";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/templates", label: "Playbooks", match: (path: string) => path === "/templates" || path.startsWith("/templates/") },
  { href: "/library", label: "File library", match: (path: string) => path === "/library" || path.startsWith("/library/") },
  { href: "/learning", label: "Learning Center", match: (path: string) => path === "/learning" || path.startsWith("/learning/") },
  { href: "/projects/new", label: "New project", match: (path: string) => path === "/projects/new" },
] as const;

/** Owner/admin strip for the template area (playbooks, library, Learning Center). */
export function TemplateHubNav({ current }: { current: string }) {
  return (
    <nav
      aria-label="Template area"
      className="mb-5 flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1"
    >
      {LINKS.map((link) => {
        const active = link.match(current);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[12.5px] font-medium",
              active ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
