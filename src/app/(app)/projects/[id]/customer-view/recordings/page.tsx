import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/guard";
import { assertProjectAccess, ForbiddenError, NotFoundError } from "@/lib/authz";
import { previewPortalRecordings } from "@/lib/portal-preview";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { attachmentHref } from "@/lib/attachments";
import { fmtShort } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer view · Recordings" };

export default async function CustomerViewRecordingsPage({
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

  const recordings = await previewPortalRecordings(id);

  return (
    <Card>
      <CardHeader title="Recordings" subtitle="Shared training-session links the customer can open." />
      {recordings.length === 0 ? (
        <EmptyState title="No recordings shared" />
      ) : (
        <div className="divide-y divide-border">
          {recordings.map((f) => {
            const href = attachmentHref(f);
            if (!href) {
              return (
                <div key={f.id} className="px-4 py-2.5">
                  <div className="truncate text-[13px] text-ink">{f.name}</div>
                  <div className="text-[12px] text-ink-3">File not available yet</div>
                </div>
              );
            }
            return (
            <a
              key={f.id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-4 py-2.5 hover:bg-surface-2"
            >
              <div className="truncate text-[13px] text-ink">{f.name}</div>
              <div className="text-[12px] text-ink-3">{fmtShort(f.createdAt)}</div>
            </a>
            );
          })}
        </div>
      )}
    </Card>
  );
}
