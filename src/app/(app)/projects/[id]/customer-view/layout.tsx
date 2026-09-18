import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/guard";
import { assertProjectAccess, ForbiddenError, NotFoundError } from "@/lib/authz";
import { previewPortalPhaseTabs, previewPortalProject } from "@/lib/portal-preview";
import { CustomerAreaNav } from "@/components/customer-area-nav";

export const dynamic = "force-dynamic";

export default async function CustomerViewLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireStaff();
  try {
    await assertProjectAccess(actor, id);
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ForbiddenError) notFound();
    throw err;
  }

  const [project, phaseTabs] = await Promise.all([
    previewPortalProject(id),
    previewPortalPhaseTabs(id),
  ]);

  if (!project) notFound();

  const base = `/projects/${id}/customer-view`;

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <aside className="w-full shrink-0 lg:sticky lg:top-4 lg:w-[220px]">
        <CustomerAreaNav
          overviewHref={base}
          aboutHref={`${base}/about`}
          phases={phaseTabs.map((p) => ({
            id: p.id,
            name: p.name,
            href: `${base}/phases/${p.id}`,
          }))}
          recordingsHref={`${base}/recordings`}
          messagesHref={`/projects/${id}/messages`}
        />
        <p className="mt-3 px-1 text-[11.5px] text-ink-3">
          Same tabs the customer can open.{" "}
          <Link href={`/projects/${id}/tasks`} className="text-brand hover:underline">
            Expose or hide
          </Link>
        </p>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
