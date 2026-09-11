import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader, LinkButton } from "@/components/ui";
import { getEngagementForEdit } from "@/actions/management-engagements";
import { NotFoundError } from "@/lib/authz";
import { EngagementEditForm } from "../../_components/engagement-edit-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit engagement — Staffing" };

export default async function ManagementEngagementEditPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  let data;
  try {
    data = await getEngagementForEdit(projectId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const { project, leadOptions, effectivePrismStatus } = data;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/management/engagements"
          className="text-[13px] font-medium text-brand hover:underline"
        >
          ← Engagements
        </Link>
        <LinkButton href={`/projects/${project.id}`} size="sm" variant="secondary">
          Open project
        </LinkButton>
      </div>
      <Card>
        <CardHeader
          title="Edit engagement"
          subtitle="Owners, split, scope, dates, Prism status — saved to PM Postgres."
        />
        <EngagementEditForm
          projectId={project.id}
          code={project.code}
          customerName={project.customerAccount?.name ?? null}
          leadId={project.leadId}
          coLeadId={project.coLeadId}
          ownerSplitPercent={project.ownerSplitPercent}
          customHoursPerWeek={project.customHoursPerWeek}
          prismStatus={effectivePrismStatus}
          prismNote={project.prismNote}
          startDate={project.startDate}
          initialGoLiveDate={project.initialGoLiveDate}
          targetGoLiveDate={project.targetGoLiveDate}
          scope={
            project.scope
              ? {
                  userCount: project.scope.userCount,
                  locationCount: project.scope.locationCount,
                  formPageCount: project.scope.formPageCount,
                  trainingsPerWeek: project.scope.trainingsPerWeek,
                  serviceLines: project.scope.serviceLines ?? [],
                  stateCompliance: project.scope.stateCompliance,
                  minimalOrgStructure: project.scope.minimalOrgStructure,
                  complexityTier: project.scope.complexityTier,
                  estimatedHours: project.scope.estimatedHours,
                }
              : null
          }
          leadOptions={leadOptions}
          slips={project.slipEvents}
        />
      </Card>
    </div>
  );
}
