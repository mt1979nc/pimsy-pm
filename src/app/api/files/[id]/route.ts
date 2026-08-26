import { NextResponse } from "next/server";
import { getActor } from "@/auth";
import { assertAttachmentAccess } from "@/lib/attachments";
import { readFileStream } from "@/lib/storage";
import { NotFoundError, ForbiddenError } from "@/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streams an uploaded attachment, but only after the same permission checks
 * the rest of the app uses. An unauthorized request gets 404, never 403 — the
 * existence of another customer's file is not something to confirm.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const actor = await getActor();
  if (!actor) return new NextResponse("Not found", { status: 404 });

  let asset;
  try {
    asset = await assertAttachmentAccess(actor, id);
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ForbiddenError) {
      return new NextResponse("Not found", { status: 404 });
    }
    throw err;
  }

  if (asset.kind === "LINK") {
    // Links are not ours to proxy.
    return NextResponse.redirect(asset.url ?? "/", 302);
  }
  if (!asset.storageKey) return new NextResponse("Not found", { status: 404 });

  const file = await readFileStream(asset.storageKey);
  if (!file) return new NextResponse("Not found", { status: 404 });

  const isInlineSafe =
    asset.mimeType?.startsWith("image/") && asset.mimeType !== "image/svg+xml";

  return new NextResponse(file.stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": asset.mimeType ?? "application/octet-stream",
      "Content-Length": String(file.size),
      // SVG and everything non-image download rather than render, so an
      // uploaded file can never execute script on our origin.
      "Content-Disposition": `${isInlineSafe ? "inline" : "attachment"}; filename="${encodeURIComponent(asset.name)}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
