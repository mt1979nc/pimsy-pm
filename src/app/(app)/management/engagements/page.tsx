import { Card, CardHeader, EmptyState } from "@/components/ui";
import { listEngagements } from "@/actions/management-engagements";
import { EngagementRosterTable } from "../_components/engagement-roster-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Engagements — Staffing" };

export default async function ManagementEngagementsPage() {
  const rows = await listEngagements();
  const active = rows.filter((r) => r.effectivePrismStatus === "active").length;
  const pipeline = rows.filter((r) => r.effectivePrismStatus === "pipeline").length;

  return (
    <Card>
      <CardHeader
        title="Engagements"
        subtitle={`${rows.length} implementations · ${active} active · ${pipeline} pipeline`}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No implementation projects"
          description="Create a project or run npm run db:seed:prism-import."
        />
      ) : (
        <EngagementRosterTable rows={rows} />
      )}
    </Card>
  );
}
