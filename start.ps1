param(
  [switch]$SkipDocker
)

$ErrorActionPreference = 'Stop'

Write-Host "Installing server dependencies..."
npm install --no-audit --no-fund

Write-Host "Installing frontend dependencies..."
npm run install:frontend --no-audit --no-fund

Write-Host "Building frontend..."
npm run build

if (-not $SkipDocker) {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker is required to run MediaMTX. Install Docker Desktop and try again, or re-run with -SkipDocker."
  }
  Write-Host "Starting MediaMTX (Docker profile: streaming)..."
  docker compose --profile streaming up -d
}

Write-Host "Starting Headphone Party server on http://localhost:4173"
npm start
