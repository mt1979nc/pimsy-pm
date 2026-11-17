import { notFound, redirect } from "next/navigation";
import { getActor } from "@/auth";
import { CAPACITY_VIEWER_HOME, isCapacityViewerRole } from "@/lib/capacity-viewer";

export const dynamic = "force-dynamic";

/** Rewrite target for archived modules. Capacity viewers go home instead of a 404. */
export default async function ArchivedUnavailablePage() {
  const actor = await getActor();
  if (actor && isCapacityViewerRole(actor.role)) redirect(CAPACITY_VIEWER_HOME);
  notFound();
}
