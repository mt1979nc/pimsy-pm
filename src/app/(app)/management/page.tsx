import Link from "next/link";
import { Card, CardHeader, LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Staffing" };

export default function ManagementHubPage() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader
          title="Team roster"
          subtitle="Billable hrs/week, capacity-exempt, can-lead, director."
        />
        <p className="px-4 pb-4 text-[13px] text-ink-3">
          Editable team flags and capacity. Capacity-exempt people still show personal load but are
          excluded from department headroom math. Specialists never see this surface.
        </p>
        <div className="px-4 pb-4">
          <LinkButton href="/management/team">Open team</LinkButton>
        </div>
      </Card>
      <Card>
        <CardHeader
          title="Engagement roster"
          subtitle="Prism-parity edit: owners, split, scope, dates, status."
        />
        <p className="px-4 pb-4 text-[13px] text-ink-3">
          Manual engagement edits land in PM Postgres (not Prism Azure SQL). Pipeline / pre-kickoff /
          active map onto project + customer status.
        </p>
        <div className="px-4 pb-4">
          <LinkButton href="/management/engagements">Open engagements</LinkButton>
        </div>
      </Card>
      <Card className="md:col-span-2">
        <CardHeader
          title="Read-only capacity"
          subtitle="Existing task-hour report until v1.9 phase model."
        />
        <p className="px-4 pb-3 text-[13px] text-ink-3">
          Load is task-estimate based until v1.9. Edit billable hours and flags under Team; this
          report remains the depth view.
        </p>
        <div className="px-4 pb-4">
          <Link href="/reports/capacity" className="text-[13px] font-medium text-brand hover:underline">
            Team capacity report →
          </Link>
        </div>
      </Card>
    </div>
  );
}
