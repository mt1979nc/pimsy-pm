import { Card, CardHeader, EmptyState } from "@/components/ui";
import { listManagementTeam } from "@/actions/management-team";
import { TeamFlagsForm } from "../_components/team-flags-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team — Staffing" };

export default async function ManagementTeamPage() {
  const team = await listManagementTeam();
  const billable = team.filter((m) => !m.capacityExempt);
  const deptCap = billable.reduce((sum, m) => sum + m.capacityHoursPerWeek, 0);

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-[12.5px] text-ink-2">
        Department billable capacity (excluding exempt):{" "}
        <span className="font-semibold text-ink">{deptCap} hrs/wk</span> across {billable.length}{" "}
        people. Capacity-exempt members still appear below for personal load tracking.
      </p>
      <Card>
        <CardHeader
          title="Team"
          subtitle={`${team.length} active staff · edit hrs and Prism flags`}
        />
        {team.length === 0 ? (
          <EmptyState
            title="No active staff"
            description="Invite people under Management → People, or run the Prism import seed."
          />
        ) : (
          <div>
            {team.map((m) => (
              <TeamFlagsForm key={m.id} member={m} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
