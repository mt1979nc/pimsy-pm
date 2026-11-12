import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { projects, slipEvents } from "@/db/schema";
import { Card } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import { requireStaff } from "@/lib/guard";
import { assertProjectAccess, canSeePortfolio, ForbiddenError, NotFoundError } from "@/lib/authz";
import { PRISM_STATUS_LABELS, isPrismStatus } from "@/lib/prism-status";
import { listLeadOptions } from "@/actions/management-engagements";
import { CoLeadForm } from "./co-lead-form";

function person(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed || "—";
}

function slipCause(cause: string | null): string | null {
  if (cause === "CUSTOMER") return "Customer";
  if (cause === "PIMSY") return "PIMSY";
  return null;
}

/**
 * Prism customer profile. The rest of /projects stays archived.
 * Portfolio staff can set the co-lead here; everyone else sees the facts only.
 */
export async function ReadOnlyCustomerProfile({ projectId }: { projectId: string }) {
  const actor = await requireStaff();
  try {
    await assertProjectAccess(actor, projectId);
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ForbiddenError) notFound();
    throw err;
  }
  const canEditCoLead = canSeePortfolio(actor);

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: {
      customerAccount: { columns: { name: true, status: true } },
      lead: { columns: { id: true, name: true } },
      coLead: { columns: { id: true, name: true } },
      thirdSpecialist: { columns: { id: true, name: true } },
      slipEvents: {
        orderBy: [asc(slipEvents.fromDate)],
        columns: { id: true, fromDate: true, toDate: true, days: true, cause: true, note: true },
      },
    },
  });
  if (!project) notFound();

  const options = canEditCoLead
    ? await listLeadOptions(
        [project.leadId, project.coLeadId, project.thirdSpecialistId].filter((id): id is string => Boolean(id)),
      )
    : [];
  const ownerCount = [project.leadId, project.coLeadId, project.thirdSpecialistId].filter(Boolean).length;
  function named(name: string | null | undefined, percent: number) {
    const label = person(name);
    if (label === "—" || ownerCount < 2) return label;
    return `${label} · ${percent}%`;
  }
  const title = project.customerAccount?.name?.trim() || project.name;
  const acronym = project.crmAcronym || project.prismClientId || project.code;
  const status = isPrismStatus(project.prismStatus)
    ? PRISM_STATUS_LABELS[project.prismStatus]
    : project.prismStatus?.trim() || project.status.replace(/_/g, " ").toLowerCase();
  const goLive = project.actualGoLiveDate ?? project.targetGoLiveDate;

  const facts: [string, string][] = [
    ["Status", status],
    ["Customer", project.customerAccount?.status?.replace(/_/g, " ").toLowerCase() || "—"],
    ["Lead", named(project.lead?.name, project.leadSplitPercent)],
    ["Co-lead", named(project.coLead?.name, project.coLeadSplitPercent)],
    ["3rd specialist", named(project.thirdSpecialist?.name, project.thirdSplitPercent)],
    ["Kickoff", project.startDate ? fmtDate(project.startDate) : "—"],
    ["Go-live", goLive ? fmtDate(goLive) : "—"],
  ];

  return (
    <div className="space-y-4">
      <div>
        <Link href="/management/engagements" className="text-[13px] font-medium text-brand hover:underline">
          ← Roster
        </Link>
        <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="min-w-0 break-words text-[20px] font-semibold tracking-[-0.02em] text-ink">{title}</h1>
          <span className="font-mono text-[12px] text-ink-3">{acronym}</span>
        </div>
      </div>

      <Card>
        <dl className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</dt>
              <dd className="mt-0.5 break-words text-[14px] text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        {canEditCoLead ? (
          <CoLeadForm
            projectId={project.id}
            leadId={project.leadId}
            coLeadId={project.coLeadId}
            thirdSpecialistId={project.thirdSpecialistId}
            leadSplitPercent={project.leadSplitPercent}
            coLeadSplitPercent={project.coLeadSplitPercent}
            thirdSplitPercent={project.thirdSplitPercent}
            options={options}
          />
        ) : null}
      </Card>

      <Card>
        <h2 className="border-b border-border px-4 py-3 text-[13px] font-semibold text-ink">Slips</h2>
        {project.slipEvents.length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-ink-3">No slips</p>
        ) : (
          <ul className="divide-y divide-border">
            {project.slipEvents.map((slip) => {
              const cause = slipCause(slip.cause);
              return (
                <li key={slip.id} className="px-4 py-2.5 text-[13px]">
                  <p className="text-ink">
                    {fmtDate(slip.fromDate)} → {fmtDate(slip.toDate)}
                    <span className="text-ink-3"> · {slip.days}d</span>
                    {cause ? <span className="text-ink-3"> · {cause}</span> : null}
                  </p>
                  {slip.note ? <p className="mt-0.5 text-[12.5px] text-ink-2">{slip.note}</p> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
