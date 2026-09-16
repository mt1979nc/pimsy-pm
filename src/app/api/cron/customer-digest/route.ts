import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { runCustomerDigest } from "@/lib/run-customer-digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Due-soon scan + Resend can exceed the default serverless budget. */
export const maxDuration = 60;

function cronSecret(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (bearer?.[1]) return bearer[1].trim();
  const named = req.headers.get("x-cron-secret")?.trim();
  return named || null;
}

/**
 * Customer email digest. Auth: Bearer CRON_SECRET (or x-cron-secret).
 * 404 when the secret is unset or wrong — same convention as /api/prism/snapshot.
 *
 * Azure: Logic App / Timer every 15 minutes. See azure/README.md.
 */
async function handle(req: Request) {
  const configured = env.CRON_SECRET.trim();
  const offered = cronSecret(req);
  if (!configured || !offered || offered !== configured) {
    return new NextResponse("Not found", { status: 404 });
  }

  const result = await runCustomerDigest();
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
