import { asc } from "drizzle-orm";
import { db } from "@/db";
import { libraryAssets } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import { PageHeader, Card, CardHeader, Badge, LinkButton } from "@/components/ui";
import { TemplateHubNav } from "@/components/template-hub-nav";
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
        subtitle="Reusable Dock defaults. Discovery Wizard is a live LINK on Guided Discovery tasks (not a description URL). Billing sheets ship as placeholders until you drop the live files here or in content/template-attachments/. Attach a file to a playbook task from Templates → Edit task. New workspaces copy them onto matching tasks. Resync backfills WIP without deleting user uploads."
      />
      <TemplateHubNav current="/library" />
      <div className="space-y-4">
        {assets.map((asset) => (
          <Card key={asset.id}>
            <CardHeader
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {asset.name}
                  <Badge>{asset.slug}</Badge>
                  <Badge>{asset.kind === "LINK" ? "Link" : "File"}</Badge>
                  {asset.isPlaceholder ? <Badge tone="amber">Placeholder</Badge> : <Badge tone="green">Live</Badge>}
                </span>
              }
              subtitle={asset.description ?? undefined}
              action={
                asset.kind === "LINK" && asset.url ? (
                  <LinkButton href={asset.url} size="sm" target="_blank" rel="noopener noreferrer">
                    Open link
                  </LinkButton>
                ) : asset.storageKey ? (
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
              {asset.kind === "LINK" && asset.url ? (
                <p className="break-all text-[12.5px] text-ink-3">{asset.url}</p>
              ) : null}
              <p className="text-[12.5px] text-ink-3">
                Auto-attached on {asset.templateAttachments.length} template task
                {asset.templateAttachments.length === 1 ? "" : "s"}.
              </p>
              {asset.kind === "LINK" ? null : <LibraryUploadForm assetId={asset.id} />}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
