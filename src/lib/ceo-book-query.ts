/**
 * CEO implementation book query. Server-only.
 */

import { and, eq, isNull, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { projects, statusUpdates } from "@/db/schema";
import { projectHasRcmTrack } from "@/lib/add-rcm";
import { includedInAnalytics } from "@/lib/analytics-scope";
import { isExcludedFromAnalytics } from "@/lib/analytics-exclude";
import {
  assignedImplementationSpecialists,
  ceoCommentText,
  ceoProductType,
  compareCeoBookRows,
  expectedArrInputValue,
  formatAssignedIs,
  type CeoBookRow,
} from "@/lib/ceo-book";
import { fmtDate, toDateInput, utcDayKey } from "@/lib/dates";

export async function listCeoBook(opts?: { includeExcluded?: boolean }): Promise<CeoBookRow[]> {
  const includeExcluded = Boolean(opts?.includeExcluded);
  const filters = [
    isNull(projects.archivedAt),
    eq(projects.type, "IMPLEMENTATION"),
    ne(projects.status, "CANCELLED"),
    or(isNull(projects.prismStatus), ne(projects.prismStatus, "pipeline")),
  ];
  if (!includeExcluded) filters.push(includedInAnalytics());

  const rows = await db.query.projects.findMany({
    where: and(...filters),
    columns: {
      id: true,
      name: true,
      code: true,
      crmAcronym: true,
      prismClientId: true,
      playbookPath: true,
      rcmTaskCountTotal: true,
      ehrTaskCountTotal: true,
      initialGoLiveDate: true,
      targetGoLiveDate: true,
      actualGoLiveDate: true,
      contractDate: true,
      expectedArr: true,
      ceoStatus: true,
      excludeFromAnalytics: true,
    },
    with: {
      customerAccount: { columns: { name: true, excludeFromAnalytics: true } },
      lead: { columns: { id: true, name: true, email: true, role: true } },
      members: {
        columns: { role: true },
        with: { user: { columns: { id: true, name: true, email: true, role: true } } },
      },
      statusUpdates: {
        columns: { summary: true },
        orderBy: [sql`coalesce(${statusUpdates.publishedAt}, ${statusUpdates.createdAt}) desc`],
        limit: 1,
      },
    },
  });

  const mapped: CeoBookRow[] = rows.map((row) => {
    const comment = ceoCommentText(row.statusUpdates[0]?.summary);
    const abbreviation = row.crmAcronym || row.prismClientId || row.code;
    return {
      id: row.id,
      name: row.customerAccount?.name?.trim() || row.name,
      abbreviation,
      productType: ceoProductType({
        playbookPath: row.playbookPath,
        hasRcmTrack: projectHasRcmTrack({
          playbookPath: row.playbookPath,
          rcmTaskCountTotal: row.rcmTaskCountTotal,
        }),
        ehrTaskCountTotal: row.ehrTaskCountTotal,
      }),
      contractDateInput: toDateInput(row.contractDate),
      expectedArrInput: expectedArrInputValue(row.expectedArr),
      initialGoLive: fmtDate(row.initialGoLiveDate),
      currentGoLive: fmtDate(row.targetGoLiveDate),
      actualGoLive: fmtDate(row.actualGoLiveDate),
      currentGoLiveSort: row.targetGoLiveDate ? utcDayKey(new Date(row.targetGoLiveDate)) : null,
      assignedIs: formatAssignedIs(
        assignedImplementationSpecialists({
          lead: row.lead,
          members: row.members,
        }),
      ),
      ceoStatus: row.ceoStatus,
      commentPreview: comment.preview,
      commentFull: comment.full,
      excludeFromAnalytics: isExcludedFromAnalytics(row),
    };
  });

  mapped.sort(compareCeoBookRows);
  return mapped;
}
