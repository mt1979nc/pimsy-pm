import { Card, LinkButton } from "@/components/ui";

export const metadata = { title: "Sign-in problem" };

const MESSAGES: Record<string, string> = {
  AccessDenied:
    "That email address isn't set up for access. Your implementation specialist needs to invite you before you can sign in.",
  Verification:
    "That sign-in link has already been used or has expired. Request a new one below.",
  Configuration:
    "The sign-in service isn't configured correctly. Please contact your administrator.",
};

export default async function SignInErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message =
    (error && MESSAGES[error]) ?? "Something went wrong signing you in. Please try again.";

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-12">
      <Card className="w-full max-w-[400px] p-7 text-center">
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-red-soft text-red">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5M12 16h.01" />
          </svg>
        </div>
        <h1 className="text-[17px] font-semibold tracking-tight text-ink">Can&apos;t sign in</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{message}</p>
        <LinkButton href="/signin" variant="primary" className="mt-5 w-full">
          Try again
        </LinkButton>
      </Card>
    </main>
  );
}
