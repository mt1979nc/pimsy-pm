import { redirect } from "next/navigation";
import Link from "next/link";
import { getActor } from "@/auth";
import { NotFoundError, isCustomer } from "@/lib/authz";
import { parseGoQuery, isSafeAppPath } from "@/lib/path-deep-links";
import { resolvePathDeepLink, type ResolvedPathDeepLink } from "@/lib/path-deep-link-resolve";
import { PRODUCT_NAME, PRODUCT_EXPANSION } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: `Open in ${PRODUCT_NAME}` };

type Search = Record<string, string | string[] | undefined>;

function goCallbackPath(searchParams: Search): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string" && value) params.set(key, value);
    else if (Array.isArray(value) && value[0]) params.set(key, value[0]);
  }
  const qs = params.toString();
  return qs ? `/go?${qs}` : "/go";
}

export default async function GoPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const raw = await searchParams;
  const callback = goCallbackPath(raw);
  const actor = await getActor();

  if (!actor) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(callback)}`);
  }
  if (actor.mustChangePassword) {
    redirect("/change-password");
  }

  const query = parseGoQuery(raw);
  let resolved: ResolvedPathDeepLink;
  try {
    resolved = await resolvePathDeepLink(actor, query);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return <GoMiss home={isCustomer(actor) ? "/portal" : "/dashboard"} />;
    }
    throw err;
  }
  const destPath = resolved.path;
  const destWithoutHash = destPath.split("#")[0] ?? destPath;
  if (!isSafeAppPath(destWithoutHash)) {
    redirect(isCustomer(actor) ? "/portal" : "/dashboard");
  }
  redirect(destPath);
}

function GoMiss({ home }: { home: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-[420px] text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/pimsy-icon-color.png" alt="" className="mx-auto mb-3 size-11" />
        <h1 className="text-[19px] font-semibold tracking-tight text-ink">{PRODUCT_NAME}</h1>
        <p className="mt-1 text-[13.5px] text-ink-2">{PRODUCT_EXPANSION}</p>
        <p className="mt-5 text-[14px] leading-relaxed text-ink-2">
          That link does not open a workspace item you can view. It may have been copied
          incompletely, or it points at a staff-only step.
        </p>
        <p className="mt-3 text-[13px] text-ink-3">Nothing here includes patient information.</p>
        <Link href={home} className="mt-6 inline-block text-[14px] font-medium text-brand hover:underline">
          Back to {PRODUCT_NAME}
        </Link>
      </div>
    </main>
  );
}
