import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/ui";
import { ResetPasswordForm } from "./form";

export const metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-7 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/pimsy-icon-color.png"
            alt="PIMSY"
            className="mx-auto mb-3 size-11"
          />
          <h1 className="text-[19px] font-semibold tracking-tight text-ink">
            Choose a new password
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-2">
            This link works once and expires an hour after it was requested.
          </p>
        </div>

        <Card className="p-5">
          <Suspense fallback={null}>
            <ResetPasswordForm />
          </Suspense>
        </Card>

        <p className="mt-5 text-center text-[12.5px] text-ink-3">
          <Link href="/signin" className="text-brand hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
