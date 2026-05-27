#Requires -Version 5.1
<#
.SYNOPSIS
  Run the EV app locally and expose it on the internet with ngrok.

.EXAMPLE
  .\scripts\ngrok_online.ps1
#>
[CmdletBinding()]
param(
    [int]$Port = 8000,
    [string]$NgrokAuthToken = $env:NGROK_AUTHTOKEN
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Write-Info([string]$Message) {
    Write-Host $Message -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host $Message -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host $Message -ForegroundColor Yellow
}

function Ensure-Ngrok {
    $ngrok = Get-Command ngrok -ErrorAction SilentlyContinue
    if ($ngrok) {
        return $ngrok.Source
    }

    Write-Warn "ngrok not found. Installing via winget..."
    winget install -e --id Ngrok.Ngrok --accept-package-agreements --accept-source-agreements | Out-Null

    $candidates = @(
        "$env:LOCALAPPDATA\Microsoft\WinGet\Links\ngrok.exe",
        "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
    )
    foreach ($path in $candidates) {
        if (Test-Path $path) {
            return $path
        }
    }
    throw "ngrok install failed. Install from https://ngrok.com/download and rerun."
}

function Ensure-AuthToken([string]$NgrokPath, [string]$Token) {
    if ($Token) {
        & $NgrokPath config add-authtoken $Token | Out-Null
        return
    }
    $configPath = Join-Path $env:USERPROFILE ".ngrok2\ngrok.yml"
    $configPathNew = Join-Path $env:LOCALAPPDATA "ngrok\ngrok.yml"
    if (-not (Test-Path $configPath) -and -not (Test-Path $configPathNew)) {
        Write-Host ""
        Write-Warn "ngrok requires a free authtoken."
        Write-Host "  1. Sign up: https://dashboard.ngrok.com/signup"
        Write-Host "  2. Copy your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken"
        Write-Host "  3. Run:"
        Write-Host "       `$env:NGROK_AUTHTOKEN='YOUR_TOKEN'"
        Write-Host "       .\scripts\ngrok_online.ps1"
        Write-Host "     Or: ngrok config add-authtoken YOUR_TOKEN"
        Write-Host ""
        throw "NGROK_AUTHTOKEN not set."
    }
}

function Start-AppServer([int]$ListenPort, [string]$Root) {
    $existing = Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Info "App already listening on port $ListenPort."
        return $null
    }

    Write-Info "Starting EV app on http://127.0.0.1:$ListenPort ..."
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "python"
    $psi.Arguments = "-m uvicorn backend:app --host 127.0.0.1 --port $ListenPort --proxy-headers --forwarded-allow-ips=*"
    $psi.WorkingDirectory = $Root
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    return [System.Diagnostics.Process]::Start($psi)
}

function Start-NgrokTunnel([string]$NgrokPath, [int]$ListenPort) {
    Write-Info "Starting ngrok tunnel to port $ListenPort ..."
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $NgrokPath
    $psi.Arguments = "http $ListenPort --log=stdout"
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    return [System.Diagnostics.Process]::Start($psi)
}

function Get-NgrokPublicUrl {
    param([int]$MaxAttempts = 30)
    for ($i = 0; $i -lt $MaxAttempts; $i++) {
        Start-Sleep -Seconds 1
        try {
            $resp = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2
            $https = $resp.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1
            if ($https.public_url) {
                return $https.public_url.TrimEnd("/")
            }
        }
        catch {
            continue
        }
    }
    return $null
}

function Update-EnvPublicUrl([string]$Root, [string]$PublicUrl) {
    $envPath = Join-Path $Root ".env"
    $lines = @()
    if (Test-Path $envPath) {
        $lines = Get-Content $envPath | Where-Object { $_ -notmatch '^\s*PUBLIC_APP_URL\s*=' }
    }
    $lines += "PUBLIC_APP_URL=$PublicUrl"
    Set-Content -Path $envPath -Value $lines -Encoding UTF8
}

Push-Location $repoRoot
try {
    $ngrokPath = Ensure-Ngrok
    Ensure-AuthToken -NgrokPath $ngrokPath -Token $NgrokAuthToken

    $appProcess = Start-AppServer -ListenPort $Port -Root $repoRoot
    $ngrokProcess = Start-NgrokTunnel -NgrokPath $ngrokPath -ListenPort $Port

    $publicUrl = Get-NgrokPublicUrl
    if (-not $publicUrl) {
        throw "Could not read ngrok public URL. Open http://127.0.0.1:4040 and check the tunnel."
    }

    Update-EnvPublicUrl -Root $repoRoot -PublicUrl $publicUrl
    $env:PUBLIC_APP_URL = $publicUrl

    Write-Host ""
    Write-Ok "Your app is online:"
    Write-Ok "  $publicUrl"
    Write-Ok "  $publicUrl/login.html"
    Write-Ok "  $publicUrl/dashboard.html"
    Write-Host ""
    Write-Host "Local:  http://127.0.0.1:$Port" -ForegroundColor DarkGray
    Write-Host "ngrok UI: http://127.0.0.1:4040" -ForegroundColor DarkGray
    Write-Warn "Keep this window open. Press Ctrl+C to stop ngrok and the app."
    Write-Host ""

    try {
        while (-not $ngrokProcess.HasExited) {
            Start-Sleep -Seconds 2
        }
    }
    finally {
        if ($ngrokProcess -and -not $ngrokProcess.HasExited) {
            $ngrokProcess.Kill()
        }
        if ($appProcess -and -not $appProcess.HasExited) {
            $appProcess.Kill()
        }
    }
}
finally {
    Pop-Location
}
