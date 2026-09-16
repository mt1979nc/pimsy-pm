/**
 * Persist a go-live slip: insert slip_event, audit, rescale open work.
 *
 * Shared by project Settings, Prism engagement edit, and the weekly-meeting
 * roster so the three UIs cannot diverge. A slip is a schedule push — cause
 * or note without a date move is rejected by `resolveSlipPush`.
 *
 * Server-only (Postgres). Do not import from `"use client"` files.
 */

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { projects, slipEvents } from "@/db/schema";
import { audit } from "@/lib/audit";
import type { Actor } from "@/lib/authz";
import { fmtDate, parseDateInput, toDateInput } from "@/lib/dates";
import { resolveSlipPush, shouldCascadeReschedule, cascadeRescheduleProject } from "@/lib/project-timeline";

export type SlipSource = "settings" | "management" | "weekly";

export type ResolvedSlip = {
  nextGoLive: Date;
  fromDate: Date;
  days: number;
  cause: "CUSTOMER" | "PIMSY" | null;
  note: string | null;
};

export function formatSlipRecordedMessage(days: number, fromDate: Date, toDate: Date): string {
  const sign = days > 0 ? "+" : "";
  return `Slip recorded: go-live moved ${sign}${days}d (${fmtDate(fromDate)} → ${fmtDate(toDate)}).`;
}

export const SLIP_REQUIRES_PUSH_ERROR =
  "A slip must push the go-live: enter a new target date or slip days (+N). Cause/note alone is not a slip.";

export function slipFieldsFromForm(formData: FormData): {
  requestedGoLive: Date | null;
  slipDaysRaw: string | undefined;
  slipCause: string | undefined;
  slipNote: string | undefined;
} {
  const targetGoLiveDate = formData.get("targetGoLiveDate")?.toString();
  return {
    requestedGoLive: targetGoLiveDate ? parseDateInput(targetGoLiveDate) : null,
    slipDaysRaw: formData.get("slipDays")?.toString(),
    slipCause: formData.get("slipCause")?.toString(),
    slipNote: formData.get("slipNote")?.toString(),
  };
}

/** Insert the slip event and write the audit row. Callers rescale dates. */
export async function commitGoLiveSlip(opts: {
  actor: Actor;
  project: {
    id: string;
    code: string;
  };
  slip: ResolvedSlip;
  source: SlipSource;
}): Promise<void> {
  const { actor, project, slip, source } = opts;

  await db.insert(slipEvents).values({
    projectId: project.id,
    fromDate: slip.fromDate,
    toDate: slip.nextGoLive,
    days: slip.days,
    cause: slip.cause,
    note: slip.note,
    createdById: actor.id,
  });

  await audit({
    actor,
    action: "project.go_live.slipped",
    entityType: "project",
    entityId: project.id,
    summary: `${project.code}: go-live moved ${slip.days > 0 ? "+" : ""}${slip.days}d`,
    metadata: { days: slip.days, cause: slip.cause, source },
  });
}

/**
 * Dedicated Record-slip path: resolve, require a real push, persist go-live +
 * event + cascade. Used by Settings and the weekly-meeting roster.
 */
export async function applyRequiredProjectSlip(opts: {
  actor: Actor;
  projectId: string;
  requestedGoLive: Date | null;
  slipDaysRaw: string | undefined;
  slipCause: string | undefined;
  slipNote: string | undefined;
  source: SlipSource;
}): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      slipped: true;
      nextGoLive: Date;
      days: number;
      message: string;
      targetGoLiveDate: string;
    }
> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, opts.projectId),
  });
  if (!project || project.archivedAt) {
    return { ok: false, error: "Project not found." };
  }

  const previousGoLive = project.targetGoLiveDate ? new Date(project.targetGoLiveDate) : null;
  const slip = resolveSlipPush({
    currentGoLive: previousGoLive,
    requestedGoLive: opts.requestedGoLive ?? previousGoLive,
    slipDaysRaw: opts.slipDaysRaw,
    slipCause: opts.slipCause,
    slipNote: opts.slipNote,
  });
  if (!slip.ok) return { ok: false, error: slip.error };
  if (!slip.slipped) {
    return { ok: false, error: SLIP_REQUIRES_PUSH_ERROR };
  }

  await db
    .update(projects)
    .set({
      targetGoLiveDate: slip.nextGoLive,
      ...(project.initialGoLiveDate === null && slip.nextGoLive
        ? { initialGoLiveDate: slip.nextGoLive }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, opts.projectId));

  await commitGoLiveSlip({
    actor: opts.actor,
    project: {
      id: project.id,
      code: project.code,
    },
    slip: {
      nextGoLive: slip.nextGoLive,
      fromDate: slip.fromDate,
      days: slip.days,
      cause: slip.cause,
      note: slip.note,
    },
    source: opts.source,
  });

  const kickoff = project.startDate ? new Date(project.startDate) : null;
  const cascadePlan = shouldCascadeReschedule({
    previousKickoff: kickoff,
    previousGoLive,
    nextKickoff: kickoff,
    nextGoLive: slip.nextGoLive,
  });
  if (cascadePlan.cascade && cascadePlan.next) {
    await cascadeRescheduleProject({
      projectId: project.id,
      templateId: project.templateId,
      previous: cascadePlan.previous,
      next: cascadePlan.next,
    });
  }

  return {
    ok: true,
    slipped: true,
    nextGoLive: slip.nextGoLive,
    days: slip.days,
    message: formatSlipRecordedMessage(slip.days, slip.fromDate, slip.nextGoLive),
    targetGoLiveDate: toDateInput(slip.nextGoLive),
  };
}
