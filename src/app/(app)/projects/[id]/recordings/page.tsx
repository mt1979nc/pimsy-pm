import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/guard";
import { assertProjectAccess, ForbiddenError, NotFoundError } from "@/lib/authz";
import { loadProjectRecordingAggregate } from "@/lib/recordings-query";
import { RecordingsList } from "@/components/recordings-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recordings" };

export default async function ProjectRecordingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireStaff();
  try {
    await assertProjectAccess(actor, id);
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ForbiddenError) notFound();
    throw err;
  }

  const recordings = await loadProjectRecordingAggregate(id);

  return (
    <RecordingsList
      recordings={recordings}
      subtitle="Links attached on each training task"
      emptyTitle="No recordings yet"
      emptyDescription="Attach the Zoom link on the training task after the session. This list gathers those same links."
      taskHref={(taskId) => `/projects/${id}/tasks/${taskId}`}
      showVisibility
    />
  );
}
