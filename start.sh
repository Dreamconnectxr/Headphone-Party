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
npm run install:frontend --no-audit --no-fund

echo "Building frontend..."
npm run build

echo "Starting MediaMTX (Docker profile: streaming)..."
docker compose --profile streaming up -d

echo "Starting Headphone Party server on http://localhost:4173"
exec npm start
