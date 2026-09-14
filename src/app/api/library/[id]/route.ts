import { NextResponse } from "next/server";
import { getActor } from "@/auth";
import { isStaff } from "@/lib/authz";
import { loadLibraryAssetForStaff } from "@/lib/learning-center";
import { readFileStream } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor || !isStaff(actor)) return new NextResponse("Not found", { status: 404 });

  const asset = await loadLibraryAssetForStaff(actor, id);
  if (!asset?.storageKey) return new NextResponse("Not found", { status: 404 });

  const file = await readFileStream(asset.storageKey);
  if (!file) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(file.stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": asset.mimeType ?? "application/octet-stream",
      "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(asset.name)}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
