# ─────────────────────────────────────────────────────────────────────
#  demarrer-qg.ps1 — lance QG proprement en 2 fenêtres PowerShell
#  1. Tue les processus node.exe existants (évite les doublons de port)
#  2. Ouvre fenêtre #1 : npm run dev
#  3. Ouvre fenêtre #2 : claude
#  Usage : clic droit → "Exécuter avec PowerShell" OU depuis un terminal :
#    powershell -ExecutionPolicy Bypass -File .\demarrer-qg.ps1
# ─────────────────────────────────────────────────────────────────────

$ErrorActionPreference = 'Continue'
$projectPath = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ''
Write-Host '─────────────────────────────────────' -ForegroundColor Cyan
Write-Host '  QG — Startup script' -ForegroundColor Cyan
Write-Host '─────────────────────────────────────' -ForegroundColor Cyan
Write-Host ''

# ── 1) Tuer les node.exe orphelins ───────────────────────────────────
Write-Host '[1/3] Arrêt des processus Node.js existants...' -ForegroundColor Yellow
$nodeProcs = Get-Process -Name 'node' -ErrorAction SilentlyContinue
if ($nodeProcs) {
    $count = ($nodeProcs | Measure-Object).Count
    Write-Host "       $count processus node.exe trouvé(s) — termination..." -ForegroundColor Yellow
    $nodeProcs | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 400
    Write-Host '       OK — Node clean' -ForegroundColor Green
} else {
    Write-Host '       Aucun node.exe en cours — clean' -ForegroundColor Green
}

# ── 2) Fenêtre #1 : Vite dev server ──────────────────────────────────
Write-Host '[2/3] Lancement du dev server (npm run dev)...' -ForegroundColor Yellow
$devCommand = "Set-Location -Path '$projectPath'; Write-Host 'QG dev server' -ForegroundColor Cyan; npm run dev"
Start-Process -FilePath 'powershell.exe' `
    -ArgumentList '-NoExit', '-Command', $devCommand `
    -WorkingDirectory $projectPath | Out-Null
Write-Host '       OK — fenêtre dev server ouverte' -ForegroundColor Green

# Petit délai pour que Vite bind son port avant que claude se connecte
Start-Sleep -Milliseconds 800

# ── 3) Fenêtre #2 : Claude Code ──────────────────────────────────────
Write-Host '[3/3] Lancement de Claude Code...' -ForegroundColor Yellow
$claudeCommand = "Set-Location -Path '$projectPath'; Write-Host 'QG — Claude Code' -ForegroundColor Cyan; claude"
Start-Process -FilePath 'powershell.exe' `
    -ArgumentList '-NoExit', '-Command', $claudeCommand `
    -WorkingDirectory $projectPath | Out-Null
Write-Host '       OK — fenêtre Claude ouverte' -ForegroundColor Green

Write-Host ''
Write-Host 'QG démarré. 2 fenêtres PowerShell sont ouvertes.' -ForegroundColor Green
Write-Host 'http://localhost:5173' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Cette fenêtre se ferme dans 3 secondes...' -ForegroundColor DarkGray
Start-Sleep -Seconds 3
