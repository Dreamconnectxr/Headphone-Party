# Headphone Party

Headphone Party is a local-first silent disco toolkit. It combines a MediaMTX streaming core with a React + Vite control surface so a DJ can broadcast audio across a Wi-Fi network. Guests scan a QR code, join from their browser, and stay phase-aligned with BPM-aware delay controls.

## Features

- 🎧 **Local-only audio distribution** over WebRTC (WHIP/WHEP) with RTMP ingest fallback.
- 🕹️ **Host control room** to publish audio, tap the beat, and broadcast BPM to guests.
- 🕒 **Per-guest delay trim** with beat alignment button and nudge controls.
- 📲 **QR onboarding** that advertises the best LAN URL automatically.
- 📡 **Status dashboard** showing BPM, host presence, and sync heartbeat.
- 🔊 **Web Audio visualizer** to see when your stream is alive.

## Prerequisites

- Node.js 18 or newer.
- npm (ships with Node.js).
- Docker Engine or Docker Desktop (needed for MediaMTX). You can skip Docker with the provided scripts if you want to run MediaMTX elsewhere.

## Quick start

### Windows (PowerShell)

```powershell
# From the project root
./start.ps1
```

The script will:

1. Install server and frontend dependencies (`npm install`).
2. Build the Vite frontend.
3. Launch MediaMTX in Docker.
4. Start the Headphone Party control server on <http://localhost:4173>.

> Need to use an existing MediaMTX instance? Run `./start.ps1 -SkipDocker` to keep Docker untouched.

### macOS / Linux (Bash or compatible shell)

```bash
# From the project root
./start.sh
```

The Bash script performs the same steps as the PowerShell version and blocks while the Node.js server is running. Press `Ctrl+C` to stop the party when you are finished. Use `docker compose --profile streaming down` if you want to shut down MediaMTX after quitting the Node server.

## Streaming workflow

1. **Spin everything up** using one of the start scripts above.
2. Open <http://localhost:4173/host> on the DJ computer. You should see:
   - Broadcast controls for MediaMTX.
   - A BPM tap panel and broadcast button.
   - Helpful tips and the local join URLs detected from your network interfaces.
3. Click **Start broadcast** to capture audio from your default input (consider using a virtual cable or loopback device for your DJ software). The page uses WHIP to publish to MediaMTX at `http://localhost:8889/whip/party` by default.
4. If you prefer external tooling (OBS, ffmpeg, etc.), stream RTMP to `rtmp://<host>:1935/live/party`. Guests will keep working because the guest player pulls from the WHEP endpoint for the same stream key.
5. Tap the beat until the BPM stabilizes, then press **Broadcast BPM** so everyone can lock on.

## Guest experience

1. Guests connect to the same Wi-Fi as the host.
2. The host shares the QR code shown at <http://localhost:4173/qr>. The code resolves to the best LAN URL detected by the server.
3. Guests hit **Play** on the player, optionally reconnect if network hiccups occur, and use the delay slider / nudge buttons to fine tune.
4. Press **Align to Beat** to snap delay to the next beat interval using the host's BPM broadcast. Guests can also tap their own BPM and compare to the party BPM.

## Synchronisation strategy

- The host determines BPM manually (tap-to-tempo) and shares it with the control server.
- The server timestamps BPM updates with its own monotonic clock and relays them to all clients via Server-Sent Events (SSE).
- Each guest measures the delta between the server timestamp and the current time to compute where the beat should fall, then delays playback locally with a `DelayNode` (0–2000 ms range).
- Guests can micro-adjust with ±10 ms nudges if they still hear drift.
- Because WebRTC delivery stays within the LAN and MediaMTX keeps latency low, most guests need <100 ms of trim to land perfectly on the beat.

## Configuration

- **Docker profile**: the `docker-compose.yml` uses the `streaming` profile so you can start MediaMTX independently (`docker compose --profile streaming up -d`).
- **MediaMTX config**: `mediamtx.yml` enables WebRTC (WHIP/WHEP) and RTMP with two ready-to-use paths (`party` and `live`).
- **Server port**: the Node server listens on port `4173` by default. Set the `PORT` environment variable before running a start script to override it.
- **Frontend**: Vite + TypeScript lives in `frontend/`. Use standard commands (`npm run dev --prefix frontend`) if you want hot reloading during development.

## Development tips

- Run `npm run dev:frontend` to launch the Vite dev server (requires MediaMTX separately).
- Start the Node server on its own with `npm start` (serves production assets from `frontend/dist`).
- If you edit MediaMTX settings, restart the Docker container: `docker compose --profile streaming restart`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Browser prompts for microphone but you hear nothing | Ensure the browser tab stays focused during capture, and confirm your virtual cable is set as the default input. |
| Guests get "connection failed" | Check that MediaMTX is running and reachable on port 8889. The guest page shows the configured WHEP URL – adjust it if you host MediaMTX elsewhere. |
| Audio drifts out of sync after a few songs | Have the DJ re-tap BPM and broadcast the new value, then guests hit **Align to Beat** again. |
| Docker port conflicts | Edit `docker-compose.yml` to disable `network_mode: host` and map explicit ports if needed. |

## Project structure

```
Headphone-Party/
├── docker-compose.yml        # MediaMTX runtime config (Docker)
├── mediamtx.yml              # MediaMTX settings (paths, WebRTC/RTMP)
├── server/                   # Node.js control server + SSE hub
├── frontend/                 # Vite + React TypeScript UI
├── start.sh / start.ps1      # One-command bootstrap scripts
└── README.md                 # This guide
```

Enjoy hosting your own headphone party! 🎉
