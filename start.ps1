param(
  [switch]$SkipDocker
)

$ErrorActionPreference = 'Stop'

Write-Host "Installing server dependencies..."
npm install --no-audit --no-fund

Write-Host "Installing frontend dependencies..."
npm run install:frontend -- --no-audit --no-fund

Write-Host "Building frontend..."
npm run build

if (-not $SkipDocker) {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker is required to run MediaMTX. Install Docker Desktop and try again, or re-run with -SkipDocker."
  }
  try {
    docker info | Out-Null
  } catch {
    Write-Error "Docker Desktop is installed but not running. Start Docker Desktop and try again, or re-run with -SkipDocker."
  }
  Write-Host "Starting MediaMTX (Docker profile: streaming)..."
  try {
    docker compose --profile streaming up -d | Out-Null
  } catch {
    Write-Error "Failed to start MediaMTX via Docker. Ensure Docker Desktop is running, or re-run with -SkipDocker."
  }
} else {
  Write-Host "Skipping MediaMTX startup (-SkipDocker requested)."
}

$lanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -ExpandProperty IPAddress -First 1)
if (-not $lanIp) {
  $lanIp = 'localhost'
}

Write-Host ""
Write-Host "Headphone Party endpoints"
Write-Host "--------------------------"
Write-Host "Local machine (use this for microphone capture):"
Write-Host "  Host control room:   http://localhost:4173/host"
Write-Host "  Guest QR page:       http://localhost:4173/qr"
Write-Host "  Browser WHIP ingest: http://localhost:8889/whip/party"
Write-Host "  Guest WHEP pull:     http://localhost:8889/whep/party"
Write-Host "  OBS RTMP server:     rtmp://localhost:1935/live (stream key: party)"
if ($lanIp -and $lanIp -ne 'localhost' -and $lanIp -ne '127.0.0.1') {
  Write-Host ""
  Write-Host "LAN share (give this to guests on your network):"
  Write-Host ("  Host control room:   http://{0}:4173/host" -f $lanIp)
  Write-Host ("  Guest QR page:       http://{0}:4173/qr" -f $lanIp)
  Write-Host ("  Browser WHIP ingest: http://{0}:8889/whip/party" -f $lanIp)
  Write-Host ("  Guest WHEP pull:     http://{0}:8889/whep/party" -f $lanIp)
  Write-Host ("  OBS RTMP server:     rtmp://{0}:1935/live (stream key: party)" -f $lanIp)
}
Write-Host ""
Write-Host "Starting Headphone Party server on http://0.0.0.0:4173"
npm start
