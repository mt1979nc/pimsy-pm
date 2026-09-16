import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";

/** Keep staff About, portal About, and Customer view About in lockstep. */
export function revalidateAboutSurfaces(opts: {
  projectId?: string | null;
  customerAccountId?: string | null;
}) {
  if (opts.projectId) {
    revalidatePath(`/projects/${opts.projectId}`);
    revalidatePath(`/projects/${opts.projectId}/about`);
    revalidatePath(`/projects/${opts.projectId}/customer-view`);
    revalidatePath(`/projects/${opts.projectId}/customer-view/about`);
    revalidatePath(`/projects/${opts.projectId}/settings`);
    revalidatePath(`/portal/projects/${opts.projectId}`);
    revalidatePath(`/portal/projects/${opts.projectId}/about`);
  }
  if (opts.customerAccountId) {
    revalidatePath(`/customers/${opts.customerAccountId}`);
  }
}

/** Contact name/title/phone edits must refresh every site About for that practice. */
export async function revalidateCustomerAboutSurfaces(customerAccountId: string) {
  revalidateAboutSurfaces({ customerAccountId });
  const rows = await db.query.projects.findMany({
    where: eq(projects.customerAccountId, customerAccountId),
    columns: { id: true },
  });
  for (const row of rows) {
    revalidateAboutSurfaces({ projectId: row.id });
  }
}
