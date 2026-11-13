import { Suspense } from "react";
import { Card, CardHeader, LinkButton } from "@/components/ui";
import { listEngagements } from "@/actions/management-engagements";
import { loadPathConfig } from "@/lib/path-config";
import { RosterBoard } from "../_components/roster-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Roster" };

export default async function ManagementEngagementsPage() {
  const [config, rows] = await Promise.all([loadPathConfig(), listEngagements()]);

  return (
    <div className="space-y-4" data-page-width="full">
      <div className="flex justify-end">
        <LinkButton href="/management/engagements/new" variant="primary" size="sm">
          Add to roster
        </LinkButton>
      </div>
      <Card className="min-w-0">
        <CardHeader title="Roster" subtitle="Sort a column or filter the list. The address keeps both." />
        <div className="px-4 pb-4">
          <Suspense fallback={null}>
            <RosterBoard rows={rows} statuses={config.statuses} />
          </Suspense>
        </div>
      </Card>
    </div>
  );
}
