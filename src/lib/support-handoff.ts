/**
 * Post go-live “Hand off to Support” automation.
 *
 * Completing that playbook task emails Kori Hale (Director of Support) with
 * outstanding items from the task description, then marks the site COMPLETED
 * so it leaves active Implementation WIP lists. Uses PATH’s existing Resend
 * mailer — no new ESP.
 *
 * Idempotent: `project.supportHandoffAt` is the claim. Completing again does
 * not send a second email. Empty descriptions still notify with a clear
 * empty state. Body text is the task description only (no invented PHI).
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { audit } from "@/lib/audit";
import type { Actor } from "@/lib/authz";
import { layout, plainText, sendEmail, type LayoutOpts } from "@/lib/email";
import { env } from "@/lib/env";
import {
  SUPPORT_HANDOFF_EMAIL,
  SUPPORT_HANDOFF_EMPTY_NOTE,
  SUPPORT_HANDOFF_NAME,
  isHandOffToSupportTask,
  outstandingItemsFromDescription,
} from "@/lib/support-handoff-meta";

export {
  SUPPORT_HANDOFF_EMAIL,
  SUPPORT_HANDOFF_EMPTY_NOTE,
  SUPPORT_HANDOFF_INSTRUCTIONS,
  SUPPORT_HANDOFF_NAME,
  SUPPORT_HANDOFF_TASK_TITLE,
  isHandOffToSupportTask,
  outstandingItemsFromDescription,
} from "@/lib/support-handoff-meta";

export type SupportHandoffMailer = typeof sendEmail;

export type SupportHandoffResult =
  | { applied: false; reason: "not-handoff-task" }
  | { applied: false; reason: "already-handed-off"; projectId: string }
  | {
      applied: true;
      projectId: string;
      emailed: boolean;
      to: string;
      outstandingListed: boolean;
    };

export type SupportHandoffEmailInput = {
  projectName: string;
  projectCode: string;
  customerName: string | null;
  completedBy: string;
  outstanding: string | null;
  projectUrl: string;
};

export function supportHandoffLayout(input: SupportHandoffEmailInput): LayoutOpts {
  const outstandingListed = Boolean(input.outstanding);
  return {
    heading: `${input.projectCode} handed off to Support`,
    paragraphs: [
      `${input.projectName} (${input.projectCode}) is out of implementation and handed off to Support.`,
      outstandingListed
        ? "Outstanding items from the Hand off to Support task:"
        : SUPPORT_HANDOFF_EMPTY_NOTE,
    ],
    quote: outstandingListed
      ? { author: "Hand off to Support task", text: input.outstanding as string }
      : undefined,
    facts: [
      { name: "Project", value: `${input.projectName} (${input.projectCode})` },
      { name: "Customer", value: input.customerName ?? "—" },
      { name: "Completed by", value: input.completedBy },
      { name: "Handoff to", value: `${SUPPORT_HANDOFF_NAME} <${SUPPORT_HANDOFF_EMAIL}>` },
    ],
    cta: { label: "Open in PATH", url: input.projectUrl },
    footer:
      "Implementation logistics only. This message is built from the Hand off to Support task description and contains no patient information.",
  };
}

export function supportHandoffEmailContent(input: SupportHandoffEmailInput): {
  to: string;
  subject: string;
  html: string;
  text: string;
} {
  const opts = supportHandoffLayout(input);
  return {
    to: SUPPORT_HANDOFF_EMAIL,
    subject: `[PATH] Hand off to Support: ${input.projectCode} — ${input.projectName}`,
    html: layout(opts),
    text: plainText(opts),
  };
}

export async function applySupportHandoffOnComplete(opts: {
  projectId: string;
  taskId: string;
  taskTitle: string;
  taskDescription: string | null;
  actor: Actor | null;
  send?: SupportHandoffMailer;
}): Promise<SupportHandoffResult> {
  if (!isHandOffToSupportTask(opts.taskTitle)) {
    return { applied: false, reason: "not-handoff-task" };
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, opts.projectId),
    columns: {
      id: true,
      name: true,
      code: true,
      status: true,
      onboarded: true,
      actualGoLiveDate: true,
      supportHandoffAt: true,
    },
    with: { customerAccount: { columns: { name: true } } },
  });
  if (!project) return { applied: false, reason: "not-handoff-task" };

  if (project.supportHandoffAt) {
    if (project.status !== "COMPLETED") {
      await markProjectOutOfImplementation(project.id, {
        stamp: project.supportHandoffAt,
        actualGoLiveDate: project.actualGoLiveDate,
      });
    }
    return { applied: false, reason: "already-handed-off", projectId: project.id };
  }

  const outstanding = outstandingItemsFromDescription(opts.taskDescription);
  const completedBy = opts.actor?.name || opts.actor?.email || "PATH staff";
  const mail = supportHandoffEmailContent({
    projectName: project.name,
    projectCode: project.code,
    customerName: project.customerAccount?.name ?? null,
    completedBy,
    outstanding,
    projectUrl: `${env.APP_URL}/projects/${project.id}`,
  });

  const send = opts.send ?? sendEmail;
  await send({
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });

  const now = new Date();
  await markProjectOutOfImplementation(project.id, {
    stamp: now,
    actualGoLiveDate: project.actualGoLiveDate,
  });

  await audit({
    actor: opts.actor,
    action: "project.support_handoff",
    entityType: "project",
    entityId: project.id,
    summary: `${project.code}: handed off to Support`,
    metadata: {
      taskId: opts.taskId,
      to: SUPPORT_HANDOFF_EMAIL,
      outstandingListed: Boolean(outstanding),
    },
  });

  return {
    applied: true,
    projectId: project.id,
    emailed: true,
    to: SUPPORT_HANDOFF_EMAIL,
    outstandingListed: Boolean(outstanding),
  };
}

async function markProjectOutOfImplementation(
  projectId: string,
  opts: { stamp: Date; actualGoLiveDate: Date | null },
) {
  await db
    .update(projects)
    .set({
      status: "COMPLETED",
      onboarded: true,
      supportHandoffAt: opts.stamp,
      ...(opts.actualGoLiveDate ? {} : { actualGoLiveDate: opts.stamp }),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));
}
