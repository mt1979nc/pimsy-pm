import { asc } from "drizzle-orm";
import { db } from "@/db";
import { libraryAssets } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import { PageHeader, Card, CardHeader, Badge, LinkButton } from "@/components/ui";
import { LibraryUploadForm } from "./library-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "File library" };

export default async function LibraryPage() {
  await requireAdmin();
  const assets = await db.query.libraryAssets.findMany({
    orderBy: [asc(libraryAssets.name)],
    with: { templateAttachments: true },
  });

  return (
    <>
      <PageHeader
        title="File library"
        subtitle="Reusable Dock defaults (Discovery Wizard, billing sheets). Placeholders ship in-repo; drop the live files here. New workspaces copy them onto matching tasks. Same Azure Blob / local disk storage as task uploads — do not put secrets in this page."
      />
      <div className="space-y-4">
        {assets.map((asset) => (
          <Card key={asset.id}>
            <CardHeader
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {asset.name}
                  <Badge>{asset.slug}</Badge>
                  {asset.isPlaceholder ? <Badge tone="amber">Placeholder</Badge> : <Badge tone="green">Uploaded</Badge>}
                </span>
              }
              subtitle={asset.description ?? undefined}
              action={
                asset.storageKey ? (
                  <LinkButton href={`/api/library/${asset.id}`} size="sm">
                    Download
                  </LinkButton>
                ) : null
              }
            />
            <div className="space-y-3 px-5 py-4">
              {asset.adminNotes ? (
                <p className="text-[13px] leading-relaxed text-ink-2">{asset.adminNotes}</p>
              ) : null}
              <p className="text-[12.5px] text-ink-3">
                Auto-attached on {asset.templateAttachments.length} template task
                {asset.templateAttachments.length === 1 ? "" : "s"}.
              </p>
              <LibraryUploadForm assetId={asset.id} />
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
