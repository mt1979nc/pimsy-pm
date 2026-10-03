import { hubSpotOpenLabel, type HubSpotDealSummary, type ParsedHubSpotDeal } from "@/lib/hubspot";
import { formatHubSpotDateLabel } from "@/lib/hubspot-map";
import { PullFromHubSpotForm } from "@/components/pull-from-hubspot";

export function AboutHubSpotPanel({
  summary,
  projectId,
  pullEnabled = false,
}: {
  summary: HubSpotDealSummary;
  projectId?: string;
  pullEnabled?: boolean;
}) {
  const deal = summary.deal;
  const closeLabel = formatHubSpotDateLabel(summary.closeDate);
  const canPull = Boolean(pullEnabled && projectId && deal?.dealId);

  if (!deal && !summary.error) {
    return (
      <p className="px-5 pb-4 text-[13px] text-ink-3">
        No HubSpot deal linked. Paste the deal URL in Edit site profile. The portal never sees
        this.
      </p>
    );
  }

  return (
    <div className="space-y-2 px-5 pb-4">
      {summary.error ? <p className="text-[12.5px] text-amber">{summary.error}</p> : null}
      {summary.pulled ? (
        <div>
          <div className="text-[11.5px] uppercase tracking-wide text-ink-3">HubSpot deal</div>
          {summary.name ? (
            <div className="mt-0.5 text-[14px] font-medium text-ink">{summary.name}</div>
          ) : null}
          {summary.stage ? <div className="text-[12.5px] text-ink-3">Stage: {summary.stage}</div> : null}
          {closeLabel ? <div className="text-[12.5px] text-ink-3">Close date: {closeLabel}</div> : null}
        </div>
      ) : deal?.dealId && !summary.error && !pullEnabled ? (
        <p className="text-[12.5px] text-ink-3">
          Link saved. Empty contract date and expected ARR fill when a token is set.
        </p>
      ) : null}
      {deal ? <HubSpotOpenLink deal={deal} /> : null}
      {canPull && projectId ? <PullFromHubSpotForm projectId={projectId} /> : null}
    </div>
  );
}

export function HubSpotOpenLink({ deal }: { deal: ParsedHubSpotDeal }) {
  return (
    <a
      href={deal.href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block text-[14px] font-medium text-brand hover:underline"
    >
      {hubSpotOpenLabel(deal)}
    </a>
  );
}
