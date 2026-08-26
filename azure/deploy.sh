#!/usr/bin/env bash
# One-time provisioning script: creates the resource group (if needed) and
# every Azure resource the app runs on, from azure/main.bicep. Re-running
# this later is safe — it's an idempotent "make Azure match the template"
# deployment, not a from-scratch create.
#
# Requires: az CLI (https://learn.microsoft.com/cli/azure/install-azure-cli),
# logged in already (`az login`) with a subscription selected
# (`az account set --subscription <name-or-id>`).
#
# Usage:
#   ./azure/deploy.sh <resource-group-name> [location]
#
# Example:
#   ./azure/deploy.sh pimsy-prod eastus

set -euo pipefail

RESOURCE_GROUP="${1:?Usage: ./azure/deploy.sh <resource-group-name> [location]}"
LOCATION="${2:-eastus}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARAMS_FILE="$SCRIPT_DIR/main.parameters.json"

if grep -q "REPLACE_ME_BEFORE_DEPLOYING" "$PARAMS_FILE"; then
  echo "Edit azure/main.parameters.json first — it still has placeholder values in it:"
  echo "  - postgresAdminPassword: pick a strong password and keep it somewhere safe"
  echo "  - authSecret: generate one with: openssl rand -base64 32"
  exit 1
fi

echo "==> Creating resource group '$RESOURCE_GROUP' in $LOCATION (if it doesn't exist)"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

echo "==> Deploying infrastructure (this takes 5-10 minutes, mostly Postgres)"
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$SCRIPT_DIR/main.bicep" \
  --parameters "@$PARAMS_FILE" \
  --query "properties.outputs" \
  --output json | tee /tmp/pimsy-azure-outputs.json

echo ""
echo "==> Done. Outputs saved to /tmp/pimsy-azure-outputs.json"
echo ""
echo "Next steps (see azure/README.md for the full walkthrough):"
echo "  1. Add these as GitHub Actions secrets in your repo settings:"
echo "       AZURE_RESOURCE_GROUP = $RESOURCE_GROUP"
echo "     plus AZURE_CREDENTIALS, AZURE_WEBAPP_NAME, AZURE_REGISTRY_NAME,"
echo "     AZURE_POSTGRES_SERVER_NAME, DATABASE_URL"
echo "     (all but AZURE_CREDENTIALS are in /tmp/pimsy-azure-outputs.json)."
echo "  2. Push to main (or run the workflow manually) to build the image,"
echo "     run migrations, and deploy the first real revision — right now the"
echo "     Web App is still running a placeholder image with nothing on it."
