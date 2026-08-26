/**
 * Authorization — the safety boundary between internal work and the customer
 * portal.
 *
 * RULES (do not route around these):
 *  1. A CUSTOMER user can only ever reach rows belonging to their own
 *     customerAccountId.
 *  2. A CUSTOMER user can only ever see rows whose visibility is SHARED.
 *  3. A CUSTOMER user can only reach projects with portalEnabled = true.
 *
 * Every portal query must go through `customerScope()` or one of the
 * `assert*` helpers below. Tests in tests/authz.test.ts lock this down.
 */

import { and, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { projects, projectMembers, type Role } from "@/db/schema";

export type Actor = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  customerAccountId: string | null;
  isActive: boolean;
};

// ---------------------------------------------------------------------------
// Role predicates
// ---------------------------------------------------------------------------

const STAFF_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "SPECIALIST", "MEMBER"];
const ADMIN_ROLES: Role[] = ["OWNER", "ADMIN"];
/** Roles allowed to see portfolio-wide reporting (the COO view). */
const PORTFOLIO_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER"];
/**
 * Roles that can read every project without explicit membership.
 *
 * SPECIALIST is deliberately NOT here: a specialist should only reach
 * projects they lead or have been added to as a member, same as MEMBER.
 * Only leadership roles get the portfolio-wide view.
 */
const READ_ALL_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER"];

export const isStaff = (a: Pick<Actor, "role">) => STAFF_ROLES.includes(a.role);
export const isCustomer = (a: Pick<Actor, "role">) => a.role === "CUSTOMER";
export const isAdmin = (a: Pick<Actor, "role">) => ADMIN_ROLES.includes(a.role);
export const canSeePortfolio = (a: Pick<Actor, "role">) => PORTFOLIO_ROLES.includes(a.role);
export const canReadAllProjects = (a: Pick<Actor, "role">) => READ_ALL_ROLES.includes(a.role);

/** Only staff may ever read INTERNAL rows. */
export const canSeeInternal = (a: Pick<Actor, "role">) => isStaff(a);

export const canManageUsers = (a: Pick<Actor, "role">) => isAdmin(a);
export const canManageTemplates = (a: Pick<Actor, "role">) => isAdmin(a);
export const canCreateProjects = (a: Pick<Actor, "role">) =>
  ["OWNER", "ADMIN", "MANAGER", "SPECIALIST"].includes(a.role);

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "You do not have access to this resource.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Visibility filtering
// ---------------------------------------------------------------------------

/**
 * Returns a visibility predicate for the given actor, or `undefined` when the
 * actor may see everything. Pass the `visibility` column of whichever table
 * you are querying.
 *
 *   const where = and(eq(tasks.projectId, id), visibilityFilter(actor, tasks.visibility));
 */
export function visibilityFilter(
  actor: Pick<Actor, "role">,
  column: Parameters<typeof eq>[0],
): SQL | undefined {
  if (canSeeInternal(actor)) return undefined;
  return eq(column, "SHARED");
}

/**
 * Projects the actor is allowed to read.
 * - Customers: only their own account's portal-enabled, unarchived projects.
 * - Read-all staff: everything not archived.
 * - Other staff: projects they lead or are a member of.
 */
export async function accessibleProjectIds(actor: Actor): Promise<string[]> {
  if (isCustomer(actor)) {
    if (!actor.customerAccountId) return [];
    const rows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.customerAccountId, actor.customerAccountId),
          eq(projects.portalEnabled, true),
          isNull(projects.archivedAt),
        ),
      );
    return rows.map((r) => r.id);
  }

  if (canReadAllProjects(actor)) {
    const rows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(isNull(projects.archivedAt));
    return rows.map((r) => r.id);
  }

  const rows = await db
    .selectDistinct({ id: projects.id })
    .from(projects)
    .leftJoin(projectMembers, eq(projectMembers.projectId, projects.id))
    .where(
      and(
        isNull(projects.archivedAt),
        or(eq(projects.leadId, actor.id), eq(projectMembers.userId, actor.id)),
      ),
    );
  return rows.map((r) => r.id);
}

/**
 * A reusable WHERE fragment restricting a `projectId` column to what the actor
 * can read. Prefer this over fetching ids when composing a single query.
 */
export async function projectScope(
  actor: Actor,
  column: Parameters<typeof inArray>[0],
): Promise<SQL> {
  const ids = await accessibleProjectIds(actor);
  if (ids.length === 0) {
    // Match nothing, safely.
    return eq(column, "__no_access__");
  }
  return inArray(column, ids);
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

/** Throws unless the actor may read this project. Returns the project row. */
export async function assertProjectAccess(actor: Actor, projectId: string) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project) throw new NotFoundError("Project not found.");

  if (isCustomer(actor)) {
    if (
      !actor.customerAccountId ||
      project.customerAccountId !== actor.customerAccountId ||
      !project.portalEnabled ||
      project.archivedAt
    ) {
      // Deliberately a 404: never confirm the existence of another
      // customer's project to an outside party.
      throw new NotFoundError("Project not found.");
    }
    return project;
  }

  if (canReadAllProjects(actor)) return project;

  const membership = await db.query.projectMembers.findFirst({
    where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, actor.id)),
  });
  if (!membership && project.leadId !== actor.id) {
    throw new ForbiddenError("You are not a member of this project.");
  }
  return project;
}

/** Throws unless the actor may modify this project's contents. */
export async function assertProjectWrite(actor: Actor, projectId: string) {
  if (isCustomer(actor)) {
    throw new ForbiddenError("Customer contacts cannot modify project structure.");
  }
  const project = await assertProjectAccess(actor, projectId);
  if (isAdmin(actor) || actor.role === "MANAGER") return project;
  if (project.leadId === actor.id) return project;

  const membership = await db.query.projectMembers.findFirst({
    where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, actor.id)),
  });
  if (!membership || membership.role === "OBSERVER") {
    throw new ForbiddenError("You have read-only access to this project.");
  }
  return project;
}

export function assertStaff(actor: Actor) {
  if (!isStaff(actor)) throw new ForbiddenError("Internal staff only.");
  return actor;
}

export function assertAdmin(actor: Actor) {
  if (!isAdmin(actor)) throw new ForbiddenError("Administrators only.");
  return actor;
}

export function assertCustomer(actor: Actor) {
  if (!isCustomer(actor) || !actor.customerAccountId) {
    throw new ForbiddenError("Customer portal access only.");
  }
  return actor as Actor & { customerAccountId: string };
}

/**
 * Guard for anything a customer might submit that carries a visibility value.
 * Customers may never create INTERNAL content, and may never mark something
 * as internal to hide it from staff.
 */
export function resolveVisibilityForActor(actor: Actor, requested?: "INTERNAL" | "SHARED") {
  if (isCustomer(actor)) return "SHARED" as const;
  return requested ?? ("INTERNAL" as const);
}
