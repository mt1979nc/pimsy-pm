import { revalidatePath } from "next/cache";

/**
 * Every Management Prism surface that must refresh when roster, dates, hours,
 * or status change. Kickoff / go-live / slip edits feed weekly load at read
 * time; this just drops cached pages so Forecast cannot show a stale window.
 */
export function revalidatePrismSurfaces(projectId?: string) {
  revalidatePath("/management");
  revalidatePath("/management/forecast");
  revalidatePath("/management/engagements");
  revalidatePath("/management/team");
  revalidatePath("/reports/capacity");
  revalidatePath("/reports/analysis");
  revalidatePath("/reports");
  revalidatePath("/dashboard");
  revalidatePath("/projects");
  if (projectId) {
    revalidatePath(`/management/engagements/${projectId}`);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/settings`);
  }
}
