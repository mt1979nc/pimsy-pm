# Running PIMSY Implementations on Azure

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
workflow: build image, push, migrate, redeploy. To change infrastructure
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
