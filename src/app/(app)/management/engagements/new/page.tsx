import Link from "next/link";
import { Card, CardHeader } from "@/components/ui";
import { listLeadOptions } from "@/actions/management-engagements";
import { EngagementCreateForm } from "../../_components/engagement-create-form";
import { loadCapacityForecast, loadRosterGoLiveContext } from "@/lib/forecast-data";
import { leadLoadsFromForecast } from "@/lib/lead-headroom";
import { currentPathConfig } from "@/lib/path-config-store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add engagement — Prism" };

export default async function NewEngagementPage() {
  const [leadOptions, goLive, forecast] = await Promise.all([
    listLeadOptions(),
    loadRosterGoLiveContext(),
    loadCapacityForecast(26),
  ]);
  const loads = leadLoadsFromForecast({
    weeks: forecast.weeks,
    staff: forecast.staff,
    allowedIds: new Set(leadOptions.map((person) => person.id)),
  });
  const defaultLeadId = leadOptions.find((u) => u.isDirector)?.id ?? leadOptions[0]?.id ?? "";

  return (
    <div className="space-y-3">
      <Link href="/management/engagements" className="text-[13px] font-medium text-brand hover:underline">
        ← Roster
      </Link>
      <Card>
        <CardHeader
          title="Forecast+"
          subtitle="Flip the scope options to project a go-live. The lead with the most room is suggested. Add to roster saves the client."
        />
        <EngagementCreateForm
          leadOptions={leadOptions}
          defaultLeadId={defaultLeadId}
          durationSamples={goLive.samples}
          exclusions={goLive.exclusions}
          estimator={currentPathConfig().estimator}
          statuses={currentPathConfig().statuses}
          leadLoads={loads.candidates}
          weekStarts={loads.weekStarts}
        />
      </Card>
    </div>
  );
}
