import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import type { Actor } from "./authz";

type AuditArgs = {
  actor: Actor | null;
  action: string;
  entityType: string;
  entityId: string;
  summary?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Append-only activity record. Visibility changes in particular are always
 * logged — if content ever reaches a customer unexpectedly, this is the trail
 * that explains when and by whom it was shared.
 */
export async function audit({
  actor,
  action,
  entityType,
  entityId,
  summary,
  metadata,
}: AuditArgs) {
  try {
    await db.insert(auditLogs).values({
      actorId: actor?.id ?? null,
      action,
      entityType,
      entityId,
      summary: summary ?? null,
      metadata: metadata ?? null,
    });
  } catch (err) {
    // Never let audit failures break the user's action.
    console.error("audit log failed", { action, entityType, entityId, err });
  }
}
