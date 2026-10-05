const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
TYPES['.json'] = 'application/manifest+json'; TYPES['.svg'] = 'image/svg+xml';
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const file = path.join(PUBLIC, path.normalize(url === '/' ? '/index.html' : url));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// Canales: Map<canal, Map<id, ws>>
const rooms = new Map();
let nextId = 1;
const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
const RELAY = new Set(['offer', 'answer', 'ice']);

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.id = String(nextId++);

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.type === 'join' && !ws.room) {
      ws.room = String(m.room || '1').slice(0, 32);
      ws.name = String(m.name || 'Anónimo').slice(0, 24);
      if (!rooms.has(ws.room)) rooms.set(ws.room, new Map());
      const peers = rooms.get(ws.room);
      const existing = [...peers.values()].map((p) => ({ id: p.id, name: p.name }));
      peers.set(ws.id, ws);
      send(ws, { type: 'welcome', id: ws.id, peers: existing });
      peers.forEach((p) => p !== ws && send(p, { type: 'peer-joined', id: ws.id, name: ws.name }));
      return;
    }

    const peers = rooms.get(ws.room);
    if (!peers) return;

    if (RELAY.has(m.type) && m.to) {
      const target = peers.get(m.to);
      if (target) send(target, { ...m, from: ws.id });
    } else if (m.type === 'talking') {
      peers.forEach((p) => p !== ws && send(p, { type: 'talking', from: ws.id, on: !!m.on }));
    }
  });

  ws.on('close', () => {
    const peers = rooms.get(ws.room);
    if (!peers) return;
    peers.delete(ws.id);
    peers.forEach((p) => send(p, { type: 'peer-left', id: ws.id }));
    if (!peers.size) rooms.delete(ws.room);
  });
});

server.listen(PORT, () => console.log(`Radio listo en http://localhost:${PORT}`));
    
