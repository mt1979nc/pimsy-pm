import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/guard";
import { portalAbout, portalRecordings } from "@/lib/portal";
import { PortalAboutView } from "@/components/portal-about-view";
import { extraKickoffFacts } from "@/lib/kickoff-about";

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
  const recordings = await portalRecordings(actor, id);
  const extraFacts = extraKickoffFacts(
    {
      startDate: payload.kickoffDate,
      targetGoLiveDate: payload.goLiveDate,
      zoomBookingUrl: payload.zoomBookingUrl,
      crmAcronym: payload.crmAcronym,
      aboutNotes: payload.aboutNotes,
      leadName: payload.implementationTeam[0]?.name,
      leadTitle: payload.implementationTeam[0]?.title,
      customFields: {},
      recordings,
    },
    "portal",
  );

  return (
    <PortalAboutView payload={payload} projectId={id} staffPreview={false} extraFacts={extraFacts} />
  );
}
