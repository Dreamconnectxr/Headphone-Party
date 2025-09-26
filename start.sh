#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to run MediaMTX. Please install Docker and try again." >&2
  exit 1
fi

echo "Installing server dependencies..."
npm install --no-audit --no-fund

echo "Installing frontend dependencies..."
npm run install:frontend -- --no-audit --no-fund

echo "Building frontend..."
npm run build

echo "Starting MediaMTX (Docker profile: streaming)..."
docker compose --profile streaming up -d

LAN_IP=$(node -e "const os=require('os');const nets=os.networkInterfaces();const ips=[];for(const list of Object.values(nets)){for(const entry of list||[]){if(entry.family==='IPv4'&&!entry.internal&&!entry.address.startsWith('169.254'))ips.push(entry.address);}}process.stdout.write(ips[0]||'localhost');")
if [ -z "$LAN_IP" ]; then
  LAN_IP="localhost"
fi

echo ""
echo "Headphone Party endpoints"
echo "--------------------------"
echo "Host control room:   http://$LAN_IP:4173/host"
echo "Guest QR page:       http://$LAN_IP:4173/qr"
echo "Browser WHIP ingest: http://$LAN_IP:8889/whip/party"
echo "Guest WHEP pull:     http://$LAN_IP:8889/whep/party"
echo "OBS RTMP server:     rtmp://$LAN_IP:1935/live (stream key: party)"
echo ""
echo "Starting Headphone Party server on http://0.0.0.0:4173 (press Ctrl+C to stop)"
exec npm start
