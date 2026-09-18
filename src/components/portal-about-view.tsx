import { Card, CardHeader, EmptyState } from "@/components/ui";
import { AboutContactCardGrid } from "@/components/about-contact-card";
import { AboutKickoffPanel } from "@/components/about-kickoff-panel";
import { KickoffFacts } from "@/components/kickoff-facts";
import type { KickoffFact } from "@/lib/kickoff-about";
import { portalAboutHasContent, type PortalAboutPayload } from "@/lib/about-profile";

export function PortalAboutView({
  payload,
  projectId,
  staffPreview,
  extraFacts = [],
}: {
  payload: PortalAboutPayload;
  projectId: string;
  staffPreview: boolean;
  extraFacts?: KickoffFact[];
}) {
  if (!portalAboutHasContent(payload) && extraFacts.length === 0) {
    return (
      <Card>
        <CardHeader
          title="About"
          subtitle={staffPreview ? "Customer-facing" : undefined}
        />
        <EmptyState
          title="Nothing here yet"
          description={staffPreview ? undefined : "Your specialist will add notes and contacts."}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="About" />
        <AboutKickoffPanel
          kickoffDate={payload.kickoffDate}
          goLiveDate={payload.goLiveDate}
          zoomBookingUrl={payload.zoomBookingUrl}
          crmAcronym={payload.crmAcronym}
          liveSiteUrl={payload.liveSiteUrl}
          kickoff={payload.kickoff}
          projectId={projectId}
          staffLinks={false}
          bookingUrls={payload.bookingUrls}
          specialistName={payload.implementationTeam[0]?.name}
          hasRcm={payload.hasRcm}
        />
        {extraFacts.length > 0 ? (
          <div className="border-t border-border px-5 py-4">
            <KickoffFacts facts={extraFacts} />
          </div>
        ) : null}
        {payload.aboutNotes ? (
          <div className="border-t border-border px-5 py-4">
            <div className="text-[11.5px] uppercase tracking-wide text-ink-3">Notes</div>
            <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">
              {payload.aboutNotes}
            </p>
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Implementation team" />
        <div className="p-5 pt-0">
          <AboutContactCardGrid
            cards={payload.implementationTeam}
            showEmail
            empty="No implementation team listed yet."
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Practice contacts" />
        <div className="p-5 pt-0">
          <AboutContactCardGrid
            cards={payload.customerContacts}
            showEmail
            empty="No practice contacts on this project yet."
          />
        </div>
      </Card>
    </div>
  );
}
