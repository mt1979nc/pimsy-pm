import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { messageThreads, threadParticipants } from "@/db/schema";
import { buildFixture } from "./fixtures";
import { listProjectThreads, unreadThreadCount } from "@/lib/threads";
import { isUnread, partitionThreads } from "@/lib/thread-state";

const dbOk = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!dbOk)("thread unread + open/resolved (postgres)", () => {
  let f: Awaited<ReturnType<typeof buildFixture>>;

  beforeAll(async () => {
    f = await buildFixture();
  });

  it("counts a never-opened participant cursor as unread", async () => {
    const threads = await listProjectThreads(f.actors.specialist, f.projects.a);
    const shared = threads.find((t) => t.id === f.threads.shared);
    expect(shared).toBeTruthy();
    expect(isUnread(shared!, f.actors.specialist.id)).toBe(true);
  });

  it("treats a manager who can see the project but has no participant row as unread", async () => {
    const threads = await listProjectThreads(f.actors.manager, f.projects.a);
    const shared = threads.find((t) => t.id === f.threads.shared);
    expect(shared).toBeTruthy();
    expect(shared!.participants.some((p) => p.userId === f.actors.manager.id)).toBe(false);
    expect(isUnread(shared!, f.actors.manager.id)).toBe(true);
  });

  it("clears unread after lastReadAt catches lastMessageAt", async () => {
    const now = new Date();
    await db
      .update(messageThreads)
      .set({ lastMessageAt: now })
      .where(eq(messageThreads.id, f.threads.shared));
    await db
      .update(threadParticipants)
      .set({ lastReadAt: now })
      .where(
        and(
          eq(threadParticipants.threadId, f.threads.shared),
          eq(threadParticipants.userId, f.actors.specialist.id),
        ),
      );

    const threads = await listProjectThreads(f.actors.specialist, f.projects.a);
    const shared = threads.find((t) => t.id === f.threads.shared)!;
    expect(isUnread(shared, f.actors.specialist.id)).toBe(false);

    await db
      .update(threadParticipants)
      .set({ lastReadAt: null })
      .where(
        and(
          eq(threadParticipants.threadId, f.threads.shared),
          eq(threadParticipants.userId, f.actors.specialist.id),
        ),
      );
  });

  it("excludes resolved topics from the nav unread badge", async () => {
    await db
      .update(threadParticipants)
      .set({ lastReadAt: null })
      .where(
        and(
          eq(threadParticipants.threadId, f.threads.internal),
          eq(threadParticipants.userId, f.actors.specialist.id),
        ),
      );
    await db
      .update(messageThreads)
      .set({ isResolved: false })
      .where(eq(messageThreads.id, f.threads.internal));

    const before = await unreadThreadCount(f.actors.specialist);

    await db
      .update(messageThreads)
      .set({ isResolved: true })
      .where(eq(messageThreads.id, f.threads.internal));

    const after = await unreadThreadCount(f.actors.specialist);
    expect(after).toBe(before - 1);

    const threads = await listProjectThreads(f.actors.specialist, f.projects.a);
    const internal = threads.find((t) => t.id === f.threads.internal)!;
    expect(internal.isResolved).toBe(true);
    expect(isUnread(internal, f.actors.specialist.id)).toBe(true);
    const { resolved, unreadOpen } = partitionThreads(threads, f.actors.specialist.id);
    expect(resolved.some((t) => t.id === f.threads.internal)).toBe(true);
    expect(unreadOpen.some((t) => t.id === f.threads.internal)).toBe(false);

    await db
      .update(messageThreads)
      .set({ isResolved: false })
      .where(eq(messageThreads.id, f.threads.internal));
  });

  it("customers still only see SHARED threads when partitioning", async () => {
    const threads = await listProjectThreads(f.actors.customerA, f.projects.a);
    expect(threads.every((t) => t.visibility === "SHARED")).toBe(true);
    expect(threads.map((t) => t.id)).not.toContain(f.threads.internal);
  });
});
