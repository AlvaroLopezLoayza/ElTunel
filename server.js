const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const url = require('url');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC = path.join(__dirname, 'public');

const rooms = new Map();

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 100_000) req.destroy();
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function makeCode() {
  for (let i = 0; i < 200; i++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    if (!rooms.has(code)) return code;
  }
  throw new Error('No fue posible generar código de sala');
}

function ensureRoom(code) {
  const room = rooms.get(code);
  if (!room) return null;
  room.lastSeen = Date.now();
  return room;
}

function controllerUrls() {
  const urls = [];
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) {
        urls.push(`http://${address.address}:${PORT}/control`);
      }
    }
  }
  return urls;
}

function mime(file) {
  const ext = path.extname(file).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
  })[ext] || 'application/octet-stream';
}

function staticFile(reqPath, res) {
  let rel = reqPath === '/' ? '/index.html' : reqPath;
  if (rel === '/host') rel = '/host.html';
  if (rel === '/control') rel = '/controller.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return false;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  const content = fs.readFileSync(file);
  res.writeHead(200, {
    'Content-Type': mime(file),
    'Content-Length': content.length,
    'Cache-Control': file.endsWith('.html') ? 'no-store' : 'public, max-age=300'
  });
  res.end(content);
  return true;
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  if (req.method === 'POST' && pathname === '/api/rooms') {
    const code = makeCode();
    rooms.set(code, { code, seq: 0, events: [], controllerSeen: 0, lastSeen: Date.now() });
    return json(res, 201, { code });
  }

  if (req.method === 'GET' && pathname === '/api/network') {
    return json(res, 200, { controllerUrls: controllerUrls() });
  }

  const joinMatch = pathname.match(/^\/api\/rooms\/(\d{4})\/join$/);
  if (req.method === 'POST' && joinMatch) {
    const room = ensureRoom(joinMatch[1]);
    if (!room) return json(res, 404, { error: 'Sala no encontrada' });
    room.controllerSeen = Date.now();
    room.seq += 1;
    room.events.push({ seq: room.seq, type: 'controller_join', at: Date.now() });
    if (room.events.length > 100) room.events.shift();
    return json(res, 200, { ok: true, code: room.code });
  }

  const actionMatch = pathname.match(/^\/api\/rooms\/(\d{4})\/actions$/);
  if (req.method === 'POST' && actionMatch) {
    const room = ensureRoom(actionMatch[1]);
    if (!room) return json(res, 404, { error: 'Sala no encontrada' });
    try {
      const body = await readBody(req);
      const allowed = new Set(['left', 'up', 'right', 'pause']);
      if (!allowed.has(body.action)) return json(res, 400, { error: 'Acción inválida' });
      room.controllerSeen = Date.now();
      room.seq += 1;
      room.events.push({ seq: room.seq, type: 'action', action: body.action, at: Date.now() });
      if (room.events.length > 100) room.events.shift();
      return json(res, 200, { ok: true, seq: room.seq });
    } catch {
      return json(res, 400, { error: 'JSON inválido' });
    }
  }

  const eventsMatch = pathname.match(/^\/api\/rooms\/(\d{4})\/events$/);
  if (req.method === 'GET' && eventsMatch) {
    const room = ensureRoom(eventsMatch[1]);
    if (!room) return json(res, 404, { error: 'Sala no encontrada' });
    const since = Number(parsed.query.since || 0);
    const events = room.events.filter(e => e.seq > since);
    return json(res, 200, {
      events,
      seq: room.seq,
      controllerConnected: Date.now() - room.controllerSeen < 5000
    });
  }

  const statusMatch = pathname.match(/^\/api\/rooms\/(\d{4})\/status$/);
  if (req.method === 'GET' && statusMatch) {
    const room = ensureRoom(statusMatch[1]);
    if (!room) return json(res, 404, { error: 'Sala no encontrada' });
    room.controllerSeen = Date.now();
    return json(res, 200, { controllerConnected: Date.now() - room.controllerSeen < 5000 });
  }

  if (req.method === 'GET' && staticFile(pathname, res)) return;
  json(res, 404, { error: 'No encontrado' });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.lastSeen > 6 * 60 * 60 * 1000) rooms.delete(code);
  }
}, 10 * 60 * 1000).unref();

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`EL TÚNEL disponible en http://localhost:${PORT}`);
    for (const controllerUrl of controllerUrls()) console.log(`Controlador: ${controllerUrl}`);
  });
}

module.exports = { server };
