import { redirect } from "next/navigation";
import { signIn, getActor } from "@/auth";
import { env } from "@/lib/env";
import { isCustomer } from "@/lib/authz";
import { Card, Button, Field, inputClass } from "@/components/ui";
import { APP_VERSION } from "@/lib/version";
import { PasswordSignInForm } from "./password-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const actor = await getActor();
  if (actor) redirect(isCustomer(actor) ? "/portal" : "/dashboard");

  const { error, callbackUrl } = await searchParams;
  const googleEnabled = Boolean(env.GOOGLE_ID && env.GOOGLE_SECRET);

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
            PIMSY Implementations
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-2">
            Sign in to your implementation workspace.
          </p>
        </div>

        <Card className="p-5">
          {error ? (
            <p className="mb-4 rounded-lg border border-transparent bg-red-soft px-3 py-2 text-[13px] text-red">
              {error === "AccessDenied"
                ? "That email address isn't set up for access yet. Ask your implementation specialist to invite you."
                : "Something went wrong signing you in. Please try again."}
            </p>
          ) : null}

          <form
            action={async (formData: FormData) => {
              "use server";
              const email = String(formData.get("email") ?? "")
                .trim()
                .toLowerCase();
              await signIn("resend", {
                email,
                redirectTo: callbackUrl ?? "/",
              });
            }}
            className="space-y-3"
          >
            <Field label="Work email" htmlFor="email">
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@practice.com"
                className={inputClass}
              />
            </Field>
            <Button type="submit" variant="primary" className="w-full">
              Email me a sign-in link
            </Button>
          </form>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11.5px] uppercase tracking-wide text-ink-3">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <PasswordSignInForm />

          {googleEnabled ? (
            <>
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11.5px] uppercase tracking-wide text-ink-3">
                  Staff
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <form
                action={async () => {
                  "use server";
                  await signIn("google", { redirectTo: callbackUrl ?? "/" });
                }}
              >
                <Button type="submit" className="w-full">
                  Continue with Google
                </Button>
              </form>
            </>
          ) : null}
        </Card>

        <p className="mt-5 text-center text-[12px] leading-relaxed text-ink-3">
          This workspace is for implementation logistics only.
          <br />
          Never post patient information here.
        </p>

        <p className="mt-3 text-center font-mono text-[11px] text-ink-3/70">
          v{APP_VERSION}
        </p>
      </div>
    </main>
  );
}
