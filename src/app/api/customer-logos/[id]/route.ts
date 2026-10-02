import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getActor } from "@/auth";
import { db } from "@/db";
import { customerAccounts } from "@/db/schema";
import { isCustomer, isStaff } from "@/lib/authz";
import { logoContentType } from "@/lib/customer-logo-parse";
import { contentDisposition, readFileStream } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streams a customer logo uploaded into PATH storage.
 * Staff can read any customer. A portal user can read only their own account.
 * External https logos are not proxied — the img tag uses logoUrl directly.
 * Missing logos are 404, same as other private files.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) return new NextResponse("Not found", { status: 404 });

  const staff = isStaff(actor);
  const ownCustomer = isCustomer(actor) && actor.customerAccountId === id;
  if (!staff && !ownCustomer) return new NextResponse("Not found", { status: 404 });

  const customer = await db.query.customerAccounts.findFirst({
    where: eq(customerAccounts.id, id),
    columns: { id: true, logoStorageKey: true, name: true },
  });
  if (!customer?.logoStorageKey) return new NextResponse("Not found", { status: 404 });

  const mime = logoContentType(customer.logoStorageKey);
  if (!mime) return new NextResponse("Not found", { status: 404 });

  const file = await readFileStream(customer.logoStorageKey);
  if (!file) return new NextResponse("Not found", { status: 404 });

  const filename = `${customer.name || "logo"}${customer.logoStorageKey.slice(customer.logoStorageKey.lastIndexOf("."))}`;

  return new NextResponse(file.stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(file.size),
      "Content-Disposition": contentDisposition(filename, true),
      "Cache-Control": "private, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
