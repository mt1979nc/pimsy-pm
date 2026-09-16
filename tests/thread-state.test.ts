import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isUnread,
  partitionThreads,
  nextWaitingOnForReply,
  nextWaitingOnForReopen,
} from "@/lib/thread-state";

const t = (
  overrides: Partial<{
    lastMessageAt: Date | string;
    isResolved: boolean;
    participants: { userId: string; lastReadAt: Date | string | null }[];
  }> = {},
) => ({
  lastMessageAt: new Date("2026-09-16T12:00:00.000Z"),
  isResolved: false,
  participants: [] as { userId: string; lastReadAt: Date | string | null }[],
  ...overrides,
});

describe("isUnread", () => {
  it("treats a missing participant row as unread", () => {
    expect(isUnread(t(), "user-1")).toBe(true);
  });

  it("treats a null lastReadAt cursor as unread", () => {
    expect(
      isUnread(t({ participants: [{ userId: "user-1", lastReadAt: null }] }), "user-1"),
    ).toBe(true);
  });

  it("is unread when lastMessageAt is after lastReadAt", () => {
    expect(
      isUnread(
        t({
          lastMessageAt: new Date("2026-09-16T12:00:01.000Z"),
          participants: [{ userId: "user-1", lastReadAt: new Date("2026-09-16T12:00:00.000Z") }],
        }),
        "user-1",
      ),
    ).toBe(true);
  });

  it("is read when lastReadAt equals lastMessageAt", () => {
    const at = new Date("2026-09-16T12:00:00.000Z");
    expect(
      isUnread(t({ lastMessageAt: at, participants: [{ userId: "user-1", lastReadAt: at }] }), "user-1"),
    ).toBe(false);
  });

  it("is read when lastReadAt is after lastMessageAt", () => {
    expect(
      isUnread(
        t({
          lastMessageAt: new Date("2026-09-16T12:00:00.000Z"),
          participants: [{ userId: "user-1", lastReadAt: new Date("2026-09-16T12:00:01.000Z") }],
        }),
        "user-1",
      ),
    ).toBe(false);
  });

  it("compares ISO strings the same way as Date objects", () => {
    expect(
      isUnread(
        t({
          lastMessageAt: "2026-09-16T12:00:00.000Z",
          participants: [{ userId: "user-1", lastReadAt: "2026-09-16T11:59:59.000Z" }],
        }),
        "user-1",
      ),
    ).toBe(true);
  });
});

describe("partitionThreads", () => {
  it("keeps open unread / open read / resolved without mixing topics", () => {
    const threads = [
      t({
        isResolved: false,
        participants: [{ userId: "me", lastReadAt: null }],
      }),
      t({
        isResolved: false,
        lastMessageAt: new Date("2026-09-16T11:00:00.000Z"),
        participants: [{ userId: "me", lastReadAt: new Date("2026-09-16T12:00:00.000Z") }],
      }),
      t({
        isResolved: true,
        participants: [{ userId: "me", lastReadAt: null }],
      }),
    ];
    const { unreadOpen, readOpen, resolved, open } = partitionThreads(threads, "me");
    expect(unreadOpen).toHaveLength(1);
    expect(readOpen).toHaveLength(1);
    expect(open).toHaveLength(2);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.isResolved).toBe(true);
  });
});

describe("waiting-on after reply / reopen", () => {
  it("does not set waiting-on on INTERNAL threads", () => {
    expect(
      nextWaitingOnForReply({
        visibility: "INTERNAL",
        actorIsCustomer: false,
        wasResolved: false,
        currentWaitingOn: "UNKNOWN",
      }),
    ).toBeNull();
    expect(nextWaitingOnForReopen({ visibility: "INTERNAL", actorIsCustomer: false })).toBeNull();
  });

  it("flips SHARED staff reply to CUSTOMER and customer reply to PIMSY", () => {
    expect(
      nextWaitingOnForReply({
        visibility: "SHARED",
        actorIsCustomer: false,
        wasResolved: false,
        currentWaitingOn: "PIMSY",
      }),
    ).toEqual({ waitingOn: "CUSTOMER" });
    expect(
      nextWaitingOnForReply({
        visibility: "SHARED",
        actorIsCustomer: true,
        wasResolved: false,
        currentWaitingOn: "CUSTOMER",
      }),
    ).toEqual({ waitingOn: "PIMSY" });
  });

  it("does not bump waiting-on when the ball is already on the other side", () => {
    expect(
      nextWaitingOnForReply({
        visibility: "SHARED",
        actorIsCustomer: false,
        wasResolved: false,
        currentWaitingOn: "CUSTOMER",
      }),
    ).toBeNull();
  });

  it("resets waiting-on when a resolved SHARED topic is reopened", () => {
    expect(
      nextWaitingOnForReply({
        visibility: "SHARED",
        actorIsCustomer: true,
        wasResolved: true,
        currentWaitingOn: "CUSTOMER",
      }),
    ).toEqual({ waitingOn: "PIMSY" });
    expect(nextWaitingOnForReopen({ visibility: "SHARED", actorIsCustomer: false })).toEqual({
      waitingOn: "CUSTOMER",
    });
  });
});

describe("thread-state stays off Postgres", () => {
  it("does not import @/db or drizzle", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/thread-state.ts"), "utf8");
    expect(src).not.toMatch(/from ["']@\/db["']/);
    expect(src).not.toMatch(/drizzle-orm/);
    expect(src).not.toMatch(/from ["']postgres["']/);
  });

  it("keeps the thread list on the client-safe helper", () => {
    const src = readFileSync(resolve(process.cwd(), "src/components/thread-list.tsx"), "utf8");
    expect(src).toMatch(/from ["']@\/lib\/thread-state["']/);
    expect(src).not.toMatch(/from ["']@\/lib\/threads["']/);
    expect(src).not.toMatch(/from ["']@\/db["']/);
  });

  it("marks a thread read after paint, not during RSC render", () => {
    const pages = [
      "src/app/(app)/projects/[id]/messages/[threadId]/page.tsx",
      "src/app/(app)/inbox/[threadId]/page.tsx",
      "src/app/portal/projects/[id]/messages/[threadId]/page.tsx",
    ];
    for (const rel of pages) {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      expect(src, rel).not.toMatch(/await markThreadRead\(/);
      expect(src, rel).toMatch(/<MarkThreadRead /);
    }
  });
});
