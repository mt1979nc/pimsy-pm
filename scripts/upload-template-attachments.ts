/**
 * Ingest real Dock template files from content/template-attachments/ into the
 * file library (and existing playbook clones). Dry-run by default.
 *
 *   npm run db:upload:template-attachments
 *   npm run db:upload:template-attachments -- --apply
 *
 * Does not invent spreadsheet bytes. Drop the live Dock xlsx/pdf/docx in
 * content/template-attachments/ first (see that folder's README). LINK assets
 * (Discovery Wizard) are skipped — they already use the calm-mud URL.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { libraryAssets } from "@/db/schema";
import { DEFAULT_LIBRARY_ASSETS } from "@/db/dock-default-attachments";
import { findPackFile } from "@/lib/template-attachment-pack";
import { propagateLibraryFileToCopies } from "@/lib/template-attachments";
import { putFile } from "@/lib/storage";
import { redactDatabaseUrl } from "@/lib/demo-entities";
import { env } from "@/lib/env";

const apply = process.argv.includes("--apply");

function mimeForPackFile(fileName: string, fallback: string | null): string | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return fallback;
}

async function main() {
  console.log("\nPATH template attachment content pack");
  console.log(`  ${redactDatabaseUrl(env.DATABASE_URL)}`);
  console.log(`  mode: ${apply ? "APPLY" : "DRY-RUN (pass --apply to write)"}`);
  console.log("");

  let found = 0;
  let missing = 0;

  for (const def of DEFAULT_LIBRARY_ASSETS) {
    if ((def.kind ?? "FILE") === "LINK") {
      console.log(`  · ${def.slug}: LINK ${def.url} (no pack file)`);
      continue;
    }
    const pack = findPackFile(def);
    if (!pack) {
      missing += 1;
      console.log(`  · ${def.slug}: no file in content/template-attachments/ (placeholder stays)`);
      continue;
    }
    found += 1;
    console.log(`  ✓ ${def.slug} ← ${basename(pack)}`);
    if (!apply) continue;

    const existing = await db.query.libraryAssets.findFirst({
      where: eq(libraryAssets.slug, def.slug),
    });
    const bytes = readFileSync(pack);
    const storedName = basename(pack);
    const storageKey = await putFile(storedName, bytes);
    const mimeType = mimeForPackFile(storedName, def.mimeType ?? existing?.mimeType ?? null);
    const values = {
      name: def.name,
      description: def.description,
      mimeType,
      adminNotes: def.adminNotes,
      visibility: def.visibility,
      kind: "FILE" as const,
      url: null as string | null,
      storageKey,
      sizeBytes: bytes.length,
      isPlaceholder: false,
      updatedAt: new Date(),
    };

    let id = existing?.id;
    if (existing) {
      await db.update(libraryAssets).set(values).where(eq(libraryAssets.id, existing.id));
    } else {
      const inserted = await db
        .insert(libraryAssets)
        .values({ slug: def.slug, ...values })
        .returning({ id: libraryAssets.id });
      id = inserted[0]!.id;
    }
    if (id) {
      await propagateLibraryFileToCopies(db, {
        libraryAssetId: id,
        storageKey,
        mimeType,
        sizeBytes: bytes.length,
        url: null,
        kind: "FILE",
        name: def.name,
        description: def.description,
      });
    }
  }

  console.log(`\nPack files found: ${found}. Still placeholder: ${missing}.`);
  if (!apply) {
    console.log("Dry-run only. Drop Dock binaries into content/template-attachments/ then re-run with --apply.");
    console.log("Then: npm run db:resync:playbook-from-dock -- --apply\n");
  } else {
    console.log("Library rows updated. Clones on existing tasks now point at the new blobs.\n");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nTemplate attachment upload failed:", err);
    process.exit(1);
  });
