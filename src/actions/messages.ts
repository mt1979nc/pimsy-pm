"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { messageThreads, messages, threadParticipants, mentions, users } from "@/db/schema";
import { requireUser } from "@/lib/guard";
import {
  assertProjectAccess,
  isCustomer,
  canSeeInternal,
  ForbiddenError,
  resolveVisibilityForActor,
} from "@/lib/authz";
import {
  assertThreadAccess,
  ensureParticipants,
  defaultThreadParticipants,
} from "@/lib/threads";
import { notify, threadRecipients } from "@/lib/notify";
import { audit } from "@/lib/audit";

const createThreadSchema = z.object({
  projectId: z.string().min(1),
  subject: z.string().trim().min(1, "Give the conversation a subject.").max(200),
  body: z.string().trim().min(1, "Write a message to start the thread.").max(20000),
  visibility: z.enum(["INTERNAL", "SHARED"]),
});

export type ActionState = { error?: string; ok?: boolean };

export async function createThread(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireUser();

  const parsed = createThreadSchema.safeParse({
    projectId: formData.get("projectId"),
    subject: formData.get("subject"),
    body: formData.get("body"),
    visibility: formData.get("visibility") ?? "INTERNAL",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const { projectId, subject, body } = parsed.data;

  await assertProjectAccess(actor, projectId);
  // A customer can only ever open a shared conversation.
  const visibility = resolveVisibilityForActor(actor, parsed.data.visibility);

  let threadId: string;
  try {
    threadId = await db.transaction(async (tx) => {
      const [thread] = await tx
        .insert(messageThreads)
        .values({
          subject,
          visibility,
          projectId,
          createdById: actor.id,
          lastMessageAt: new Date(),
          messageCount: 1,
        })
        .returning({ id: messageThreads.id });

      await tx.insert(messages).values({ threadId: thread.id, authorId: actor.id, body });
      return thread.id;
    });
  } catch (err) {
    console.error("createThread failed", err);
    return { error: "Could not start the conversation. Please try again." };
  }

  const participants = await defaultThreadParticipants(projectId, visibility);
  await ensureParticipants(threadId, [...participants, actor.id]);
  await db
    .update(threadParticipants)
    .set({ lastReadAt: new Date() })
    .where(
      and(eq(threadParticipants.threadId, threadId), eq(threadParticipants.userId, actor.id)),
    );

  await audit({
    actor,
    action: "thread.created",
    entityType: "message_thread",
    entityId: threadId,
    summary: `${visibility === "SHARED" ? "Shared" : "Internal"} thread “${subject}”`,
    metadata: { projectId, visibility },
  });

  await notify({
    userIds: await threadRecipients(threadId, actor.id),
    type: "MESSAGE_POSTED",
    title: `New conversation: ${subject}`,
    quote: { author: actor.name ?? actor.email ?? "Someone", text: body.slice(0, 400) },
    linkUrl: `/projects/${projectId}/messages/${threadId}`,
    portalLinkUrl: `/portal/projects/${projectId}/messages/${threadId}`,
    ctaLabel: "Read and reply",
    email: visibility === "SHARED",
    teams: isCustomer(actor),
    projectId,
    exceptUserId: actor.id,
  });

  revalidatePath(`/projects/${projectId}/messages`);
  revalidatePath("/inbox");
  redirect(
    isCustomer(actor)
      ? `/portal/projects/${projectId}/messages/${threadId}`
      : `/projects/${projectId}/messages/${threadId}`,
  );
}

const postMessageSchema = z.object({
  threadId: z.string().min(1),
  body: z.string().trim().min(1, "Write something first.").max(20000),
});

export async function postMessage(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireUser();

  const parsed = postMessageSchema.safeParse({
    threadId: formData.get("threadId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const { threadId, body } = parsed.data;

  const thread = await assertThreadAccess(actor, threadId);
  if (thread.isResolved) {
    await db
      .update(messageThreads)
      .set({ isResolved: false })
      .where(eq(messageThreads.id, threadId));
  }

  const now = new Date();
  let messageId: string;
  try {
    messageId = await db.transaction(async (tx) => {
      const [msg] = await tx
        .insert(messages)
        .values({ threadId, authorId: actor.id, body })
        .returning({ id: messages.id });

      await tx
        .update(messageThreads)
        .set({
          lastMessageAt: now,
          updatedAt: now,
          messageCount: sql`${messageThreads.messageCount} + 1`,
        })
        .where(eq(messageThreads.id, threadId));

      return msg.id;
    });
  } catch (err) {
    console.error("postMessage failed", err);
    return { error: "Could not send your message. Please try again." };
  }

  await ensureParticipants(threadId, [actor.id]);
  await db
    .update(threadParticipants)
    .set({ lastReadAt: now })
    .where(and(eq(threadParticipants.threadId, threadId), eq(threadParticipants.userId, actor.id)));

  // @mentions
  const handles = Array.from(body.matchAll(/@([\w.+-]+@[\w.-]+\.\w+)/g)).map((m) =>
    m[1].toLowerCase(),
  );
  if (handles.length > 0) {
    const mentioned = await db.query.users.findMany({
      where: and(eq(users.isActive, true)),
      columns: { id: true, email: true, role: true },
    });
    const matched = mentioned.filter((u) => handles.includes(u.email.toLowerCase()));
    // Never allow a customer to be mentioned into an internal thread.
    const allowed = matched.filter(
      (u) => thread.visibility === "SHARED" || u.role !== "CUSTOMER",
    );
    if (allowed.length > 0) {
      await db
        .insert(mentions)
        .values(allowed.map((u) => ({ messageId, userId: u.id })))
        .onConflictDoNothing();
      await ensureParticipants(threadId, allowed.map((u) => u.id));
      await notify({
        userIds: allowed.map((u) => u.id),
        type: "MENTIONED",
        title: `${actor.name ?? actor.email} mentioned you`,
        quote: { author: actor.name ?? actor.email ?? "Someone", text: body.slice(0, 400) },
        linkUrl: linkFor(thread.projectId, threadId, false),
        portalLinkUrl: linkFor(thread.projectId, threadId, true),
        ctaLabel: "Read and reply",
        email: true,
        exceptUserId: actor.id,
      });
    }
  }

  await notify({
    userIds: await threadRecipients(threadId, actor.id),
    type: "MESSAGE_POSTED",
    title: `New reply in “${thread.subject}”`,
    quote: { author: actor.name ?? actor.email ?? "Someone", text: body.slice(0, 400) },
    linkUrl: linkFor(thread.projectId, threadId, false),
    portalLinkUrl: linkFor(thread.projectId, threadId, true),
    ctaLabel: "Read and reply",
    email: thread.visibility === "SHARED",
    teams: isCustomer(actor),
    projectId: thread.projectId ?? undefined,
    exceptUserId: actor.id,
  });

  revalidatePath(linkFor(thread.projectId, threadId, false));
  revalidatePath(linkFor(thread.projectId, threadId, true));
  revalidatePath("/inbox");
  return { ok: true };
}

function linkFor(projectId: string | null, threadId: string, portal: boolean) {
  const base = portal ? "/portal" : "";
  return projectId ? `${base}/projects/${projectId}/messages/${threadId}` : `/inbox/${threadId}`;
}

export async function markThreadRead(threadId: string) {
  const actor = await requireUser();
  await assertThreadAccess(actor, threadId);
  await ensureParticipants(threadId, [actor.id]);
  await db
    .update(threadParticipants)
    .set({ lastReadAt: new Date() })
    .where(and(eq(threadParticipants.threadId, threadId), eq(threadParticipants.userId, actor.id)));
}

export async function setThreadResolved(threadId: string, resolved: boolean) {
  const actor = await requireUser();
  const thread = await assertThreadAccess(actor, threadId);
  await db
    .update(messageThreads)
    .set({ isResolved: resolved, updatedAt: new Date() })
    .where(eq(messageThreads.id, threadId));
  await audit({
    actor,
    action: resolved ? "thread.resolved" : "thread.reopened",
    entityType: "message_thread",
    entityId: threadId,
    summary: thread.subject,
  });
  revalidatePath(linkFor(thread.projectId, threadId, isCustomer(actor)));
}

/**
 * Promote an internal thread to customer-visible. Deliberately one-way:
 * un-sharing does not unsend, so we refuse rather than create a false sense
 * that the customer no longer saw it.
 */
export async function shareThreadWithCustomer(threadId: string) {
  const actor = await requireUser();
  if (!canSeeInternal(actor)) throw new ForbiddenError();
  const thread = await assertThreadAccess(actor, threadId);
  if (thread.visibility === "SHARED") return;

  await db
    .update(messageThreads)
    .set({ visibility: "SHARED", updatedAt: new Date() })
    .where(eq(messageThreads.id, threadId));

  if (thread.projectId) {
    const participants = await defaultThreadParticipants(thread.projectId, "SHARED");
    await ensureParticipants(threadId, participants);
  }

  await audit({
    actor,
    action: "thread.visibility.changed",
    entityType: "message_thread",
    entityId: threadId,
    summary: `“${thread.subject}” made visible to the customer`,
    metadata: { from: "INTERNAL", to: "SHARED" },
  });

  revalidatePath(linkFor(thread.projectId, threadId, false));
}
