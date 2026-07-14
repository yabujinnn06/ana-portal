param(
    [switch]$NoWait
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $root ".local"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Test-LocalPort([int]$Port) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $task = $client.ConnectAsync("127.0.0.1", $Port)
        if (-not $task.Wait(250)) { return $false }
        return $client.Connected
    }
    catch { return $false }
    finally { $client.Dispose() }
}

function Start-LocalProcess {
    param(
        [string]$Name,
        [int]$Port,
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$WorkingDirectory,
        [string]$LogName
    )

    if (Test-LocalPort $Port) {
        Write-Host "[hazir] $Name zaten calisiyor :$Port" -ForegroundColor DarkGreen
        return
    }

    $outLog = Join-Path $logDir "$LogName.out.log"
    $errLog = Join-Path $logDir "$LogName.err.log"
    Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory `
        -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden | Out-Null
    Write-Host "[aciliyor] $Name :$Port" -ForegroundColor Cyan
}

$python = (Get-Command python).Source
$npm = (Get-Command npm.cmd).Source
$bridgeSecret = "rainwater-local-module-bridge-2026-secure-key"

# Ana Portal API
$env:ENVIRONMENT = "development"
$env:DATABASE_URL = "sqlite:///./rainwater.db"
$env:JWT_SECRET = "rainwater-local-portal-jwt-secret-2026-secure-key"
$env:MODULE_BRIDGE_SECRET = $bridgeSecret
$env:CORS_ORIGINS = "http://127.0.0.1:5173,http://localhost:5173"
$env:PORTAL_PUBLIC_URL = "http://127.0.0.1:5173"
$env:PUANTAJ_PUBLIC_URL = "http://127.0.0.1:8001"
$env:RAINTEKLIF_PUBLIC_URL = "http://127.0.0.1:8012"
Start-LocalProcess -Name "Ana Portal API" -Port 8000 -FilePath $python `
    -Arguments @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000") `
    -WorkingDirectory (Join-Path $root "backend") -LogName "backend-local"

# Puantaj MVP
$env:DATABASE_URL = "sqlite:///./puantaj_dev.db"
$env:JWT_SECRET = "rainwater-local-puantaj-jwt-secret-2026-secure-key"
$env:AUTO_CREATE_SCHEMA = "false"
$env:SCHEMA_GUARD_STRICT = "false"
$env:NOTIFICATION_WORKER_ENABLED = "false"
$env:PORTAL_SSO_ENABLED = "true"
$env:PORTAL_CONTROL_PLANE_URL = "http://127.0.0.1:8000"
$env:PORTAL_MODULE_BRIDGE_SECRET = $bridgeSecret
$env:PORTAL_TENANT_SLUG = "rainwater"
$env:PORTAL_EMBED_ORIGIN = "http://127.0.0.1:5173"
$env:BASE_PUBLIC_URL = "http://127.0.0.1:8001"
$env:CORS_ALLOW_ORIGINS = "http://127.0.0.1:5173,http://localhost:5173"
Start-LocalProcess -Name "Puantaj MVP" -Port 8001 -FilePath $python `
    -Arguments @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8001") `
    -WorkingDirectory (Join-Path $root "modules\puantaj") -LogName "puantaj-local"

# Rain Teklif
$rainTeklifRoot = "C:\Users\yAbujin\Desktop\teklif rain"
$rainTeklifPython = Join-Path $rainTeklifRoot ".venv\Scripts\python.exe"
$env:RAINTOFFER_SECRET_KEY = "rainwater-local-rainteklif-secret-2026-secure-key"
$env:RAINTOFFER_ALLOWED_ORIGINS = "http://127.0.0.1:5173,http://localhost:5173"
$env:RAINTOFFER_PORTAL_SSO_ENABLED = "true"
$env:RAINTOFFER_PORTAL_CONTROL_PLANE_URL = "http://127.0.0.1:8000"
$env:RAINTOFFER_PORTAL_MODULE_BRIDGE_SECRET = $bridgeSecret
$env:RAINTOFFER_PORTAL_TENANT_SLUG = "rainwater"
$env:RAINTOFFER_PORTAL_ORIGIN = "http://127.0.0.1:5173"
Start-LocalProcess -Name "Rain Teklif" -Port 8012 -FilePath $rainTeklifPython `
    -Arguments @("-m", "uvicorn", "backend.app:app", "--host", "127.0.0.1", "--port", "8012") `
    -WorkingDirectory $rainTeklifRoot -LogName "rainteklif-local"

# Ana Portal arayuzu
Start-LocalProcess -Name "Ana Portal" -Port 5173 -FilePath $npm `
    -Arguments @("run", "dev", "--", "--host", "127.0.0.1", "--port", "5173") `
    -WorkingDirectory (Join-Path $root "frontend") -LogName "frontend-local"

if (-not $NoWait) {
    $deadline = (Get-Date).AddSeconds(30)
    do {
        $ready = (Test-LocalPort 5173) -and (Test-LocalPort 8000) -and (Test-LocalPort 8001) -and (Test-LocalPort 8012)
        if ($ready) { break }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)

    if (-not $ready) {
        Write-Host "Servislerden biri zamaninda acilmadi. .local klasorundeki *.err.log dosyalarini kontrol edin." -ForegroundColor Yellow
        exit 1
    }
}

Write-Host ""
Write-Host "Rainwater One hazir: http://127.0.0.1:5173/" -ForegroundColor Green
Write-Host "API: http://127.0.0.1:8000/health"
Write-Host "Puantaj: http://127.0.0.1:8001/health"
Write-Host "Rain Teklif: http://127.0.0.1:8012/"
