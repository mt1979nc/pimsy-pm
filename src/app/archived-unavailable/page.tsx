import { notFound } from "next/navigation";

/** Middleware rewrites archived routes here so they respond 404. */
export default function ArchivedUnavailablePage() {
  notFound();
}
