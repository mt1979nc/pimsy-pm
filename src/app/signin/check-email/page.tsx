import { Card, LinkButton } from "@/components/ui";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  // With no email service configured there is no inbox to check, so say what
  // actually happened instead of sending someone to hunt through their mail.
  if (!env.EMAIL_ENABLED) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-12">
        <Card className="w-full max-w-[520px] p-7">
          <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-amber-soft text-amber">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
          </div>

          <h1 className="text-[18px] font-semibold tracking-tight text-ink">
            No email was sent — and that&apos;s expected
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
            This copy has no email service configured, so your sign-in link was written
            to a file instead. Nothing will arrive in your inbox.
          </p>

          <div className="mt-5 rounded-lg border border-border bg-surface-2 p-4">
            <p className="text-[13px] font-semibold text-ink">Your link is here:</p>
            <p className="mt-1.5 font-mono text-[13px] text-brand">SIGN-IN-LINK.txt</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
              In the project folder — the same folder as <code>START-HERE.bat</code>.
              Open it and click the link inside.
            </p>
          </div>

          <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">
            The link is also printed in the terminal window running the app, between
            two lines of <code>═</code> characters. It works once and expires in 24
            hours.
          </p>

          <LinkButton href="/signin" className="mt-5 w-full">
            Back to sign in
          </LinkButton>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-12">
      <Card className="w-full max-w-[400px] p-7 text-center">
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-brand-soft text-brand">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2.5" y="5" width="19" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
        </div>
        <h1 className="text-[17px] font-semibold tracking-tight text-ink">Check your email</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
          We sent you a sign-in link. It works once and expires in 24 hours. If it doesn&apos;t
          arrive within a few minutes, check your spam folder.
        </p>
        <LinkButton href="/signin" className="mt-5 w-full">
          Back to sign in
        </LinkButton>
      </Card>
    </main>
  );
}
