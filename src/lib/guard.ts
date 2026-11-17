import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActor } from "@/auth";
import { isCustomer, isStaff, isAdmin, canSeePortfolio, ForbiddenError, type Actor } from "./authz";
import { archivedModulesEnabled } from "./archived-modules";
import { CAPACITY_VIEWER_HOME, assertCapacityViewerCannotMutate, isCapacityViewerRole } from "./capacity-viewer";
import { staffHomeHref } from "./day-to-day";

async function rejectCapacityViewer(actor: Pick<Actor, "role">): Promise<void> {
  if (!isCapacityViewerRole(actor.role)) return;
  const actionId = (await headers()).get("next-action");
  if (!actionId) redirect(CAPACITY_VIEWER_HOME);
  try {
    assertCapacityViewerCannotMutate(actor.role);
  } catch (error) {
    throw new ForbiddenError(error instanceof Error ? error.message : "Capacity viewers cannot change data.");
  }
}

/** Any signed-in, active user. Redirects to sign-in otherwise. */
export async function requireUser(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/signin");
  return actor;
}

/** Internal staff only. Customers are bounced to their portal. */
export async function requireStaff(): Promise<Actor> {
  const actor = await requireUser();
  if (isCustomer(actor)) redirect(archivedModulesEnabled() ? "/portal" : "/portal-archived");
  if (!isStaff(actor)) redirect("/signin");
  return actor;
}

/** Customer contacts only. Staff are sent back to the internal app. */
export async function requireCustomer(): Promise<Actor & { customerAccountId: string }> {
  const actor = await requireUser();
  if (isStaff(actor)) redirect(staffHomeHref(actor.role));
  if (!isCustomer(actor) || !actor.customerAccountId) redirect("/signin");
  return actor as Actor & { customerAccountId: string };
}

export async function requireAdmin(): Promise<Actor> {
  const actor = await requireStaff();
  await rejectCapacityViewer(actor);
  if (!isAdmin(actor)) redirect(staffHomeHref(actor.role));
  return actor;
}

export async function requirePortfolioAccess(): Promise<Actor> {
  const actor = await requireStaff();
  await rejectCapacityViewer(actor);
  if (!canSeePortfolio(actor)) redirect(staffHomeHref(actor.role));
  return actor;
}

/** Staff write. Capacity viewers are rejected before any change. */
export async function requireMutatingStaff(): Promise<Actor> {
  const actor = await requireStaff();
  await rejectCapacityViewer(actor);
  return actor;
}

/** Signed-in write. Capacity viewers are rejected before any change. */
export async function requireMutatingUser(): Promise<Actor> {
  const actor = await requireUser();
  await rejectCapacityViewer(actor);
  return actor;
}
