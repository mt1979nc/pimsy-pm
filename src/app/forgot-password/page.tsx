import Link from "next/link";
import { Card } from "@/components/ui";
import { ForgotPasswordForm } from "./form";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
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
            Reset your password
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-2">
            Enter your email and we&apos;ll send you a link. Works the same whether
            you&apos;re resetting a password or setting one for the first time.
          </p>
        </div>

        <Card className="p-5">
          <ForgotPasswordForm />
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
