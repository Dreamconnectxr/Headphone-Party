#!/usr/bin/env node
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const url = require('node:url');

const PORT = parseInt(process.env.PORT || '4173', 10);
const HOST = process.env.HOST || '0.0.0.0';
const distDir = path.resolve(__dirname, '../frontend/dist');

const clients = new Set();
const partyState = {
  bpm: null,
  beatTimestamp: null,
  messageId: 0,
  hostConnected: false,
};

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const { pathname } = parsedUrl;

  if (pathname === '/api/info' && req.method === 'GET') {
    const localIPs = getLocalIPs();
    sendJson(res, 200, {
      name: 'Headphone Party',
      localIPs,
      bpm: partyState.bpm,
      beatTimestamp: partyState.beatTimestamp,
      hostConnected: partyState.hostConnected,
    });
    return;
  }

  if (pathname === '/api/state' && req.method === 'GET') {
    sendJson(res, 200, buildStatePayload());
    return;
  }

  if (pathname === '/api/events' && req.method === 'GET') {
    setupSse(res);
    return;
  }

  if (pathname === '/api/sync' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.socket.destroy();
      }
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        handleSyncMessage(payload, res);
      } catch (err) {
        sendJson(res, 400, { error: 'Invalid JSON body' });
      }
    });
    return;
  }

  await serveStaticAsset(pathname, res);
});

server.on('clientError', (err, socket) => {
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function setupSse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  res.write(`event: state\ndata: ${JSON.stringify(buildStatePayload())}\n\n`);
  clients.add(res);

  const keepAlive = setInterval(() => {
    if (!clients.has(res)) {
      clearInterval(keepAlive);
      return;
    }
    try {
      res.write(': keep-alive\n\n');
    } catch (err) {
      clearInterval(keepAlive);
      clients.delete(res);
    }
  }, 15000);

  res.on('close', () => {
    clearInterval(keepAlive);
    clients.delete(res);
  });
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch (err) {
      clients.delete(client);
    }
  }
}

function handleSyncMessage(message, res) {
  const now = Date.now();
  switch (message.type) {
    case 'host-status': {
      const wasConnected = partyState.hostConnected;
      partyState.hostConnected = Boolean(message.connected);
      if (!wasConnected && partyState.hostConnected) {
        broadcast('host', { connected: true });
      } else if (wasConnected && !partyState.hostConnected) {
        broadcast('host', { connected: false });
      }
      sendJson(res, 200, { ok: true });
      return;
    }
    case 'sync-update': {
      const bpm = typeof message.bpm === 'number' && isFinite(message.bpm) ? message.bpm : null;
      if (!bpm || bpm <= 0) {
        sendJson(res, 400, { error: 'Invalid BPM value' });
        return;
      }
      partyState.bpm = bpm;
      partyState.beatTimestamp = now;
      partyState.messageId += 1;
      const payload = buildStatePayload();
      broadcast('state', payload);
      sendJson(res, 200, { ok: true });
      return;
    }
    case 'sync-clear': {
      partyState.bpm = null;
      partyState.beatTimestamp = null;
      partyState.messageId += 1;
      const payload = buildStatePayload();
      broadcast('state', payload);
      sendJson(res, 200, { ok: true });
      return;
    }
    default:
      sendJson(res, 400, { error: 'Unknown sync message type' });
  }
}

async function serveStaticAsset(requestPath, res) {
  try {
    let filePath = requestPath;
    if (!filePath || filePath === '/' || filePath === '') {
      filePath = '/index.html';
    }
    filePath = decodeURIComponent(filePath);
    let resolvedPath = path.join(distDir, filePath);
    if (!resolvedPath.startsWith(distDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const stat = await fs.promises.stat(resolvedPath).catch(() => null);
    if (!stat || stat.isDirectory()) {
      resolvedPath = path.join(distDir, 'index.html');
    }

    const stream = fs.createReadStream(resolvedPath);
    stream.on('error', () => {
      res.writeHead(404);
      res.end('Not Found');
    });
    stream.on('open', () => {
      res.writeHead(200, {
        'Content-Type': getMimeType(resolvedPath),
        'Cache-Control': resolvedPath.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
      });
    });
    stream.pipe(res);
  } catch (err) {
    res.writeHead(500);
    res.end('Server Error');
  }
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html';
    case '.js':
      return 'application/javascript';
    case '.css':
      return 'text/css';
    case '.json':
      return 'application/json';
    case '.wasm':
      return 'application/wasm';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}

function buildStatePayload() {
  return {
    bpm: partyState.bpm,
    beatTimestamp: partyState.beatTimestamp,
    messageId: partyState.messageId,
    hostConnected: partyState.hostConnected,
    serverTime: Date.now(),
  };
}

function getLocalIPs() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    const netInterface = nets[name];
    if (!netInterface) continue;
    for (const net of netInterface) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push({ interface: name, address: net.address });
      }
    }
  }
  return results;
}

server.listen(PORT, HOST, () => {
  console.log(`Headphone Party control server running at http://${HOST}:${PORT}`);
  console.log(`Serving static files from: ${distDir}`);
});

process.on('SIGINT', () => {
  console.log('\nShutting down Headphone Party server.');
  server.close(() => process.exit(0));
});
