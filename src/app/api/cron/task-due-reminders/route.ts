import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { runTaskDueReminders } from "@/lib/run-task-due-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cronSecret(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (bearer?.[1]) return bearer[1].trim();
  const named = req.headers.get("x-cron-secret")?.trim();
  return named || null;
}

/**
 * Assignee due-soon / overdue reminders (P1-G). Auth: Bearer CRON_SECRET
 * (or x-cron-secret). 404 when the secret is unset or wrong — same
 * convention as /api/prism/snapshot.
 *
 * Does not send batched customer digest mail (that is PR #39). This job
 * only writes per-assignee in-app notifications (and immediate email per
 * existing alert prefs).
 */
async function handle(req: Request) {
  const configured = env.CRON_SECRET.trim();
  const offered = cronSecret(req);
  if (!configured || !offered || offered !== configured) {
    return new NextResponse("Not found", { status: 404 });
  }

  const result = await runTaskDueReminders();
  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
