import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { normalizeDailyBrief } from "@/lib/daily-brief";
import { upsertDailyFact } from "@/lib/daily-brief-store";
import { dockDeliveryAuthorized } from "@/lib/dock-delivery-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One morning snapshot. Auth: Bearer DAILY_BRIEF_INGEST_SECRET, or the Dock
 * ingest secret when that is the only token set. Unset or wrong → 404.
 * Body: { date, dockWip, dockThreads, prism, zendesk, dryRun }.
 * Does not read Dock, Zendesk, or Prism SQL.
 */
export async function POST(req: Request) {
  if (!dockDeliveryAuthorized(req.headers.get("authorization"), env.DAILY_BRIEF_INGEST_SECRET)) {
    return new NextResponse("Not found", { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON." }, { status: 400 });
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  if (!record) return NextResponse.json({ ok: false, error: "Body must be a JSON object." }, { status: 400 });

  const normalized = normalizeDailyBrief({
    date: typeof record.date === "string" ? record.date : null,
    dockWip: record.dockWip ?? record.wip,
    dockThreads: record.dockThreads ?? record.threads,
    prism: record.prism,
    zendesk: record.zendesk,
  });
  if (!normalized.ok) {
    return NextResponse.json(normalized, { status: 400 });
  }
  if (record.dryRun === true) {
    return NextResponse.json({ ok: true, dryRun: true, fact: normalized.fact });
  }
  await upsertDailyFact(normalized.fact);
  return NextResponse.json({ ok: true, factDate: normalized.fact.factDate, gap: normalized.fact.gap });
}
