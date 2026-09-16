import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/guard";
import { portalAbout } from "@/lib/portal";
import { PortalAboutView } from "@/components/portal-about-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "About" };

export default async function PortalAboutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireCustomer();
  const payload = await portalAbout(actor, id);
  if (!payload) notFound();

  return <PortalAboutView payload={payload} projectId={id} staffPreview={false} />;
}
