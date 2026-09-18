import { and, eq, desc, inArray, or, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { messageThreads, threadParticipants, projects } from "@/db/schema";
import {
  assertProjectAccess,
  isCustomer,
  canSeeInternal,
  NotFoundError,
  accessibleProjectIds,
  type Actor,
} from "./authz";

export { isUnread, partitionThreads } from "./thread-state";

/**
 * Resolve a thread the actor is allowed to read, or throw NotFoundError.
 * Customers get a 404 (never a 403) for internal threads so the existence of a
 * back-channel conversation is never leaked.
 */
export async function assertThreadAccess(actor: Actor, threadId: string) {
  const thread = await db.query.messageThreads.findFirst({
    where: eq(messageThreads.id, threadId),
  });
  if (!thread) throw new NotFoundError("Conversation not found.");

  if (isCustomer(actor) && thread.visibility === "INTERNAL") {
    throw new NotFoundError("Conversation not found.");
  }

  if (thread.projectId) {
    await assertProjectAccess(actor, thread.projectId);
    return thread;
  }

  if (thread.customerAccountId) {
    if (isCustomer(actor) && thread.customerAccountId !== actor.customerAccountId) {
      throw new NotFoundError("Conversation not found.");
    }
    return thread;
  }

  // Org-wide internal thread.
  if (isCustomer(actor)) throw new NotFoundError("Conversation not found.");
  return thread;
}

/** Threads on a project that this actor may see, newest activity first. */
export async function listProjectThreads(actor: Actor, projectId: string) {
  const conditions = [eq(messageThreads.projectId, projectId)];
  if (!canSeeInternal(actor)) conditions.push(eq(messageThreads.visibility, "SHARED"));

  return db.query.messageThreads.findMany({
    where: and(...conditions),
    orderBy: [desc(messageThreads.isPinned), desc(messageThreads.lastMessageAt)],
    with: {
      createdBy: { columns: { id: true, name: true, image: true } },
      participants: {
        columns: { userId: true, lastReadAt: true },
      },
    },
  });
}

/** Same inbox reach as the Inbox page — project threads plus account/org threads. */
async function inboxThreadConditions(actor: Actor): Promise<SQL[] | null> {
  const projectIds = await accessibleProjectIds(actor);

  const scope: SQL[] = [];
  if (projectIds.length > 0) scope.push(inArray(messageThreads.projectId, projectIds));
  if (isCustomer(actor) && actor.customerAccountId) {
    scope.push(
      and(
        eq(messageThreads.customerAccountId, actor.customerAccountId),
        isNull(messageThreads.projectId),
      )!,
    );
  } else if (!isCustomer(actor)) {
    // Staff also see account-level and org-wide threads.
    scope.push(isNull(messageThreads.projectId));
  }
  if (scope.length === 0) return null;

  const conditions: SQL[] = [scope.length === 1 ? scope[0]! : or(...scope)!];
  if (!canSeeInternal(actor)) conditions.push(eq(messageThreads.visibility, "SHARED"));
  return conditions;
}

/** Every thread across everything the actor can reach — the unified inbox. */
export async function listInboxThreads(actor: Actor, limit = 60) {
  const conditions = await inboxThreadConditions(actor);
  if (!conditions) return [];

  return db.query.messageThreads.findMany({
    where: and(...conditions),
    orderBy: [desc(messageThreads.lastMessageAt)],
    limit,
    with: {
      project: {
        columns: { id: true, name: true, code: true },
        with: { customerAccount: { columns: { id: true, name: true } } },
      },
      customerAccount: { columns: { id: true, name: true } },
      participants: { columns: { userId: true, lastReadAt: true } },
    },
  });
}

/**
 * Open (unresolved) unread count for the nav badge. Resolved topics stay
 * out of the number so SLA work is not drowned by closed history.
 *
 * Must stay a COUNT — the staff layout calls this on every render, including
 * the RSC refresh after marking a task done. Hydrating 500 inbox threads with
 * participants just to count was multi-second on small App Service + remote
 * Postgres.
 */
export async function unreadThreadCount(actor: Actor) {
  const conditions = await inboxThreadConditions(actor);
  if (!conditions) return 0;

  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messageThreads)
    .leftJoin(
      threadParticipants,
      and(eq(threadParticipants.threadId, messageThreads.id), eq(threadParticipants.userId, actor.id)),
    )
    .where(
      and(
        ...conditions,
        eq(messageThreads.isResolved, false),
        or(
          isNull(threadParticipants.userId),
          isNull(threadParticipants.lastReadAt),
          sql`${threadParticipants.lastReadAt} < ${messageThreads.lastMessageAt}`,
        ),
      ),
    );

  return row?.n ?? 0;
}

/** Add users to a thread without duplicating rows. */
export async function ensureParticipants(threadId: string, userIds: string[]) {
  const unique = Array.from(new Set(userIds)).filter(Boolean);
  if (unique.length === 0) return;
  await db
    .insert(threadParticipants)
    .values(unique.map((userId) => ({ threadId, userId })))
    .onConflictDoNothing();
}

/** Everyone who should be on a customer-facing thread for a project. */
export async function defaultThreadParticipants(projectId: string, visibility: "INTERNAL" | "SHARED") {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: {
      members: { columns: { userId: true, role: true } },
      customerAccount: { with: { contacts: { columns: { id: true, isActive: true } } } },
    },
  });
  if (!project) return [];

  const ids = new Set<string>();
  if (project.leadId) ids.add(project.leadId);
  for (const m of project.members) {
    if (visibility === "INTERNAL" && m.role === "CUSTOMER_CONTACT") continue;
    ids.add(m.userId);
  }
  if (visibility === "SHARED" && project.customerAccount) {
    for (const c of project.customerAccount.contacts) {
      if (c.isActive) ids.add(c.id);
    }
  }
  return Array.from(ids);
}
