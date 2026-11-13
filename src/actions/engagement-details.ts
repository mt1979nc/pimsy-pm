"use server";

import { and, eq, isNull, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { customerAccounts, projects } from "@/db/schema";
import { requirePortfolioAccess } from "@/lib/guard";
import { canManagePrismCapacity, ForbiddenError } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { parseExpectedArr } from "@/lib/ceo-book";
import { parseDateInput, toDateInput } from "@/lib/dates";
import {
  acronymColumns,
  acronymKey,
  changedDetailFields,
  customerDetailError,
  CUSTOMER_LOCK_FIELDS,
  detailText,
  nextPathManagedFields,
  PROJECT_LOCK_FIELDS,
} from "@/lib/detail-locks";
import { revalidatePrismSurfaces } from "@/lib/prism-surfaces";
import type { ActionState } from "@/actions/messages";

export async function updateEngagementDetails(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePortfolioAccess();
  if (!canManagePrismCapacity(actor)) throw new ForbiddenError("Prism access required.");

  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) return { error: "Missing project." };

  const input = {
    name: String(formData.get("name") ?? ""),
    practiceType: String(formData.get("practiceType") ?? ""),
    website: String(formData.get("website") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    city: String(formData.get("city") ?? ""),
    state: String(formData.get("state") ?? ""),
    priorSystem: String(formData.get("priorSystem") ?? ""),
    seatCount: String(formData.get("seatCount") ?? ""),
    logoUrl: String(formData.get("logoUrl") ?? ""),
    status: String(formData.get("status") ?? ""),
    hubspotDealUrl: String(formData.get("hubspotDealUrl") ?? ""),
    contractDate: String(formData.get("contractDate") ?? ""),
    expectedArr: String(formData.get("expectedArr") ?? ""),
    acronym: String(formData.get("acronym") ?? ""),
  };
  const error = customerDetailError(input);
  if (error) return { error };

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: {
      id: true,
      code: true,
      crmAcronym: true,
      prismClientId: true,
      hubspotDealUrl: true,
      contractDate: true,
      expectedArr: true,
      pathManagedFields: true,
      customerAccountId: true,
      archivedAt: true,
    },
    with: {
      customerAccount: {
        columns: {
          id: true,
          name: true,
          practiceType: true,
          website: true,
          phone: true,
          city: true,
          state: true,
          priorSystem: true,
          seatCount: true,
          logoUrl: true,
          status: true,
          pathManagedFields: true,
        },
      },
    },
  });
  if (!project || project.archivedAt || !project.customerAccount) return { error: "Engagement not found." };

  const key = acronymKey(input.acronym);
  const clash = await db.query.projects.findFirst({
    where: and(
      isNull(projects.archivedAt),
      ne(projects.id, projectId),
      or(
        sql`upper(${projects.code}) = ${key}`,
        sql`upper(${projects.crmAcronym}) = ${key}`,
        sql`upper(${projects.prismClientId}) = ${key}`,
      ),
    ),
    columns: { id: true },
  });
  if (clash) return { error: "That acronym is already in use." };

  const codeClash = await db.query.projects.findFirst({
    where: and(ne(projects.id, projectId), sql`upper(${projects.code}) = ${key}`),
    columns: { id: true },
  });
  const acronym = acronymColumns({
    code: project.code,
    crmAcronym: project.crmAcronym,
    prismClientId: project.prismClientId,
    next: input.acronym,
    codeTaken: Boolean(codeClash),
  });
  const arr = parseExpectedArr(input.expectedArr);
  if (!arr.ok) return { error: arr.error };
  const contractDate = input.contractDate.trim() ? parseDateInput(input.contractDate) : null;
  if (input.contractDate.trim() && !contractDate) return { error: "Contract date must be a real date." };

  const customer = project.customerAccount;
  const seats = input.seatCount.trim() ? Number.parseInt(input.seatCount, 10) : null;
  const customerBefore = {
    name: detailText(customer.name),
    practiceType: detailText(customer.practiceType),
    website: detailText(customer.website),
    phone: detailText(customer.phone),
    city: detailText(customer.city),
    state: detailText(customer.state),
    priorSystem: detailText(customer.priorSystem),
    seatCount: customer.seatCount == null ? "" : String(customer.seatCount),
    logoUrl: detailText(customer.logoUrl),
    status: detailText(customer.status),
  };
  const customerAfter = {
    ...customerBefore,
    name: input.name.trim(),
    practiceType: input.practiceType.trim(),
    website: input.website.trim(),
    phone: input.phone.trim(),
    city: input.city.trim(),
    state: input.state.trim(),
    priorSystem: input.priorSystem.trim(),
    seatCount: seats == null ? "" : String(seats),
    logoUrl: input.logoUrl.trim(),
    status: input.status,
  };
  const oldAcronym = acronymKey(project.crmAcronym || project.prismClientId || project.code);
  const projectBefore = {
    acronym: oldAcronym,
    hubspotDealUrl: detailText(project.hubspotDealUrl),
    contractDate: toDateInput(project.contractDate),
    expectedArr: detailText(project.expectedArr).replace(/\.00$/, ""),
  };
  const projectAfter = {
    acronym: key,
    hubspotDealUrl: input.hubspotDealUrl.trim(),
    contractDate: input.contractDate.trim(),
    expectedArr: arr.value ? arr.value.replace(/\.00$/, "") : "",
  };

  await db
    .update(customerAccounts)
    .set({
      name: customerAfter.name,
      practiceType: customerAfter.practiceType || null,
      website: customerAfter.website || null,
      phone: customerAfter.phone || null,
      city: customerAfter.city || null,
      state: customerAfter.state || null,
      priorSystem: customerAfter.priorSystem || null,
      seatCount: seats,
      logoUrl: customerAfter.logoUrl || null,
      ...(customerAfter.logoUrl ? { logoStorageKey: null } : {}),
      status: customerAfter.status as typeof customer.status,
      pathManagedFields: nextPathManagedFields(
        customer.pathManagedFields,
        changedDetailFields(customerBefore, customerAfter, CUSTOMER_LOCK_FIELDS),
      ),
      updatedAt: new Date(),
    })
    .where(eq(customerAccounts.id, customer.id));

  await db
    .update(projects)
    .set({
      ...acronym,
      hubspotDealUrl: projectAfter.hubspotDealUrl || null,
      contractDate,
      expectedArr: arr.value,
      pathManagedFields: nextPathManagedFields(
        project.pathManagedFields,
        changedDetailFields(projectBefore, projectAfter, PROJECT_LOCK_FIELDS),
      ),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, project.id));

  await audit({
    actor,
    action: "customer.updated",
    entityType: "customer_account",
    entityId: customer.id,
    summary: `${customerAfter.name}: details updated`,
    metadata: { projectId },
  });
  revalidatePrismSurfaces(projectId);
  return { ok: true, message: "Details saved." };
}
