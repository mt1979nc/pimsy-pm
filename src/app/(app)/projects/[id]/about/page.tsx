import { notFound } from "next/navigation";
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

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Kickoff & site"
          subtitle="Same kickoff dates, booking, and CRM acronym the portal About shows."
        />
        <AboutKickoffPanel
          kickoffDate={project.startDate}
          goLiveDate={project.targetGoLiveDate}
          zoomBookingUrl={project.zoomBookingUrl}
          crmAcronym={project.crmAcronym}
          kickoff={kickoff}
          projectId={project.id}
          staffLinks
        />
      </Card>

      <Card>
        <CardHeader
          title="HubSpot"
          subtitle="Pull when a private-app token is set; otherwise a clear outbound deal link."
        />
        <AboutHubSpotPanel summary={hubspot} />
      </Card>

      <Card>
        <CardHeader
          title="Implementation team"
          subtitle="Playbook staffing roles plus people assigned on Kickoff tasks"
        />
        <div className="p-5 pt-0">
          <AboutContactCardGrid
            cards={implementationTeam}
            showEmail
            empty="Assign staffing roles on New project, or add members on Settings. Kickoff task assignees also appear here."
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Practice contacts"
          subtitle="Live from the customer account — cards update when a contact is invited or edited"
        />
        <div className="p-5 pt-0">
          <AboutContactCardGrid
            cards={customerContacts}
            showEmail
            empty="Invite a practice contact on the customer page or project Settings."
          />
        </div>
      </Card>

      {extras.length > 0 ? (
        <Card>
          <CardHeader
            title="Extra fields"
            subtitle="Keys that duplicate HubSpot, CRM, Zoom, or Prism are not stored."
          />
          <dl className="divide-y divide-border text-[13px]">
            {extras.map((row) => (
              <div key={row.key} className="flex justify-between gap-3 px-5 py-2">
                <dt className="shrink-0 text-ink-3">{row.key}</dt>
                <dd className="truncate text-right text-ink">{row.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Edit site profile"
          subtitle="Staff only. HubSpot, Prism, and CRM key never appear on the customer portal."
        />
        <ProjectAboutForm
          project={{
            id: project.id,
            hubspotDealUrl: project.hubspotDealUrl,
            prismClientId: project.prismClientId,
            crmAcronym: project.crmAcronym,
            crmKey: project.crmKey,
            zoomBookingUrl: project.zoomBookingUrl,
            aboutNotes: project.aboutNotes,
            customFields: project.customFields ?? {},
            onboarded: project.onboarded,
          }}
        />
      </Card>
    </div>
  );
}
