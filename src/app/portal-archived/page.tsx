import Link from "next/link";

export const metadata = { title: "Portal archived" };

/**
 * Customer home while /portal is archived. The portal routes themselves 404.
 * This page only explains that, so sign-in does not land on a blank error.
 */
export default function PortalArchivedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="max-w-[420px] text-center">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">PATH</p>
        <h1 className="mt-2 text-[20px] font-semibold tracking-tight text-ink">
          The customer portal is archived
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
          Delivery stays in Dock. This PATH portal is hidden until someone turns
          PATH_ARCHIVED_MODULES back on. Nothing was deleted.
        </p>
        <Link
          href="/signin"
          className="mt-5 inline-flex h-9 items-center rounded-lg bg-brand px-4 text-[13.5px] font-medium text-brand-ink hover:opacity-90"
        >
          Staff sign in
        </Link>
      </div>
    </main>
  );
}
