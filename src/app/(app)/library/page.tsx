import { asc } from "drizzle-orm";
import { db } from "@/db";
import { libraryAssets } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import { libraryKindLabel, MISSING_LIBRARY_FILE_STAFF_NOTE } from "@/lib/library-meta";
import { PageHeader, Card, CardHeader, Badge, LinkButton } from "@/components/ui";
import { TemplateHubNav } from "@/components/template-hub-nav";
import { AddLibraryItemForms, LibraryLinkEditForm, LibraryUploadForm } from "./library-form";

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
        subtitle="Reusable playbook items: uploaded files and hyperlinks to online forms (Dock forms, Discovery Wizard, questionnaires). Staff paste the real URL — PATH does not invent form addresses. Attach either type to a playbook task from Templates → Edit task, or to a live task from Links & files. New workspaces copy them onto matching tasks."
      />
      <TemplateHubNav current="/library" />
      <div className="space-y-4">
        <Card>
          <CardHeader
            title="Add to library"
            subtitle="File = upload a binary. Link/Form = paste an https URL that should open in a new tab."
          />
          <div className="px-5 py-4">
            <AddLibraryItemForms />
          </div>
        </Card>
        {assets.length === 0 ? (
          <Card>
            <p className="px-5 py-4 text-[13px] text-ink-3">
              Nothing in the library yet. Add a file or a Link/Form above.
            </p>
          </Card>
        ) : null}
        {assets.map((asset) => (
          <Card key={asset.id}>
            <CardHeader
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {asset.name}
                  <Badge>{asset.slug}</Badge>
                  <Badge tone={asset.kind === "LINK" ? "green" : "neutral"}>
                    {libraryKindLabel(asset.kind)}
                  </Badge>
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
              {asset.kind !== "LINK" && !asset.storageKey ? (
                <p className="text-[13px] leading-relaxed text-ink-2">{MISSING_LIBRARY_FILE_STAFF_NOTE}</p>
              ) : null}
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
              {asset.kind === "LINK" ? (
                <LibraryLinkEditForm
                  assetId={asset.id}
                  name={asset.name}
                  url={asset.url ?? ""}
                  description={asset.description}
                />
              ) : (
                <LibraryUploadForm assetId={asset.id} />
              )}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
