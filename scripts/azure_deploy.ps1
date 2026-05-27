#Requires -Version 5.1
<#
.SYNOPSIS
  Provision Azure App Service resources for the EV Charging FastAPI app.

.PARAMETER ResourceGroupName
  Azure resource group name (created if it does not exist).

.PARAMETER AppName
  Globally unique Azure Web App name.

.PARAMETER Location
  Azure region (default: eastus).

.PARAMETER DatabaseEngine
  sqlite or postgres (default: sqlite).

.PARAMETER SessionSecret
  Optional session secret. A random value is generated when omitted.

.PARAMETER PostgresDsn
  PostgreSQL connection string when DatabaseEngine is postgres.

.EXAMPLE
  .\scripts\azure_deploy.ps1 -ResourceGroupName ev-charging-rg -AppName ev-charging-app-12345
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroupName,

    [Parameter(Mandatory = $true)]
    [string]$AppName,

    [string]$Location = "eastus",

    [ValidateSet("sqlite", "postgres")]
    [string]$DatabaseEngine = "sqlite",

    [SecureString]$SessionSecret,

    [SecureString]$PostgresDsn,

    [switch]$DeployCode
)

$ErrorActionPreference = "Stop"

function Write-Info([string]$Message) {
    Write-Host $Message -ForegroundColor Cyan
}

function Write-Success([string]$Message) {
    Write-Host $Message -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host $Message -ForegroundColor Yellow
}

function Test-AzCliInstalled {
    $az = Get-Command az -ErrorAction SilentlyContinue
    if (-not $az) {
        Write-Host ""
        Write-Host "Azure CLI (az) is not installed or not on PATH." -ForegroundColor Red
        Write-Host ""
        Write-Host "Install options:" -ForegroundColor Yellow
        Write-Host "  1. Windows MSI: https://aka.ms/installazurecliwindows"
        Write-Host "  2. winget:      winget install -e --id Microsoft.AzureCLI"
        Write-Host ""
        Write-Host "After installing, run 'az login' and rerun this script." -ForegroundColor Yellow
        exit 1
    }
}

function New-RandomSessionSecret {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return [Convert]::ToBase64String($bytes)
}

function ConvertTo-PlainText([SecureString]$SecureValue) {
    if (-not $SecureValue) {
        return $null
    }
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

Test-AzCliInstalled

Write-Info "Checking Azure login..."
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Warn "Not logged in. Running 'az login'..."
    az login | Out-Null
    $account = az account show | ConvertFrom-Json
}
Write-Info "Using subscription: $($account.name) ($($account.id))"

$plainSecret = ConvertTo-PlainText $SessionSecret
if (-not $plainSecret) {
    $plainSecret = New-RandomSessionSecret
    Write-Info "Generated a random SESSION_SECRET for this deployment."
}

$plainPostgresDsn = ConvertTo-PlainText $PostgresDsn
if ($DatabaseEngine -eq "postgres" -and -not $plainPostgresDsn) {
    Write-Warn "DatabaseEngine is postgres but PostgresDsn was not provided."
    Write-Warn "Deploy will continue; set POSTGRES_DSN in the portal or redeploy with -PostgresDsn."
}

Write-Info "Ensuring resource group '$ResourceGroupName' in '$Location'..."
az group create --name $ResourceGroupName --location $Location --output none

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$bicepFile = Join-Path $repoRoot "infra\azure\main.bicep"

if (-not (Test-Path $bicepFile)) {
    throw "Bicep template not found: $bicepFile"
}

Write-Info "Deploying Bicep template..."
$deploymentName = "ev-app-$(Get-Date -Format 'yyyyMMddHHmmss')"

$deployArgs = @(
    "deployment", "group", "create",
    "--resource-group", $ResourceGroupName,
    "--name", $deploymentName,
    "--template-file", $bicepFile,
    "--parameters",
    "appName=$AppName",
    "location=$Location",
    "databaseEngine=$DatabaseEngine",
    "sessionSecret=$plainSecret"
)

if ($plainPostgresDsn) {
    $deployArgs += "postgresDsn=$plainPostgresDsn"
}

az @deployArgs --output json | Out-Null

Write-Info "Verifying startup command..."
az webapp config set `
    --resource-group $ResourceGroupName `
    --name $AppName `
    --startup-file "bash scripts/azure_start.sh" `
    --output none

if ($DeployCode) {
    Write-Info "Deploying application code (this may take several minutes)..."
    Push-Location $repoRoot
    try {
        az webapp up `
            --resource-group $ResourceGroupName `
            --name $AppName `
            --runtime "PYTHON:3.12" `
            --sku B1 `
            --location $Location
    }
    finally {
        Pop-Location
    }
}

$hostname = az webapp show `
    --resource-group $ResourceGroupName `
    --name $AppName `
    --query "defaultHostName" `
    --output tsv

$appUrl = "https://$hostname"

Write-Host ""
Write-Success "Azure Web App provisioned successfully."
Write-Success "App URL: $appUrl"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
if (-not $DeployCode) {
    Write-Host "  1. Deploy code:"
    Write-Host "       .\scripts\azure_deploy.ps1 -ResourceGroupName $ResourceGroupName -AppName $AppName -DeployCode"
    Write-Host "     Or:"
    Write-Host "       az webapp up --resource-group $ResourceGroupName --name $AppName --runtime 'PYTHON:3.12'"
    Write-Host "     Or push to main to trigger the GitHub Actions workflow (configure AZURE_* secrets first)."
    Write-Host "  2. Open $appUrl and register a user."
}
else {
    Write-Host "  1. Open $appUrl and register a user."
    Write-Host "  2. Optional: set OPENCHARGEMAP_API_KEY in Azure portal -> Configuration."
}
Write-Host ""
Write-Host "Optional PostgreSQL env vars (portal -> Configuration -> Application settings):" -ForegroundColor Yellow
Write-Host "  DATABASE_ENGINE=postgres"
Write-Host "  POSTGRES_DSN=postgresql://USER:PASSWORD@HOST.postgres.database.azure.com:5432/DB?sslmode=require"
Write-Host "  DATABASE_URL  (same as POSTGRES_DSN)"
Write-Host ""
Write-Warn "SESSION_SECRET was set during provisioning. Store it securely; it is not printed here."
