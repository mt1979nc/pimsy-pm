import { NextResponse } from "next/server";
import { getActor } from "@/auth";
import { assertLearningFileAccess } from "@/lib/learning-center";
import { readFileStream } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const actor = await getActor();
  if (!actor) return new NextResponse("Not found", { status: 404 });

  const access = await assertLearningFileAccess(actor, itemId);
  if (!access) return new NextResponse("Not found", { status: 404 });

  const file = await readFileStream(access.storageKey);
  if (!file) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(file.stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": access.mimeType,
      "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(access.name)}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
