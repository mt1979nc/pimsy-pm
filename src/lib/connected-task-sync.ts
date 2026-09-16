/**
 * Live connected-task sync. Completing (or N/A) one copy updates every other
 * task on the same project that shares the connect/overlap key.
 *
 * Server-only — imports the Postgres client. Client UI reads `connectKey`
 * as a string prop and must not import this module.
 */

import { and, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { connectedKeyOf } from "@/lib/connected-tasks";

export type ConnectedPeer = {
  id: string;
  title: string;
  phaseName: string | null;
  status: string;
  connectKey: string;
};

function keyClause(projectId: string, key: string) {
  return and(eq(tasks.projectId, projectId), or(eq(tasks.connectKey, key), eq(tasks.overlapKey, key)));
}

export async function listConnectedPeers(opts: {
  projectId: string;
  taskId: string;
  connectKey?: string | null;
  overlapKey?: string | null;
  title?: string | null;
}): Promise<ConnectedPeer[]> {
  const key = connectedKeyOf(opts);
  if (!key) return [];
  const rows = await db.query.tasks.findMany({
    where: and(keyClause(opts.projectId, key), ne(tasks.id, opts.taskId)),
    columns: { id: true, title: true, status: true, connectKey: true, overlapKey: true },
    with: { phase: { columns: { name: true } } },
  });
  return rows
    .filter((r) => connectedKeyOf(r) === key)
    .map((r) => ({
      id: r.id,
      title: r.title,
      phaseName: r.phase?.name ?? null,
      status: r.status,
      connectKey: key,
    }));
}

export async function connectedPeerIds(opts: {
  projectId: string;
  taskId: string;
  connectKey?: string | null;
  overlapKey?: string | null;
  title?: string | null;
}): Promise<string[]> {
  const peers = await listConnectedPeers(opts);
  return peers.map((p) => p.id);
}

/** Copy status + completedAt onto connected peers. Does not notify or audit. */
export async function syncConnectedTaskStatus(opts: {
  projectId: string;
  taskId: string;
  connectKey?: string | null;
  overlapKey?: string | null;
  title?: string | null;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "IN_REVIEW" | "DONE" | "CANCELLED";
  completedAt: Date | null;
}): Promise<string[]> {
  const ids = await connectedPeerIds(opts);
  if (ids.length === 0) return [];
  await db
    .update(tasks)
    .set({
      status: opts.status,
      completedAt: opts.completedAt,
      updatedAt: new Date(),
    })
    .where(inArray(tasks.id, ids));
  return ids;
}

/** Include connected peers (and their children) when flipping N/A. */
export async function expandIdsWithConnectedPeers(
  projectId: string,
  seedIds: string[],
  source: {
    id: string;
    connectKey?: string | null;
    overlapKey?: string | null;
    title?: string | null;
  },
): Promise<string[]> {
  const peerIds = await connectedPeerIds({
    projectId,
    taskId: source.id,
    connectKey: source.connectKey,
    overlapKey: source.overlapKey,
    title: source.title,
  });
  const all = new Set(seedIds);
  for (const id of peerIds) all.add(id);
  if (peerIds.length > 0) {
    const children = await db.query.tasks.findMany({
      where: inArray(tasks.parentTaskId, peerIds),
      columns: { id: true },
    });
    for (const c of children) all.add(c.id);
  }
  return [...all];
}
