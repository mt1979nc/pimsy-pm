# Running PATH on Azure

This folder plus `.github/workflows/deploy-azure.yml` and the `Dockerfile` at
the repo root are everything needed to run this app on Azure: a Postgres
database, a place to store uploaded files, and a Web App serving the
container. This document is a runbook for whoever on your team handles Azure
— your IT/DevOps person, most likely, since it assumes comfort with the
Azure CLI and GitHub Actions.

**Important: nobody has run this against a real Azure subscription yet.**
Everything here was built and checked as thoroughly as possible without one:
the Bicep template compiles cleanly (`az bicep build`), the GitHub Actions
YAML is valid, and the Docker image's application code is fully tested — but
actually provisioning Azure resources and deploying the container needs real
Azure credentials, which aren't available in the environment this was built
in. Budget time for a first real run to surface anything Azure-specific that
only shows up live (a quota limit, a region availability quirk, and so on).

## What gets created

| Resource | Purpose |
|---|---|
| Azure Database for PostgreSQL (Flexible Server) | The app's database |
| Storage Account + Blob container | Uploaded files (replaces local disk — see `src/lib/storage.ts`) |
| Azure Container Registry | Holds the Docker image GitHub Actions builds |
| App Service Plan (Linux) + Web App for Containers | Runs the app |

Everything lands in one resource group you choose, sized modestly (a B1 App
Service Plan, a burstable B1ms Postgres server) — enough for a small
implementation team, cheap to run, and easy to scale up later by changing
one parameter and re-running the deployment.

## One-time setup

1. **Install the Azure CLI** if it isn't already:
   https://learn.microsoft.com/cli/azure/install-azure-cli

2. **Log in and pick a subscription:**

   ```
   az login
   az account set --subscription "<your subscription name or ID>"
   ```

3. **Edit `azure/main.parameters.json`** — at minimum, replace the two
   `REPLACE_ME_BEFORE_DEPLOYING` placeholders:
   - `postgresAdminPassword` — a strong password, saved somewhere safe (a
     password manager). You'll need it if you ever connect with `psql`
     directly.
   - `authSecret` — generate one with `openssl rand -base64 32`.

   Also worth reviewing while you're in there: `bootstrapOwnerEmail` (who
   gets OWNER access the first time they sign in), `resendApiKey` (leave
   blank to start — see "Email" below), and the two SKU parameters if you
   want a bigger tier than the defaults.

4. **Provision the Azure resources:**

   ```
   ./azure/deploy.sh pimsy-prod eastus
   ```

   (First argument is the resource group name, second is the region — pick
   whichever Azure region is closest to your team.) This takes 5-10 minutes,
   mostly waiting on the Postgres server. It prints a JSON block of outputs
   at the end and saves it to `/tmp/pimsy-azure-outputs.json` — keep that
   around for the next step.

5. **Create a service principal for GitHub Actions to authenticate as:**

   ```
   az ad sp create-for-rbac \
     --name "pimsy-github-actions" \
     --role contributor \
     --scopes /subscriptions/<subscription-id>/resourceGroups/pimsy-prod \
     --sdk-auth
   ```

   This prints a JSON object — that whole object is the `AZURE_CREDENTIALS`
   secret in the next step.

6. **Add repository secrets** (GitHub repo → Settings → Secrets and
   variables → Actions → New repository secret):

   | Secret | Value |
   |---|---|
   | `AZURE_CREDENTIALS` | The JSON object from step 5 |
   | `AZURE_RESOURCE_GROUP` | `pimsy-prod` (or whatever you named it) |
   | `AZURE_WEBAPP_NAME` | `webAppName` from the deploy output |
   | `AZURE_REGISTRY_NAME` | `registryLoginServer` from the deploy output, but just the part before `.azurecr.io` |
   | `AZURE_POSTGRES_SERVER_NAME` | `postgresServerName` from the deploy output |
   | `DATABASE_URL` | Build it as `postgresql://<postgresAdminLogin>:<postgresAdminPassword>@<postgres FQDN>:5432/pimsy?sslmode=require` — the FQDN is `<postgresServerName>.postgres.database.azure.com` |

7. **Push to `main`** (or run the workflow manually from the Actions tab).
   This builds the image, pushes it to the registry, runs database
   migrations, and points the Web App at the new image. The very first run
   is what actually puts a working app behind the placeholder Web App the
   Bicep template created — expect it to take a few minutes.

8. **Visit the app** at `https://<AZURE_WEBAPP_NAME>.azurewebsites.net` and
   sign in as `bootstrapOwnerEmail`. See "First sign-in" below.

## First sign-in

The app bootstraps its first OWNER account from whichever email address you
set as `bootstrapOwnerEmail`. If you haven't set `RESEND_API_KEY` yet (see
"Email" below), there's no email service configured, which means magic-link
sign-in has nowhere to deliver its link — use password sign-in instead:

1. Go to `/forgot-password` and enter the bootstrap owner's email.
2. Without email configured, the app has no way to hand you the link — you'd
   need to either configure `RESEND_API_KEY` first, or temporarily check the
   Web App's log stream (`az webapp log tail`) right after requesting the
   link, since the app logs it there the same way it does for local dev.
   Setting up email before your first sign-in is the more reliable path.

## Email

Magic-link sign-in and password recovery both need outbound email to be
useful in production. Sign up for [Resend](https://resend.com), get an API
key, and either add it to `azure/main.parameters.json` before your first
deploy or update it afterward:

```
az webapp config appsettings set \
  --name <AZURE_WEBAPP_NAME> \
  --resource-group <AZURE_RESOURCE_GROUP> \
  --settings RESEND_API_KEY="re_..."
```

Until then, password sign-in still works for anyone who already has a
password set — it's only the "email me a link" flows that need it.

## Updating the app after the first deploy

Nothing extra needed — every push to `main` re-runs the same GitHub Actions
workflow: build image, push, migrate, redeploy.

**v1.10.0** adds migration `0011_forecast` (`org_settings.forecast_analysis_exclusions`
for Analysis primary averages; default SENSORI / MHC / LECHRIS in code when
null). The deploy workflow applies it automatically. To apply by hand against
Azure Postgres:

```
npm run db:migrate
```

No Prism Azure SQL connection string is required on the Web App. v1.11 cutover
reads PATH Postgres only. Optional App Setting `PRISM_READ_API_KEY` gates
`GET /api/prism/snapshot` for Director / Pipeline routines. Dump Prism SQL from
a firewall-allowed host (`PRISM_SQL_CONNECTION_STRING`) — see `v1.11-PRISM-CUTOVER.md`.

Optional App Settings `PIMSY_AUDIT_FEED_URL` / `PIMSY_AUDIT_FEED_TOKEN` /
`PIMSY_AUDIT_FEED_WINDOW_DAYS` power the staff “Confirm users have logged in”
EHR who/duration card. Leave them blank until a real read-only login feed
exists — PATH will not invent audit rows. See `v1.14-PIMSY-LOGIN-AUDIT.md`.

**Wave B assignee due reminders (P1-G).** `POST`/`GET`
`/api/cron/task-due-reminders` with `Authorization: Bearer <CRON_SECRET>`
writes per-assignee `TASK_DUE_SOON` / `TASK_OVERDUE` in-app notifications
(today + tomorrow Eastern, plus overdue). Unset or wrong secret → 404.
Does **not** send the batched customer digest — that remains the separate
digest job (PR #39), which can reuse the same `CRON_SECRET`. Set the App
Setting with `openssl rand -base64 32`. Call from a Logic App recurrence
(every 15 minutes is plenty; the cooldown is ~20 hours per user+task).
Migration `0017_task_assignees`.

See `v1.10-REPORT.md` in the repo root.

**v1.9.0** added `0010_playbook_staffing`. To refresh the four standard
playbooks (does not rewrite existing project tasks, does not send invite
emails):

```
npm run db:seed -- --templates-only
```

### Remove demo / test clients from production (v1.11.1)

Alexander's live book should not contain Nathan demo logins or GROK fixtures.
The cleanup script is **dry-run by default** and never prints the password
from `DATABASE_URL`.

1. Azure Portal → App Service (`pimsy-app` or your Web App) → **Settings →
   Environment variables / Configuration** → copy `DATABASE_URL`. Do not invent
   the connection string.
2. Azure Cloud Shell (or any host that can reach Flexible Server), with this
   repo checked out at a v1.11.1+ commit:

```bash
export DATABASE_URL='postgresql://…'   # paste from App Settings; keep quotes
npm ci                                 # if this shell has no node_modules
npm run db:cleanup:demo                # review the lists
npm run db:cleanup:demo -- --apply     # deletes the listed demo/test rows only
npm run db:cleanup:demo                # confirm empty
```

Removes `demo.manager@` / `demo.specialist@`, Riverbend and other seed
customers (`IMP-9001`–`IMP-9003`), `@example.com` fixture contacts, and GROK
E2E / `IMP-0004` / GROKTEST. **Never** deletes alexander@, jeremy@,
danielle@, morgan@, mindy@, david@, anna@, kori@, playbooks, or imported
Prism/Dock acronyms (BDMH, BHC, CCCCARE, CEDAR, DYM, EBHKY, FBH, LECHRIS,
MMHSS, OCE, PWMI, RAC, TANC, RBH, SWMCCC, THS, …). If a demo code is somehow
attached to a protected acronym, that project is skipped.

### Align the active book with current Dock WIP (v1.12)

Allowlist is `content/dock-wip-allowlist.json` (Dock Implementation WIP as of
2026-09-14). Override with a JSON/CSV path if you need a one-off overlay.
**RAC + TANC:** Alexander is keeping both until he consolidates. Prune must
KEEP Transformation ANew / Redemption Alliance under either code. Do not
delete. Do not auto-rename.

```bash
export DATABASE_URL='postgresql://…'   # from App Settings; keep quotes
npm run db:migrate                     # includes 0016_exclude_from_analytics (E2E analytics flag)
npm run db:cleanup:non-dock            # dry-run against the shipped fixture
npm run db:cleanup:non-dock -- --apply # delete active non-Dock WIP only
```

**Keeps** completed / post go-live / archived sites for historical Forecast and
Analysis even when Dock no longer has an active workspace. **Deletes** active,
pre-kickoff, and pipeline WIP not on the allowlist, plus Dock test/draft
spaces (MT Test, Test Dock, DRAFT Impl, …). Named staff are never
removed. Optional `--keep-prism-analytics` keeps pipeline-only extras.
Full runbook: `v1.12-DOCK-PARITY.md`.

Then refresh playbooks + backfill existing WIP (descriptions, checklists,
default files; does not wipe live completion or staff notes):

```bash
npm run db:seed -- --templates-only          # template rows only
npm run db:resync:playbook-from-dock         # dry-run; progress + 180s cap
npm run db:resync:playbook-from-dock -- --apply
```

Owner/Admin replace billing-sheet placeholders at
**Templates → File library** (`/library`), or drop the live Dock files in
`content/template-attachments/` and run:

```bash
npm run db:upload:template-attachments          # dry-run
npm run db:upload:template-attachments -- --apply
npm run db:resync:playbook-from-dock -- --apply # attach missing defaults; keep user files
```

Discovery Wizard is a **LINK** (`https://calm-mud-0fe119810.7.azurestaticapps.net/`)
on the matching tasks — not a URL in the description. PATH stamps that URL with
the site code / task / a `/go` return when Click Here is opened. Completion and
Power Automate emails should use the durable PATH link, not the bare SWA:

```
https://<webapp>.azurewebsites.net/go?project=CEDAR&task=Organization%20Details%20Form
https://<webapp>.azurewebsites.net/go?project=CEDAR&step=org
https://<webapp>.azurewebsites.net/go?project=CEDAR&dest=about
```

`/go` sends customers to `/portal/projects/…` and staff to `/projects/…` after
sign-in. Expand both audiences (JSON, no PHI):

```
GET https://<webapp>.azurewebsites.net/api/go?project=CEDAR&task=Organization%20Details%20Form
Authorization: Bearer <PRISM_READ_API_KEY>
```

Wrong/missing secret without a session → 404 (same convention as `/api/prism/snapshot`).

Same Blob Storage as task uploads.

To change infrastructure
(bump the App Service Plan tier, for instance), edit `azure/main.parameters.json`
or `azure/main.bicep` and re-run `./azure/deploy.sh` — it's a diff-and-apply
deployment, not a from-scratch one, so existing data is untouched.

## Custom domain

By default the app is reachable at `<name>.azurewebsites.net`. To put it on
your own domain (e.g. `implementations.pimsyehr.com`), add a CNAME record
pointing at that hostname, then run:

```
az webapp config hostname add \
  --webapp-name <AZURE_WEBAPP_NAME> \
  --resource-group <AZURE_RESOURCE_GROUP> \
  --hostname implementations.pimsyehr.com
```

Azure App Service issues a free managed TLS certificate for custom domains
automatically once the hostname is verified.

## Cost, roughly

At the default SKUs (App Service B1, Postgres Standard_B1ms, Storage
Standard_LRS, Container Registry Basic), this runs somewhere in the
neighborhood of $60-90/month, dominated by the App Service Plan and Postgres
server — actual pricing depends on region and changes over time, so check
the [Azure pricing calculator](https://azure.microsoft.com/pricing/calculator/)
for current numbers before committing. Both the App Service Plan and Postgres
SKU are one-parameter changes in `azure/main.parameters.json` if you need
more headroom later.

## Hardening ideas for later

This setup optimizes for "get a small team's real app running on Azure
without a dedicated cloud engineer." A few things worth doing before this
holds anything more sensitive, or scales past a handful of customers:

- **Network isolation**: Postgres currently allows all Azure-service traffic
  in (`AllowAllAzureServices`), and GitHub Actions gets a temporary
  IP-scoped firewall rule for migrations. VNET-integrating the Web App and
  Postgres server removes the need for either.
- **Secrets**: `AUTH_SECRET`, the Postgres password, and the Resend API key
  currently live as plain App Service settings. Azure Key Vault references
  keep them out of the App Service configuration blade entirely.
- **Scale-out**: a single Web App instance is fine until real load shows up.
  If you outgrow it, moving from App Service to Azure Container Apps (which
  this codebase's Docker image works with unchanged) gets you autoscaling.
