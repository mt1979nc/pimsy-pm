import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/guard";
import { assertProjectAccess, ForbiddenError, NotFoundError } from "@/lib/authz";
import { previewPortalAbout } from "@/lib/portal-preview";
import { PortalAboutView } from "@/components/portal-about-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer view · About" };

export default async function CustomerViewAboutPage({
  params,
}: {
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

  const payload = await previewPortalAbout(id);
  if (!payload) notFound();

  return <PortalAboutView payload={payload} projectId={id} staffPreview />;
}
