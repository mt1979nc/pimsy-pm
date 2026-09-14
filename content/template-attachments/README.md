# Template attachment content pack

Dock Implementation template files (billing spreadsheet, questionnaires, worksheets) are **not** committed as binaries. PATH seeds markdown placeholders and a live **LINK** for the Discovery Wizard.

Drop the real Dock files here **once**, then ingest. Do not invent PHI or fake spreadsheet bytes.

## Discovery Wizard (link, not a file)

Dock uses an external URL. PATH attaches it as a `LINK` on Guided Discovery / Workflow Guided Discovery (and the Discovery worksheets that feed them):

https://calm-mud-0fe119810.7.azurestaticapps.net/

Do not put a PDF embed in the task description. If that Static Web App moves, update `DISCOVERY_WIZARD_URL` in `src/db/dock-default-attachments.ts`.

## Expected filenames

| Library slug | Drop this filename (xlsx / pdf / docx) |
|---|---|
| `billing-spreadsheet` | `Billing-Spreadsheet-Accepted-Payers-Modifiers.xlsx` |
| `billing-questionnaire` | `Billing-Questionnaire.xlsx` |
| `clinical-workflows-sheet` | `Clinical-Workflows-Data-Sheet.xlsx` |
| `organization-details-form` | `Organization-Details-Form.xlsx` |
| `rcm-intake-questionnaire` | `RCM-Intake-Questionnaire.xlsx` |

Stem match is case-insensitive (`.xls` / `.xlsx` / `.pdf` / `.docx` all work). Skip this folder for Discovery Wizard.

## Ingest (local or Cloud Shell)

```bash
export DATABASE_URL='postgresql://…'   # App Service → Configuration. Do not invent.
# copy the Dock files into this folder, then:
npm run db:upload:template-attachments          # dry-run
npm run db:upload:template-attachments -- --apply
```

`--apply` uploads into the same Azure Blob / `UPLOAD_DIR` store as task files, marks the library row live, and **updates existing playbook clones** on tasks. User-uploaded files (no `library_asset_id`) are left alone.

Alternatively, Owner/Admin → **Templates → File library** (`/library`) and replace each placeholder in the UI.

## Azure Blob (optional prefix)

Production already uses `AZURE_STORAGE_CONNECTION_STRING` + `AZURE_STORAGE_CONTAINER` (default `pimsy-uploads`). You do **not** need a second container. The ingest script stores objects with the same opaque keys as other uploads.

If you prefer to stage files in Blob first:

```bash
az storage blob upload-batch \
  --destination pimsy-uploads \
  --destination-path template-attachments \
  --source ./content/template-attachments \
  --account-name <storage-account>
```

Then copy them down and run `db:upload:template-attachments -- --apply`, or replace via `/library`.

## After ingest, backfill WIP

```bash
npm run db:resync:playbook-from-dock              # dry-run
npm run db:resync:playbook-from-dock -- --apply   # attach missing defaults; never deletes user files
```

New projects copy the current library row onto matching tasks automatically.
