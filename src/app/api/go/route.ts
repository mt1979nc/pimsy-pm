import { NextResponse } from "next/server";

import { getActor } from "@/auth";
import { NotFoundError } from "@/lib/authz";
import { env } from "@/lib/env";
import { buildGoAbsoluteUrl, parseGoQuery } from "@/lib/path-deep-links";
import { expandPathDeepLink, resolvePathDeepLink } from "@/lib/path-deep-link-resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m?.[1]?.trim() || null;
}

/**
 * Expand a wizard / Power Automate deep link to PATH staff and portal URLs.
 *
 * Auth: Bearer PRISM_READ_API_KEY, or a signed-in session (returns that
 * actor's destination only). Unauthenticated → 404.
 *
 * Query: project (code / acronym), task (title or id), step, dest, phase.
 * Response never includes wizard answers or patient information.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = parseGoQuery(url.searchParams);
  const token = bearerToken(req);
  const configured = env.PRISM_READ_API_KEY.trim();

  if (configured && token && token === configured) {
    try {
      const expanded = await expandPathDeepLink(query);
      const origin = env.APP_URL.replace(/\/+$/, "");
      return NextResponse.json(
        {
          go: buildGoAbsoluteUrl(origin, query),
          project: {
            id: expanded.projectId,
            code: expanded.projectCode,
            name: expanded.projectName,
          },
          staff: {
            path: expanded.staff.path,
            url: `${origin}${expanded.staff.path}`,
            taskId: expanded.staff.taskId ?? null,
            phaseId: expanded.staff.phaseId ?? null,
          },
          portal: expanded.portal.path
            ? {
                path: expanded.portal.path,
                url: `${origin}${expanded.portal.path}`,
                taskId: expanded.portal.taskId ?? null,
                phaseId: expanded.portal.phaseId ?? null,
              }
            : null,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (err) {
      if (err instanceof NotFoundError) {
        return new NextResponse("Not found", { status: 404 });
      }
      throw err;
    }
  }

  const actor = await getActor();
  if (!actor) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const resolved = await resolvePathDeepLink(actor, query);
    const origin = env.APP_URL.replace(/\/+$/, "");
    return NextResponse.json(
      {
        go: buildGoAbsoluteUrl(origin, query),
        path: resolved.path,
        url: `${origin}${resolved.path}`,
        audience: resolved.audience,
        dest: resolved.dest,
        project: { id: resolved.projectId, code: resolved.projectCode },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    if (err instanceof NotFoundError) {
      return new NextResponse("Not found", { status: 404 });
    }
    throw err;
  }
}
