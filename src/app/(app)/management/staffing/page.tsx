import { redirect } from "next/navigation";

/** Alias — brief uses /management/team; user brief also mentioned /management/staffing. */
export default function ManagementStaffingAlias() {
  redirect("/management/team");
}
