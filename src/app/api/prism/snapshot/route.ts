import { NextResponse } from "next/server";

import { getActor } from "@/auth";
import { canSeePortfolio } from "@/lib/authz";
import { env } from "@/lib/env";
import { loadDirectorSnapshot } from "@/lib/prism-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m?.[1]?.trim() || null;
}

/**
 * Director / Pipeline / morning snapshot.
 *
 * Auth: Bearer PRISM_READ_API_KEY, or a signed-in OWNER/ADMIN/MANAGER session.
 * Always reads PM Postgres. Never Prism Azure SQL.
 */
export async function GET(req: Request) {
  const token = bearerToken(req);
  const configured = env.PRISM_READ_API_KEY.trim();
  let allowed = false;

  if (configured && token && token === configured) {
    allowed = true;
  } else {
    const actor = await getActor();
    if (actor && canSeePortfolio(actor)) allowed = true;
  }

  if (!allowed) {
    // Same 404-not-403 convention as other unauthenticated API reads.
    return new NextResponse("Not found", { status: 404 });
  }

  const url = new URL(req.url);
  const weeksRaw = Number.parseInt(url.searchParams.get("weeks") ?? "12", 10);
  const weeks = Number.isFinite(weeksRaw) ? Math.min(26, Math.max(4, weeksRaw)) : 12;
  const snapshot = await loadDirectorSnapshot(weeks);
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
