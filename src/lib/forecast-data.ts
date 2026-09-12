/**
 * Load staff + engagements and run the v1.10 weekly-hours forecast.
 * Native Postgres — no Prism SQL.
 */

import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { orgSettings, projects, users } from "@/db/schema";
import { getOrgSettings } from "@/lib/notification-prefs";
import {
  buildCapacityForecast,
  parseExclusionCodes,
  type CapacityForecast,
  type ForecastEngagement,
  type ForecastStaffMember,
} from "@/lib/forecast";
import { inferPrismStatus } from "@/lib/prism-status";

export async function loadForecastExclusions(): Promise<string[]> {
  const org = await db.query.orgSettings.findFirst({
    where: eq(orgSettings.id, "singleton"),
    columns: { forecastAnalysisExclusions: true },
  });
  return parseExclusionCodes(org?.forecastAnalysisExclusions);
}

export async function loadForecastStaff(): Promise<ForecastStaffMember[]> {
  const rows = await db.query.users.findMany({
    where: and(eq(users.isActive, true), ne(users.role, "CUSTOMER")),
    columns: {
      id: true,
      name: true,
      email: true,
      capacityHoursPerWeek: true,
      capacityExempt: true,
      canLead: true,
      isDirector: true,
      image: true,
    },
    orderBy: [asc(users.name)],
  });
  return rows;
}

export async function loadForecastEngagements(): Promise<ForecastEngagement[]> {
  const rows = await db.query.projects.findMany({
    where: and(
      isNull(projects.archivedAt),
      eq(projects.type, "IMPLEMENTATION"),
      ne(projects.status, "CANCELLED"),
      ne(projects.status, "COMPLETED"),
    ),
    columns: {
      id: true,
      code: true,
      name: true,
      status: true,
      leadId: true,
      coLeadId: true,
      ownerSplitPercent: true,
      customHoursPerWeek: true,
      prismStatus: true,
      startDate: true,
      initialGoLiveDate: true,
      targetGoLiveDate: true,
      estimatedHours: true,
      crmAcronym: true,
      prismClientId: true,
    },
    with: {
      customerAccount: { columns: { name: true, status: true } },
      scope: { columns: { estimatedHours: true } },
    },
    orderBy: [asc(projects.code)],
  });

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.customerAccount?.name ?? r.name,
    acronym: r.crmAcronym || r.prismClientId || r.code,
    prismStatus: inferPrismStatus({
      prismStatus: r.prismStatus,
      projectStatus: r.status,
      customerStatus: r.customerAccount?.status,
      startDate: r.startDate,
    }),
    leadId: r.leadId,
    coLeadId: r.coLeadId,
    ownerSplitPercent: r.ownerSplitPercent,
    estimatedHours: r.scope?.estimatedHours ?? r.estimatedHours,
    customHoursPerWeek: r.customHoursPerWeek,
    startDate: r.startDate,
    initialGoLiveDate: r.initialGoLiveDate,
    targetGoLiveDate: r.targetGoLiveDate,
  }));
}

export async function loadCapacityForecast(weeksAhead = 12, asOf = new Date()): Promise<CapacityForecast> {
  const [staff, engagements] = await Promise.all([loadForecastStaff(), loadForecastEngagements()]);
  return buildCapacityForecast({ asOf, weeksAhead, staff, engagements });
}

export async function saveForecastExclusions(codes: string[]): Promise<string[]> {
  const normalized = parseExclusionCodes(codes);
  await getOrgSettings();
  await db
    .update(orgSettings)
    .set({ forecastAnalysisExclusions: normalized, updatedAt: new Date() })
    .where(eq(orgSettings.id, "singleton"));
  return normalized;
}
