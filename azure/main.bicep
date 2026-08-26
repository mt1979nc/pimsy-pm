// PIMSY Implementations — Azure infrastructure
// -----------------------------------------------------------------------------
// Provisions everything the app needs to run on Azure:
//   - Azure Database for PostgreSQL (Flexible Server) — the app's database
//   - Storage Account + Blob container — file attachments (src/lib/storage.ts)
//   - Azure Container Registry — holds the Docker image built by CI
//   - App Service Plan (Linux) + Web App for Containers — runs the app
//
// Deploy with:
//   az deployment group create \
//     --resource-group <your-resource-group> \
//     --template-file azure/main.bicep \
//     --parameters azure/main.parameters.json
//
// See azure/README.md for the full walkthrough, including what to do the
// very first time (there's no image in the registry yet) and how the GitHub
// Actions workflow keeps it updated after that.

@description('Short name used as a prefix for every resource, e.g. "pimsy". Lowercase letters/numbers only, since it also seeds globally-unique names (storage account, registry, web app hostname).')
@minLength(3)
@maxLength(11)
param namePrefix string = 'pimsy'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Administrator username for the Postgres server.')
param postgresAdminLogin string = 'pimsyadmin'

@secure()
@description('Administrator password for the Postgres server. Generate one and keep it somewhere safe (a password manager) — you will need it if you ever connect with psql directly.')
param postgresAdminPassword string

@secure()
@description('Auth.js session secret. Generate with: openssl rand -base64 32')
param authSecret string

@description('Email address that becomes OWNER on first sign-in.')
param bootstrapOwnerEmail string

@description('Comma-separated email domains treated as internal staff (vs. customer contacts).')
param internalEmailDomains string = 'pimsyehr.com'

@secure()
@description('Resend API key for outbound email (magic links, notifications, password reset). Leave blank to run without email — links are only reachable via server logs, which is not useful in production, so set this for a real deployment.')
param resendApiKey string = ''

@description('App Service Plan SKU. B1 is the cheapest that reliably runs a Next.js server; step up to P0v3 or higher for real production traffic.')
param appServicePlanSku string = 'B1'

@description('Postgres Flexible Server SKU. Standard_B1ms is the cheapest burstable tier — fine for a small implementation team; step up if the team or customer count grows a lot.')
param postgresSku string = 'Standard_B1ms'

var appServicePlanName = '${namePrefix}-plan'
var webAppName = '${namePrefix}-app'
var postgresServerName = '${namePrefix}-pg-${uniqueString(resourceGroup().id)}'
// Storage account names are capped at 24 characters, so this drops any
// separator/word and just concatenates a short slice of the prefix with the
// uniqueness suffix.
var storageAccountName = toLower('${take(namePrefix, 8)}${uniqueString(resourceGroup().id)}')
var registryName = toLower('${namePrefix}acr${uniqueString(resourceGroup().id)}')
var uploadsContainerName = 'pimsy-uploads'
var databaseName = 'pimsy'
var placeholderImage = 'mcr.microsoft.com/appsvc/staticsite:latest' // swapped for the real image on first deploy — see README

// ---------------------------------------------------------------------------
// Postgres
// ---------------------------------------------------------------------------

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: postgresServerName
  location: location
  sku: {
    name: postgresSku
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }
}

resource postgresDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Lets the Web App (and the GitHub Actions runner, which has no fixed IP)
// reach the database. Postgres Flexible Server's own firewall is the only
// thing standing between the internet and the database otherwise, so this
// is the trade-off: convenience now, tighter with VNET integration later
// (see README's "hardening" section).
resource postgresAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: postgres
  name: 'AllowAllAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

var databaseUrl = 'postgresql://${postgresAdminLogin}:${postgresAdminPassword}@${postgres.properties.fullyQualifiedDomainName}:5432/${databaseName}?sslmode=require'

// ---------------------------------------------------------------------------
// Storage (file attachments)
// ---------------------------------------------------------------------------

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

resource uploadsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: uploadsContainerName
  properties: {
    publicAccess: 'None'
  }
}

var storageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net'

// ---------------------------------------------------------------------------
// Container registry
// ---------------------------------------------------------------------------

resource registry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: registryName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false // the Web App pulls with its managed identity instead
  }
}

// ---------------------------------------------------------------------------
// App Service
// ---------------------------------------------------------------------------

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: appServicePlanSku
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: webAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOCKER|${registry.properties.loginServer}/pimsy-pm:${placeholderImage}'
      acrUseManagedIdentityCreds: true
      alwaysOn: true
      appSettings: [
        { name: 'DATABASE_URL', value: databaseUrl }
        { name: 'DIRECT_URL', value: databaseUrl }
        { name: 'AUTH_SECRET', value: authSecret }
        { name: 'AUTH_URL', value: 'https://${webAppName}.azurewebsites.net' }
        { name: 'AUTH_TRUST_HOST', value: 'true' }
        { name: 'BOOTSTRAP_OWNER_EMAIL', value: bootstrapOwnerEmail }
        { name: 'INTERNAL_EMAIL_DOMAINS', value: internalEmailDomains }
        { name: 'RESEND_API_KEY', value: resendApiKey }
        { name: 'EMAIL_FROM', value: 'PIMSY Implementations <implementations@pimsyehr.com>' }
        { name: 'AZURE_STORAGE_CONNECTION_STRING', value: storageConnectionString }
        { name: 'AZURE_STORAGE_CONTAINER', value: uploadsContainerName }
        { name: 'WEBSITES_PORT', value: '3000' }
        { name: 'WEBSITES_ENABLE_APP_SERVICE_STORAGE', value: 'false' }
      ]
    }
  }
}

// Lets the Web App's managed identity pull images from the registry without
// storing a registry password anywhere.
resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, webApp.id, 'AcrPull')
  scope: registry
  properties: {
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '7f951dda-4ed3-4680-a7ca-43fe172d538d' // built-in "AcrPull" role
    )
  }
}

output webAppName string = webApp.name
output webAppUrl string = 'https://${webApp.properties.defaultHostName}'
output registryLoginServer string = registry.properties.loginServer
output postgresServerName string = postgres.name
output storageAccountName string = storageAccount.name
