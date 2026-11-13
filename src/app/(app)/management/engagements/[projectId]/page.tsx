import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader, LinkButton } from "@/components/ui";
import { getEngagementForEdit } from "@/actions/management-engagements";
import { NotFoundError } from "@/lib/authz";
import { EngagementEditForm } from "../../_components/engagement-edit-form";
import { loadRosterGoLiveContext } from "@/lib/forecast-data";
import { currentPathConfig } from "@/lib/path-config-store";
import { parseDiscoveryScenario } from "@/lib/estimator";
import { expectedArrInputValue } from "@/lib/ceo-book";
import { toDateInput } from "@/lib/dates";
import { EngagementDetailsForm } from "../../_components/engagement-details-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit engagement — Prism" };

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
  const goLive = await loadRosterGoLiveContext();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/management/engagements"
          className="text-[13px] font-medium text-brand hover:underline"
        >
          ← Roster
        </Link>
        <LinkButton href={`/projects/${project.id}`} size="sm" variant="secondary">
          Profile
        </LinkButton>
      </div>
      <Card>
        <CardHeader
          title="Edit engagement"
          subtitle="Owners, split, scope, dates, Prism status — saved to PATH Postgres. Forecast+ can refill current go-live from past sites."
        />
        <EngagementEditForm
          projectId={project.id}
          code={project.code}
          customerName={project.customerAccount?.name ?? null}
          leadId={project.leadId}
          coLeadId={project.coLeadId}
          thirdSpecialistId={project.thirdSpecialistId}
          leadSplitPercent={project.leadSplitPercent}
          coLeadSplitPercent={project.coLeadSplitPercent}
          thirdSplitPercent={project.thirdSplitPercent}
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
                  intakeAssistant: project.scope.intakeAssistant,
                  complexityTier: project.scope.complexityTier,
                  estimatedHours: project.scope.estimatedHours,
                }
              : null
          }
          discoveryScenario={parseDiscoveryScenario(project.scope?.discoveryScenario)}
          skipUsFederalHolidays={project.scope?.skipUsFederalHolidays ?? true}
          leadOptions={leadOptions}
          slips={project.slipEvents}
          durationSamples={goLive.samples}
          exclusions={goLive.exclusions}
          excludeFromAnalytics={project.excludeFromAnalytics}
          estimator={currentPathConfig().estimator}
          statuses={currentPathConfig().statuses}
          slipCauses={currentPathConfig().slipCauses}
          slipApproval={currentPathConfig().slipApproval}
        />
      </Card>
      {project.customerAccount ? (
        <Card>
          <CardHeader
            title="Customer details"
            subtitle="Saved fields stay on the next Prism import. Product type still comes from the playbook."
          />
          <EngagementDetailsForm
            details={{
              projectId: project.id,
              name: project.customerAccount.name,
              practiceType: project.customerAccount.practiceType ?? "",
              website: project.customerAccount.website ?? "",
              phone: project.customerAccount.phone ?? "",
              city: project.customerAccount.city ?? "",
              state: project.customerAccount.state ?? "",
              priorSystem: project.customerAccount.priorSystem ?? "",
              seatCount: project.customerAccount.seatCount == null ? "" : String(project.customerAccount.seatCount),
              logoUrl: project.customerAccount.logoUrl ?? "",
              status: project.customerAccount.status,
              acronym: project.crmAcronym || project.prismClientId || project.code,
              hubspotDealUrl: project.hubspotDealUrl ?? "",
              contractDate: toDateInput(project.contractDate),
              expectedArr: expectedArrInputValue(project.expectedArr),
            }}
          />
        </Card>
      ) : null}
    </div>
  );
}
