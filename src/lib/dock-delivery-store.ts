/**
 * Server and CLI only. Imports the database. Do not import this from a
 * client component — the Dock delivery table takes plain rows instead.
 */

import { desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { dockDeliverySites, dockDeliverySnapshots, dockDeliveryThreads, projects } from "@/db/schema";
import { createId } from "@/lib/id";
import {
  DOCK_DELIVERY_KEEP_SNAPSHOTS,
  buildDockDeliverySnapshot,
  isDockDeliveryStale,
  matchDockAcronym,
  type DockDeliveryBuildResult,
  type DockDeliveryDraft,
  type DockDeliveryTableRow,
  type DockDeliveryThreadDraft,
} from "@/lib/dock-delivery";

export type DockDeliveryPersistStatus = "applied" | "refreshed" | "unchanged" | "dry-run";

export type DockDeliveryPersistResult =
  | {
      ok: true;
      status: DockDeliveryPersistStatus;
      snapshotId: string | null;
      retrievedAt: string;
      contentHash: string;
      sites: number;
      threads: number;
      overdueTaskSum: number | null;
      openThreads: number;
      waitingOnPimsy: number;
      waitingOnCustomer: number;
      waitingUnknown: number;
      unlistedThreads: number;
      excluded: DockDeliveryDraft["totals"]["excluded"];
    }
  | { ok: false; error: string };

export type DockDeliveryBoard = {
  snapshotId: string;
  retrievedAt: string;
  stale: boolean;
  sourceUrl: string | null;
  counts: {
    sites: number;
    overdueTaskSum: number | null;
    overdueUnknownSites: number;
    openThreads: number;
    waitingOnPimsy: number;
    waitingOnCustomer: number;
    waitingUnknown: number;
  };
  rows: DockDeliveryTableRow[];
};

function resultFromDraft(
  draft: DockDeliveryDraft,
  status: DockDeliveryPersistStatus,
  snapshotId: string | null,
): DockDeliveryPersistResult {
  return {
    ok: true,
    status,
    snapshotId,
    retrievedAt: draft.retrievedAt.toISOString(),
    contentHash: draft.contentHash,
    sites: draft.sites.length,
    threads: draft.threads.length,
    overdueTaskSum: draft.totals.overdueTaskSum,
    openThreads: draft.totals.openThreads,
    waitingOnPimsy: draft.totals.waitingOnPimsy,
    waitingOnCustomer: draft.totals.waitingOnCustomer,
    waitingUnknown: draft.totals.waitingUnknown,
    unlistedThreads: draft.totals.unlistedThreads,
    excluded: draft.totals.excluded,
  };
}

export function previewDockDelivery(wip: unknown, threads: unknown, now = new Date()): DockDeliveryPersistResult {
  const built = buildDockDeliverySnapshot(wip, threads, { now });
  if (!built.ok) return built;
  return resultFromDraft(built.draft, "dry-run", null);
}

async function trimSnapshots(tx: Pick<typeof db, "select" | "delete">) {
  const rows = await tx
    .select({ id: dockDeliverySnapshots.id })
    .from(dockDeliverySnapshots)
    .orderBy(desc(dockDeliverySnapshots.createdAt));
  const drop = rows.slice(DOCK_DELIVERY_KEEP_SNAPSHOTS).map((row) => row.id);
  if (drop.length === 0) return;
  await tx.delete(dockDeliverySnapshots).where(inArray(dockDeliverySnapshots.id, drop));
}

/**
 * Insert a snapshot and make it current. Same content hash as the current
 * row does not insert another copy. A newer retrievedAt on that same content
 * updates Last refreshed. Snapshots beyond the keep window are deleted.
 */
export async function persistDockDeliverySnapshot(draft: DockDeliveryDraft): Promise<DockDeliveryPersistResult> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: dockDeliverySnapshots.id,
        contentHash: dockDeliverySnapshots.contentHash,
        retrievedAt: dockDeliverySnapshots.retrievedAt,
      })
      .from(dockDeliverySnapshots)
      .orderBy(desc(dockDeliverySnapshots.createdAt))
      .limit(1);

    if (current && current.contentHash === draft.contentHash) {
      const currentRetrieved = new Date(current.retrievedAt).getTime();
      if (draft.retrievedAt.getTime() > currentRetrieved) {
        await tx
          .update(dockDeliverySnapshots)
          .set({
            retrievedAt: draft.retrievedAt,
            wipRetrievedAt: draft.wipRetrievedAt,
            threadsRetrievedAt: draft.threadsRetrievedAt,
            sourceUrl: draft.sourceUrl,
            filters: (draft.filters ?? null) as Record<string, unknown> | null,
            totals: draft.totals as unknown as Record<string, unknown>,
            createdAt: new Date(),
          })
          .where(eq(dockDeliverySnapshots.id, current.id));
        return resultFromDraft(draft, "refreshed", current.id);
      }
      return resultFromDraft(draft, "unchanged", current.id);
    }

    const snapshotId = createId();
    await tx.insert(dockDeliverySnapshots).values({
      id: snapshotId,
      retrievedAt: draft.retrievedAt,
      wipRetrievedAt: draft.wipRetrievedAt,
      threadsRetrievedAt: draft.threadsRetrievedAt,
      sourceUrl: draft.sourceUrl,
      filters: (draft.filters ?? null) as Record<string, unknown> | null,
      totals: draft.totals as unknown as Record<string, unknown>,
      contentHash: draft.contentHash,
      createdAt: new Date(),
    });

    if (draft.sites.length > 0) {
      await tx.insert(dockDeliverySites).values(
        draft.sites.map((site) => ({
          id: createId(),
          snapshotId,
          acronym: site.acronym,
          name: site.name,
          owners: site.owners,
          targetEnd: site.targetEnd,
          actualEnd: site.actualEnd,
          overdueTaskCount: site.overdueTaskCount,
          status: site.status,
          acronymInferred: site.acronymInferred,
          waitingOnPimsy: site.waitingOnPimsy,
          waitingOnCustomer: site.waitingOnCustomer,
          waitingUnknown: site.waitingUnknown,
          openThreadCount: site.openThreadCount,
        })),
      );
    }

    if (draft.threads.length > 0) {
      const threadRows = draft.threads.map((thread: DockDeliveryThreadDraft) => ({
        id: createId(),
        snapshotId,
        acronym: thread.acronym,
        dockThreadKey: thread.dockThreadKey,
        type: thread.type,
        title: thread.title,
        waitingOn: thread.waitingOn,
        lastPoster: thread.lastPoster,
        lastActivity: thread.lastActivity,
        snippet: thread.snippet,
        url: thread.url,
        internal: thread.internal,
      }));
      await tx.insert(dockDeliveryThreads).values(threadRows);
    }

    await trimSnapshots(tx);
    return resultFromDraft(draft, "applied", snapshotId);
  });
}

export async function ingestDockDelivery(wip: unknown, threads: unknown, now = new Date()): Promise<DockDeliveryPersistResult> {
  const built: DockDeliveryBuildResult = buildDockDeliverySnapshot(wip, threads, { now });
  if (!built.ok) return built;
  return persistDockDeliverySnapshot(built.draft);
}

export async function loadDockDeliveryBoard(now = new Date()): Promise<DockDeliveryBoard | null> {
  const snapshot = await db.query.dockDeliverySnapshots.findFirst({
    orderBy: [desc(dockDeliverySnapshots.createdAt)],
    with: {
      sites: true,
      threads: true,
    },
  });
  if (!snapshot) return null;

  const pathProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      code: projects.code,
      crmAcronym: projects.crmAcronym,
      status: projects.status,
      archivedAt: projects.archivedAt,
    })
    .from(projects);

  const threadsByAcronym = new Map<string, DockDeliveryTableRow["threads"]>();
  for (const thread of snapshot.threads) {
    const list = threadsByAcronym.get(thread.acronym) ?? [];
    list.push({
      key: thread.dockThreadKey,
      type: thread.type,
      title: thread.title,
      waitingOn: thread.waitingOn === "pimsy" || thread.waitingOn === "customer" ? thread.waitingOn : "unknown",
      lastPoster: thread.lastPoster,
      lastActivity: thread.lastActivity,
      snippet: thread.snippet,
      url: thread.url,
      internal: thread.internal,
    });
    threadsByAcronym.set(thread.acronym, list);
  }

  const rows: DockDeliveryTableRow[] = snapshot.sites.map((site) => ({
    acronym: site.acronym,
    name: site.name,
    owners: Array.isArray(site.owners) ? site.owners.filter((owner): owner is string => typeof owner === "string") : [],
    targetEnd: site.targetEnd,
    actualEnd: site.actualEnd,
    overdueTaskCount: site.overdueTaskCount,
    status: site.status,
    acronymInferred: site.acronymInferred,
    waitingOnPimsy: site.waitingOnPimsy,
    waitingOnCustomer: site.waitingOnCustomer,
    waitingUnknown: site.waitingUnknown,
    openThreadCount: site.openThreadCount,
    path: matchDockAcronym(site.acronym, pathProjects),
    threads: (threadsByAcronym.get(site.acronym) ?? []).sort((a, b) => a.title.localeCompare(b.title)),
  }));

  const knownOverdue = rows.map((row) => row.overdueTaskCount).filter((n): n is number => n != null);
  return {
    snapshotId: snapshot.id,
    retrievedAt: new Date(snapshot.retrievedAt).toISOString(),
    stale: isDockDeliveryStale(snapshot.retrievedAt, now),
    sourceUrl: snapshot.sourceUrl,
    counts: {
      sites: rows.length,
      overdueTaskSum: knownOverdue.length > 0 ? knownOverdue.reduce((sum, n) => sum + n, 0) : null,
      overdueUnknownSites: rows.filter((row) => row.overdueTaskCount == null).length,
      openThreads: rows.reduce((sum, row) => sum + row.openThreadCount, 0),
      waitingOnPimsy: rows.reduce((sum, row) => sum + row.waitingOnPimsy, 0),
      waitingOnCustomer: rows.reduce((sum, row) => sum + row.waitingOnCustomer, 0),
      waitingUnknown: rows.reduce((sum, row) => sum + row.waitingUnknown, 0),
    },
    rows,
  };
}
