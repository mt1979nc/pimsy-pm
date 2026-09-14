import Link from "next/link";
import { Card, CardHeader, LinkButton } from "@/components/ui";
import { listLeadOptions } from "@/actions/management-engagements";
import { EngagementCreateForm } from "../../_components/engagement-create-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add engagement — Staffing" };

export default async function NewEngagementPage() {
  const leadOptions = await listLeadOptions();
  const defaultLeadId = leadOptions.find((u) => u.isDirector)?.id ?? leadOptions[0]?.id ?? "";

  return (
    <div className="space-y-3">
      <Link href="/management/engagements" className="text-[13px] font-medium text-brand hover:underline">
        ← Engagements
      </Link>
      <Card>
        <CardHeader
          title="Add to roster"
          subtitle="Forecast+ scope + Prism status. Saves to PM Postgres and updates weekly load. No playbook until you create a project from a template."
          action={
            <LinkButton href="/projects/new" size="sm" variant="secondary">
              Full project with playbook
            </LinkButton>
          }
        />
        <EngagementCreateForm leadOptions={leadOptions} defaultLeadId={defaultLeadId} />
      </Card>
    </div>
  );
}
