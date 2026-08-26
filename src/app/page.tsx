import { redirect } from "next/navigation";
import { getActor } from "@/auth";
import { isCustomer } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const actor = await getActor();
  if (!actor) redirect("/signin");
  redirect(isCustomer(actor) ? "/portal" : "/dashboard");
}
