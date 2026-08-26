import { redirect } from "next/navigation";
import { getActor } from "@/auth";
import { isCustomer, isStaff, isAdmin, canSeePortfolio, type Actor } from "./authz";

/** Any signed-in, active user. Redirects to sign-in otherwise. */
export async function requireUser(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/signin");
  return actor;
}

/** Internal staff only. Customers are bounced to their portal. */
export async function requireStaff(): Promise<Actor> {
  const actor = await requireUser();
  if (isCustomer(actor)) redirect("/portal");
  if (!isStaff(actor)) redirect("/signin");
  return actor;
}

/** Customer contacts only. Staff are sent back to the internal app. */
export async function requireCustomer(): Promise<Actor & { customerAccountId: string }> {
  const actor = await requireUser();
  if (!isCustomer(actor) || !actor.customerAccountId) redirect("/dashboard");
  return actor as Actor & { customerAccountId: string };
}

export async function requireAdmin(): Promise<Actor> {
  const actor = await requireStaff();
  if (!isAdmin(actor)) redirect("/dashboard");
  return actor;
}

export async function requirePortfolioAccess(): Promise<Actor> {
  const actor = await requireStaff();
  if (!canSeePortfolio(actor)) redirect("/dashboard");
  return actor;
}
