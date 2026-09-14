import { Card, CardHeader, EmptyState } from "@/components/ui";
import { listManagementTeam } from "@/actions/management-team";
import { TeamFlagsForm } from "../_components/team-flags-form";
import { loadCapacityForecast } from "@/lib/forecast-data";
import { memberLoadsFromForecast } from "@/lib/forecast";
import { MemberLoadCards } from "@/components/charts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team — Prism" };

export default async function ManagementTeamPage() {
  const [team, forecast] = await Promise.all([listManagementTeam(), loadCapacityForecast(12)]);
  const billable = team.filter((m) => !m.capacityExempt);
  const deptCap = billable.reduce((sum, m) => sum + m.capacityHoursPerWeek, 0);
  const loadById = new Map(memberLoadsFromForecast(forecast).map((m) => [m.id, m]));

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-[12.5px] text-ink-2">
        Department billable capacity (excluding exempt):{" "}
        <span className="font-semibold text-ink">{deptCap} hrs/wk</span> across {billable.length}{" "}
        people. Capacity-exempt members still appear below for personal load tracking.
      </p>
      {team.length > 0 ? (
        <MemberLoadCards
          members={team.map((m) => {
            const load = loadById.get(m.id);
            return {
              id: m.id,
              name: m.name,
              email: m.email,
              image: m.image,
              capacityHoursPerWeek: m.capacityHoursPerWeek,
              capacityExempt: m.capacityExempt,
              isDirector: m.isDirector,
              thisWeekHours: load?.thisWeekHours ?? 0,
              peakHours: load?.peakHours ?? 0,
            };
          })}
        />
      ) : null}
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
