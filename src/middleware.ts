import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { archivedModulesEnabled, isArchivedRequestPath } from "@/lib/archived-modules";

/**
 * Archived modules return the app 404 unless PATH_ARCHIVED_MODULES is on.
 * The rewrite target calls notFound() so the status is 404 and the URL stays.
 */
export function middleware(request: NextRequest) {
  if (archivedModulesEnabled()) return NextResponse.next();
  if (!isArchivedRequestPath(request.nextUrl.pathname)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/archived-unavailable";
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/).*)"],
};
