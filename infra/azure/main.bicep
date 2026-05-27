targetScope = 'resourceGroup'

@description('Azure region for App Service resources')
param location string = resourceGroup().location

@description('Globally unique name for the Web App (also used for the App Service plan name suffix)')
param appName string

@description('Database engine: sqlite or postgres')
@allowed([
  'sqlite'
  'postgres'
])
param databaseEngine string = 'sqlite'

@secure()
@description('Secret key for session cookies. Generate a strong random value; never commit this.')
param sessionSecret string

@description('App Service plan SKU (Basic B1 by default)')
param appServicePlanSku string = 'B1'

@description('Optional PostgreSQL connection string when databaseEngine is postgres')
@secure()
param postgresDsn string = ''

var sqliteAppSettings = [
  {
    name: 'DATABASE_ENGINE'
    value: databaseEngine
  }
  {
    name: 'SQLITE_PATH'
    value: '/home/data/ev_app.db'
  }
  {
    name: 'SESSION_SECRET'
    value: sessionSecret
  }
  {
    name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
    value: 'true'
  }
  {
    name: 'EMAIL_DEV_OUTBOX'
    value: 'false'
  }
  {
    name: 'WEBSITES_PORT'
    value: '8000'
  }
  {
    name: 'PYTHON_VERSION'
    value: '3.12'
  }
]

var postgresAppSettings = !empty(postgresDsn) ? [
  {
    name: 'POSTGRES_DSN'
    value: postgresDsn
  }
  {
    name: 'DATABASE_URL'
    value: postgresDsn
  }
] : []

var appSettings = concat(sqliteAppSettings, postgresAppSettings)

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${appName}-plan'
  location: location
  sku: {
    name: appServicePlanSku
    tier: 'Basic'
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'PYTHON|3.12'
      appCommandLine: 'bash scripts/azure_start.sh'
      alwaysOn: true
      appSettings: [
        for setting in appSettings: {
          name: setting.name
          value: setting.value
        }
      ]
    }
  }
}

output webAppUrl string = 'https://${webApp.properties.defaultHostName}'
output webAppName string = webApp.name
output resourceGroupName string = resourceGroup().name

// PostgreSQL Flexible Server (optional, not deployed by default):
// Create separately, then redeploy with databaseEngine=postgres and postgresDsn set.
// Required app settings for postgres mode:
//   DATABASE_ENGINE=postgres
//   POSTGRES_DSN=postgresql://USER:PASSWORD@HOST.postgres.database.azure.com:5432/DATABASE?sslmode=require
//   DATABASE_URL  (same value as POSTGRES_DSN, optional alias)
