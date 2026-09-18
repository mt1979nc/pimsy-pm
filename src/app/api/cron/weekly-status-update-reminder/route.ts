import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { runWeeklyStatusUpdateReminder } from "@/lib/run-weekly-status-update-reminder";

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
 * Thursday Imp Spec account-update reminder. Auth: Bearer CRON_SECRET
 * (or x-cron-secret). 404 when the secret is unset or wrong — same
 * convention as /api/cron/customer-digest.
 *
 * Safe to call from the existing 15-minute Logic Apps; the job no-ops
 * except Thursday at/after 08:00 in the lead’s zone (default Chicago).
 */
async function handle(req: Request) {
  const configured = env.CRON_SECRET.trim();
  const offered = cronSecret(req);
  if (!configured || !offered || offered !== configured) {
    return new NextResponse("Not found", { status: 404 });
  }

  const result = await runWeeklyStatusUpdateReminder();
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
