import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { buildDockDeliverySnapshot } from "@/lib/dock-delivery";
import { dockDeliveryAuthorized, parseIngestRequest } from "@/lib/dock-delivery-http";
import { persistDockDeliverySnapshot, previewDockDelivery } from "@/lib/dock-delivery-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Weekday Dock delivery ingest.
 * Auth: Bearer DOCK_DELIVERY_INGEST_SECRET. Unset or wrong secret → 404.
 * Body: JSON `{ wip, threads }` or multipart fields `wip` and `threads`.
 * Does not read Dock and does not write PATH tasks.
 */
export async function POST(req: Request) {
  if (!dockDeliveryAuthorized(req.headers.get("authorization"), env.DOCK_DELIVERY_INGEST_SECRET)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const parsed = await parseIngestRequest(req);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  if (parsed.payload.dryRun) {
    const preview = previewDockDelivery(parsed.payload.wip, parsed.payload.threads);
    return NextResponse.json(preview, {
      status: preview.ok ? 200 : 400,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const built = buildDockDeliverySnapshot(parsed.payload.wip, parsed.payload.threads);
  if (!built.ok) {
    return NextResponse.json(built, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }

  const result = await persistDockDeliverySnapshot(built.draft);
  return NextResponse.json(result, {
    status: result.ok ? 200 : 400,
    headers: { "Cache-Control": "private, no-store" },
  });
}
