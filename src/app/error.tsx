"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="max-w-[440px] text-center">
        <h1 className="text-[20px] font-semibold tracking-tight text-ink">Something went wrong</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
          The error has been logged. Try again, and if it keeps happening let your administrator
          know.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-[11.5px] text-ink-3">Reference: {error.digest}</p>
        ) : null}
        <button
          onClick={reset}
          className="mt-5 inline-flex h-9 items-center rounded-lg bg-brand px-4 text-[13.5px] font-medium text-brand-ink hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
