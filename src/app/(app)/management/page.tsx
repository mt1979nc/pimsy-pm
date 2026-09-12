import Link from "next/link";
import { Card, CardHeader, LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Staffing" };

export default function ManagementHubPage() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="md:col-span-2">
        <CardHeader
          title="Forecast"
          subtitle="Weekly hours, peak week, headroom, hire-now. Management only."
        />
        <p className="px-4 pb-3 text-[13px] text-ink-3">
          Daily Capacity / Forecast+ workflow in PM: team load, department headroom, peak week, and
          hire-now. Slips dilute weekly hours unless an engagement has custom hrs/wk. Pipeline and
          capacity-exempt staff stay out of department math.
        </p>
        <div className="px-4 pb-4">
          <LinkButton href="/management/forecast">Open forecast</LinkButton>
        </div>
      </Card>
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
          title="Task-hour snapshot"
          subtitle="Open-task estimates vs declared weekly capacity."
        />
        <p className="px-4 pb-3 text-[13px] text-ink-3">
          The weekly hours model lives on Forecast. This report is still the open-task snapshot —
          useful when estimates are on tasks, not only on the engagement.
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
