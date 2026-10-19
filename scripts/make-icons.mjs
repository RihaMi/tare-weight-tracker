// Draws the app icons (a scale dial on cobalt) as PNGs with no dependencies.
// Run with `npm run icons`; output goes to public/.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const ACCENT = [0x24, 0x46, 0xd6];
const WHITE = [255, 255, 255];

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel((x + 0.5) / size, (y + 0.5) / size, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Signed distances, all in icon units (0..1).
const len = (x, y) => Math.hypot(x, y);
function roundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r), qy = Math.abs(py - cy) - (hh - r);
  return len(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
function segment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return len(px - (ax + t * dx), py - (ay + t * dy));
}
function upperArc(px, py, cx, cy, R) {
  if (py <= cy) return Math.abs(len(px - cx, py - cy) - R);
  return Math.min(len(px - (cx - R), py - cy), len(px - (cx + R), py - cy));
}

/** Coverage (0..1) of the white mark at a point; `k` scales the mark around the centre. */
function mark(u, v, size, k) {
  const x = 0.5 + (u - 0.5) / k, y = 0.5 + (v - 0.5) / k;
  const w = 0.058;
  const d = Math.min(
    Math.abs(roundRect(x, y, 0.5, 0.56, 0.3, 0.25, 0.12)) - w / 2,
    upperArc(x, y, 0.5, 0.54, 0.14) - w / 2,
    segment(x, y, 0.5, 0.54, 0.5 + 0.085, 0.54 - 0.085) - w / 2,
  );
  return Math.max(0, Math.min(1, 0.5 - (d * k * size)));
}
const mix = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));

function icon(size, { maskable = false, rounded = true } = {}) {
  return png(size, (u, v) => {
    let bgA = 1;
    if (!maskable && rounded) {
      const d = roundRect(u, v, 0.5, 0.5, 0.5, 0.5, 0.22);
      bgA = Math.max(0, Math.min(1, 0.5 - d * size));
    }
    const m = mark(u, v, size, maskable ? 0.78 : 1);
    const [r, g, b] = mix(ACCENT, WHITE, m);
    return [r, g, b, Math.round(255 * bgA)];
  });
}

mkdirSync('public', { recursive: true });
writeFileSync('public/icon-192.png', icon(192));
writeFileSync('public/icon-512.png', icon(512));
writeFileSync('public/icon-maskable-512.png', icon(512, { maskable: true }));
writeFileSync('public/apple-touch-icon.png', icon(180, { rounded: false }));
console.log('Icons written to public/');
