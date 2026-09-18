import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/guard";
import { assertProjectAccess, ForbiddenError, NotFoundError } from "@/lib/authz";
import { previewPortalAbout, previewPortalRecordings } from "@/lib/portal-preview";
import { PortalAboutView } from "@/components/portal-about-view";
import { extraKickoffFacts } from "@/lib/kickoff-about";

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
  const recordings = await previewPortalRecordings(id);
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
      recordings: recordings.map((r) => ({
        name: r.title,
        url: r.url,
        visibility: r.visibility,
      })),
    },
    "portal",
  );

  return (
    <PortalAboutView payload={payload} projectId={id} staffPreview extraFacts={extraFacts} />
  );
}
