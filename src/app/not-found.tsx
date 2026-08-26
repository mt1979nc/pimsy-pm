import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="max-w-[420px] text-center">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">404</p>
        <h1 className="mt-2 text-[20px] font-semibold tracking-tight text-ink">
          We couldn&apos;t find that
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
          It may have been archived, or you may not have access to it.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex h-9 items-center rounded-lg bg-brand px-4 text-[13.5px] font-medium text-brand-ink hover:opacity-90"
        >
          Back to your workspace
        </Link>
      </div>
    </main>
  );
}
