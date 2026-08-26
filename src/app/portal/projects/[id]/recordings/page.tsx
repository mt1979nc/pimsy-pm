import { requireCustomer } from "@/lib/guard";
import { portalRecordings } from "@/lib/portal";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { fmtShort } from "@/lib/dates";

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
    <Card>
      <CardHeader
        title="Recordings"
        subtitle="Training sessions you can watch back any time"
      />
      {recordings.length === 0 ? (
        <EmptyState
          title="No recordings yet"
          description="Your implementation team will post training session recordings here."
        />
      ) : (
        <div className="divide-y divide-border">
          {recordings.map((r) => (
            <a
              key={r.id}
              href={r.url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-5 py-3.5 hover:bg-surface-2"
            >
              <div className="text-[13.5px] font-medium text-ink hover:text-brand hover:underline">
                {r.name}
              </div>
              {r.description ? (
                <p className="mt-0.5 text-[12.5px] text-ink-2">{r.description}</p>
              ) : null}
              <div className="mt-1 text-[12px] text-ink-3">{fmtShort(r.createdAt)}</div>
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}
