import Link from "next/link";
import { Card, CardHeader, LinkButton } from "@/components/ui";
import { listLeadOptions } from "@/actions/management-engagements";
import { EngagementCreateForm } from "../../_components/engagement-create-form";
import { loadRosterGoLiveContext } from "@/lib/forecast-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add engagement — Prism" };

export default async function NewEngagementPage() {
  const [leadOptions, goLive] = await Promise.all([listLeadOptions(), loadRosterGoLiveContext()]);
  const defaultLeadId = leadOptions.find((u) => u.isDirector)?.id ?? leadOptions[0]?.id ?? "";

  return (
    <div className="space-y-3">
      <Link href="/management/engagements" className="text-[13px] font-medium text-brand hover:underline">
        ← Engagements
      </Link>
      <Card>
        <CardHeader
          title="Add to roster"
          subtitle="Forecast+ projects go-live from past completed sites (optimistic / typical / pessimistic). Saves to PATH Postgres and updates weekly load. No playbook until you create a project from a template."
          action={
            <LinkButton href="/projects/new" size="sm" variant="secondary">
              Full project with playbook
            </LinkButton>
          }
        />
        <EngagementCreateForm
          leadOptions={leadOptions}
          defaultLeadId={defaultLeadId}
          durationSamples={goLive.samples}
          exclusions={goLive.exclusions}
        />
      </Card>
    </div>
  );
}
