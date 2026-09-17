import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { fileAssets } from "@/db/schema";
import { requireStaff } from "@/lib/guard";
import { assertProjectAccess } from "@/lib/authz";
import { Card, CardHeader } from "@/components/ui";
import { ProjectAboutForm } from "./about-form";
import { loadProjectAbout } from "@/lib/about-query";
import { extraCustomFields } from "@/lib/about-profile";
import { loadHubSpotDealSummary } from "@/lib/hubspot-deal";
import { AboutKickoffPanel } from "@/components/about-kickoff-panel";
import { AboutHubSpotPanel } from "@/components/about-hubspot-panel";
import { AboutContactCardGrid } from "@/components/about-contact-card";
import { KickoffFacts } from "@/components/kickoff-facts";
import { extraKickoffFacts } from "@/lib/kickoff-about";
import { CollapsedSection } from "@/components/collapsed-section";

export const dynamic = "force-dynamic";
export const metadata = { title: "About" };

export default async function ProjectAboutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireStaff();
  await assertProjectAccess(actor, id);

  const loaded = await loadProjectAbout(id);
  if (!loaded) notFound();
  const { project, kickoff, implementationTeam, customerContacts } = loaded;
  const extras = extraCustomFields(project.customFields ?? {});
  const hubspot = await loadHubSpotDealSummary(project.hubspotDealUrl);
  const recordings = await db.query.fileAssets.findMany({
    where: and(eq(fileAssets.projectId, id), eq(fileAssets.isRecording, true)),
    columns: { name: true, url: true, visibility: true },
  });
  const extraFacts = extraKickoffFacts(
    {
      startDate: project.startDate,
      targetGoLiveDate: project.targetGoLiveDate,
      zoomBookingUrl: project.zoomBookingUrl,
      crmAcronym: project.crmAcronym,
      leadName: project.lead?.name,
      leadTitle: project.lead?.title,
      customFields: project.customFields ?? {},
      recordings,
    },
    "staff",
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Kickoff & site" />
        <AboutKickoffPanel
          kickoffDate={project.startDate}
          goLiveDate={project.targetGoLiveDate}
          zoomBookingUrl={project.zoomBookingUrl}
          crmAcronym={project.crmAcronym}
          kickoff={kickoff}
          projectId={project.id}
          staffLinks
          bookingUrls={project.bookingUrls}
          specialistName={project.lead?.name}
        />
        {extraFacts.length > 0 ? (
          <div className="border-t border-border px-5 py-4">
            <KickoffFacts facts={extraFacts} />
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="HubSpot" />
        <AboutHubSpotPanel summary={hubspot} />
      </Card>

      <Card>
        <CardHeader title="Implementation team" />
        <div className="p-5 pt-0">
          <AboutContactCardGrid
            cards={implementationTeam}
            showEmail
            empty="Assign roles on New project, or add members on Settings."
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Practice contacts" />
        <div className="p-5 pt-0">
          <AboutContactCardGrid
            cards={customerContacts}
            showEmail
            empty="Invite a contact on the customer page or Settings."
          />
        </div>
      </Card>

      {extras.length > 0 ? (
        <Card>
          <CollapsedSection title="Extra fields" openLabel="Show">
            <dl className="divide-y divide-border text-[13px]">
              {extras.map((row) => (
                <div key={row.key} className="flex justify-between gap-3 px-4 py-2">
                  <dt className="shrink-0 text-ink-3">{row.key}</dt>
                  <dd className="truncate text-right text-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
          </CollapsedSection>
        </Card>
      ) : null}

      <Card>
        <CollapsedSection title="Edit site profile" openLabel="Edit" closeLabel="Hide">
          <ProjectAboutForm
          project={{
            id: project.id,
            hubspotDealUrl: project.hubspotDealUrl,
            prismClientId: project.prismClientId,
            crmAcronym: project.crmAcronym,
            crmKey: project.crmKey,
            zoomBookingUrl: project.zoomBookingUrl,
            bookingUrls: project.bookingUrls ?? {},
            aboutNotes: project.aboutNotes,
            customFields: project.customFields ?? {},
            onboarded: project.onboarded,
            specialistName: project.lead?.name ?? null,
            specialistBookingUrl: project.lead?.zoomBookingUrl ?? null,
          }}
        />
        </CollapsedSection>
      </Card>
    </div>
  );
}
