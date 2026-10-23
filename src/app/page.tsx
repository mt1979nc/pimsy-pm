import { redirect } from "next/navigation";
import { getActor } from "@/auth";
import { isCustomer } from "@/lib/authz";
import { archivedModulesEnabled } from "@/lib/archived-modules";
import { staffHomeHref } from "@/lib/day-to-day";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const actor = await getActor();
  if (!actor) redirect("/signin");
  if (isCustomer(actor) && !archivedModulesEnabled()) redirect("/portal-archived");
  redirect(isCustomer(actor) ? "/portal" : staffHomeHref(actor.role));
}
