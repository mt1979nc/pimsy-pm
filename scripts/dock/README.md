# Dock delivery analytics

Dock stays the delivery system. PATH stores Implementation WIP snapshots for Prism at `/management/dock-delivery` (sidebar: **Data analytics → Dock delivery**). The page is read-only: overdue tasks and open threads, split into waiting on PIMSY and waiting on the customer. Details sit behind each site.

This path does **not** create PATH projects, tasks, or playbook rows. It does not call HubSpot. It does not write Prism Azure SQL.

`npm run db:import:dock-wip` is an older importer that creates projects. Do not use it for this dashboard.

## What is stored

Migrate `0030_dock_delivery`:

- `dock_delivery_snapshots` — one row per ingest (`retrieved_at`, source URL, totals, content hash)
- `dock_delivery_sites` — acronym, name, owners, target/actual end, overdue count, waiting-on counts
- `dock_delivery_threads` — title, waiting on (pimsy / customer / unknown), last poster, Dock URL

The newest snapshot (by `created_at`) is the one the page shows. The last **8** snapshots are kept. Posting the same sites and threads again does not insert another copy. A newer `retrievedAt` with the same rows updates **Last refreshed**.

Acronyms are stored even when no PATH project matches.

## Match to PATH

Read-time only, case-insensitive exact match:

1. `projects.crmAcronym`
2. else `projects.code`

A crmAcronym hit wins over a code-only hit. Then a row that is not archived, then one that is not completed or cancelled. The page links to `/projects/{id}`. `prismClientId` is not used.

## Exclusions

Applied when the scrape file is built and again on ingest (America/Chicago calendar day):

- Actual end on or before today
- DRAFT Impl (including DRAFT Impl. Billing/RCM)
- Test workspaces (MT Test, Test Dock, process-improvement)
- RCM-only rows (`product`/`track` is `RCM`, name is `RCM` or `RCM only`, or `rcmOnly: true`)
- GROK E2E (acronym `GROK` or a name that is Grok E2E)

A missing overdue count is **not** an exclusion. If that column is hidden in Dock, `overdueTaskCount` is null and the page shows **—**.

## Scrape

Run this where a Dock session already exists. PATH App Service does not log in to Dock for v1, and this script has no login step.

View: `https://pimsyehr.dock.us/spaces/views/WFEopP9nDBAC`

Connect over CDP (ops pattern — Chrome already signed in):

```bash
# Chrome: --remote-debugging-port=9222
DOCK_CDP_URL=http://127.0.0.1:9222 npx tsx scripts/dock/scrape-implementation-wip.ts \
  --wip /tmp/dock-wip.json --threads /tmp/dock-threads.json
```

Or a Playwright `storageState` file:

```bash
DOCK_STORAGE_STATE=./dock-state.json npx tsx scripts/dock/scrape-implementation-wip.ts \
  --wip /tmp/dock-wip.json --threads /tmp/dock-threads.json
```

`DOCK_VIEW_URL` overrides the view. `DOCK_HEADLESS=0` shows the browser when using storageState. CDP attach does not close the operator's Chrome.

If the grid is empty the script exits without writing, so a signed-out page cannot wipe the dashboard. Overdue stays null when that column is not in the header.

Waiting-on: an explicit "Waiting on …" label wins. Otherwise a known PIMSY staff last poster counts as waiting on the customer, and anyone else counts as waiting on PIMSY.

## Ingest

### CLI

Dry run (default):

```bash
npm run db:ingest:dock-delivery -- --wip /tmp/dock-wip.json --threads /tmp/dock-threads.json
```

Write:

```bash
npm run db:ingest:dock-delivery -- --wip /tmp/dock-wip.json --threads /tmp/dock-threads.json --apply
```

### HTTP (scheduled job)

`POST /api/internal/dock-delivery/ingest`

- Header: `Authorization: Bearer $DOCK_DELIVERY_INGEST_SECRET`
- App setting on the PATH App Service. Generate with `openssl rand -base64 32`. If the setting is empty or the header is wrong, the route returns **404**.
- JSON body: `{ "wip": <dock-wip.json>, "threads": <dock-threads.json> }`
- Or multipart fields `wip` and `threads`
- `?dryRun=1` or `"dryRun": true` parses and counts without writing

Example:

```bash
curl -sS -X POST "https://pimsy-app.azurewebsites.net/api/internal/dock-delivery/ingest" \
  -H "Authorization: Bearer $DOCK_DELIVERY_INGEST_SECRET" \
  -H "Content-Type: application/json" \
  --data @- <<EOF
{ "wip": $(cat dock-wip.json), "threads": $(cat dock-threads.json) }
EOF
```

## Daily schedule

Do **not** run the Playwright script inside Azure App Service. There is no Dock cookie there. PATH does not write to HubSpot.

Recommended: **daily at 08:15 America/Chicago**, after the morning CoS scrape finishes.

1. The CoS box (or a signed-in browser) writes `dock-wip.json` and `dock-threads.json`.
2. Azure Logic App **`pimsy-cron-dock-delivery`** (or the same box) POSTs both files to the existing ingest URL above. That route and migration `0030_dock_delivery` are unchanged.
3. PATH only stores the result. Staff open **Data analytics → Dock delivery**. The page shows **As of** and a warning when that timestamp is older than 24 hours.

GitHub Actions fallback: `.github/workflows/dock-delivery-ingest.yml` (daily `15 13 * * *` UTC, about 08:15 America/Chicago during CDT). It scrapes only when repo secrets `PATH_APP_URL`, `DOCK_DELIVERY_INGEST_SECRET`, and `DOCK_STORAGE_STATE` are set, then POSTs to `/api/internal/dock-delivery/ingest`. Prefer the Logic App if the scrape files already land on the CoS box.

## Demo fixtures

`scripts/dock/fixtures/dock-wip.sample.json` and `dock-threads.sample.json` are labeled excerpts for a local dry run. `npm run db:seed` does not load them. Do not treat them as production Dock data.
