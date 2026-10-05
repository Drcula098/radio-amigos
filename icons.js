const zlib = require('zlib');

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};

const SHAPES = [
  [0, 0, 512, 512, 0, [42, 47, 36]],
  [96, 150, 320, 260, 40, [230, 223, 200]],
  [130, 184, 252, 70, 12, [20, 23, 15]],
  [214, 298, 84, 84, 42, [200, 67, 31]],
  [330, 60, 26, 110, 13, [230, 223, 200]],
];
const inside = (px, py, [x, y, w, h, r]) => {
  const dx = Math.max(x + r - px, 0, px - (x + w - r));
  const dy = Math.max(y + r - py, 0, py - (y + h - r));
  return px >= x && px <= x + w && py >= y && py <= y + h && dx * dx + dy * dy <= r * r;
};

const cache = {};
function png(size) {
  if (cache[size]) return cache[size];
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let j = 0; j < size; j++) {
    raw[j * (size * 3 + 1)] = 0;
    for (let i = 0; i < size; i++) {
      const px = ((i + 0.5) * 512) / size, py = ((j + 0.5) * 512) / size;
      let color = SHAPES[0][5];
      for (const s of SHAPES) if (inside(px, py, s)) color = s[5];
      raw.set(color, j * (size * 3 + 1) + 1 + i * 3);
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4);
  head[8] = 8; head[9] = 2;
  return (cache[size] = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]));
}

const MANIFEST = JSON.stringify({
  name: 'Radio amigos', short_name: 'Radio', start_url: '/', scope: '/',
  display: 'standalone', background_color: '#2a2f24', theme_color: '#2a2f24',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  ],
});

module.exports = (req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/manifest.json') {
    res.writeHead(200, { 'Content-Type': 'application/manifest+json' });
    res.end(MANIFEST);
    return true;
  }
  const m = url.match(/^\/icon-(192|512)\.png$/);
  if (m) {
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
    res.end(png(Number(m[1])));
    return true;
  }
  return false;
};
