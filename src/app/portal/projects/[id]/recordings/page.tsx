import { requireCustomer } from "@/lib/guard";
import { portalRecordings } from "@/lib/portal";
import { RecordingsList } from "@/components/recordings-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recordings" };

export default async function PortalRecordingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireCustomer();
  const recordings = await portalRecordings(actor, id);

  return (
    <RecordingsList
      recordings={recordings}
      subtitle="Watch a session back any time"
      emptyTitle="No recordings yet"
      emptyDescription="Your implementation team will post them here after each training session."
    />
  );
}
