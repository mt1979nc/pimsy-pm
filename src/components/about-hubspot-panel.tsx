import { hubSpotOpenLabel, type HubSpotDealSummary, type ParsedHubSpotDeal } from "@/lib/hubspot";

export function AboutHubSpotPanel({ summary }: { summary: HubSpotDealSummary }) {
  const deal = summary.deal;
  if (!deal && !summary.error) {
    return (
      <p className="px-5 pb-4 text-[13px] text-ink-3">
        No HubSpot deal linked. Paste the deal URL in the form — PATH stores a clear outbound
        link. Optional pull needs <code className="font-mono text-[12px]">HUBSPOT_ACCESS_TOKEN</code>{" "}
        (private app). The portal never sees this.
      </p>
    );
  }

  return (
    <div className="space-y-2 px-5 pb-4">
      {summary.error ? <p className="text-[12.5px] text-amber">{summary.error}</p> : null}
      {summary.pulled && summary.name ? (
        <div>
          <div className="text-[11.5px] uppercase tracking-wide text-ink-3">HubSpot deal</div>
          <div className="mt-0.5 text-[14px] font-medium text-ink">{summary.name}</div>
          {summary.stage ? <div className="text-[12.5px] text-ink-3">Stage: {summary.stage}</div> : null}
        </div>
      ) : null}
      {deal ? <HubSpotOpenLink deal={deal} /> : null}
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
