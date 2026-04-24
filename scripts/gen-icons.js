// Generate PWA icons from scratch — no deps, uses only Node built-ins.
// Produces 3 solid-brand PNGs matching the header logo (two-square motif).
// Run: node scripts/gen-icons.js

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// PNG CRC32 (hardcoded table avoided — compute on the fly)
function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length, 0);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// Brand palette
const BG       = [10, 15, 28];     // #0a0f1c — deep space
const BRIGHT   = [241, 245, 249];  // #f1f5f9 — ice white
const DIM      = [102, 108, 116];  // muted grey (matches header logo dim)

function makePNG(size) {
  const w = size, h = size;
  // Two-square motif centred — proportions match the header logo
  const dotSize = Math.floor(size * 0.19);
  const gap     = Math.floor(size * 0.055);
  const totalW  = dotSize * 2 + gap;
  const cx      = Math.floor((w - totalW) / 2);
  const cy      = Math.floor((h - dotSize) / 2);
  const radius  = Math.floor(size * 0.02);

  // RGBA: 1 filter byte per row + 4 bytes per pixel
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: None
    for (let x = 0; x < w; x++) {
      const idx = y * (w * 4 + 1) + 1 + x * 4;

      // Rounded-corner helper
      const inRoundedRect = (rx, ry, rw, rh) => {
        if (x < rx || x >= rx + rw || y < ry || y >= ry + rh) return false;
        const dxL = x - rx, dxR = rx + rw - 1 - x;
        const dyT = y - ry, dyB = ry + rh - 1 - y;
        // Corners
        if (dxL < radius && dyT < radius) return (radius - dxL) ** 2 + (radius - dyT) ** 2 <= radius ** 2;
        if (dxR < radius && dyT < radius) return (radius - dxR) ** 2 + (radius - dyT) ** 2 <= radius ** 2;
        if (dxL < radius && dyB < radius) return (radius - dxL) ** 2 + (radius - dyB) ** 2 <= radius ** 2;
        if (dxR < radius && dyB < radius) return (radius - dxR) ** 2 + (radius - dyB) ** 2 <= radius ** 2;
        return true;
      };

      const inDot1 = inRoundedRect(cx, cy, dotSize, dotSize);
      const inDot2 = inRoundedRect(cx + dotSize + gap, cy, dotSize, dotSize);

      let c;
      if      (inDot1) c = BRIGHT;
      else if (inDot2) c = DIM;
      else             c = BG;

      raw[idx]     = c[0];
      raw[idx + 1] = c[1];
      raw[idx + 2] = c[2];
      raw[idx + 3] = 255;
    }
  }

  const idat = deflateSync(raw);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8]  = 8; // bit depth
  ihdr[9]  = 6; // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// SVG source (for maskable any-size support)
function makeSVG() {
  const size = 512;
  const dotSize = Math.floor(size * 0.19);
  const gap     = Math.floor(size * 0.055);
  const totalW  = dotSize * 2 + gap;
  const cx      = Math.floor((size - totalW) / 2);
  const cy      = Math.floor((size - dotSize) / 2);
  const r       = Math.floor(size * 0.02);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#0a0f1c"/>
  <rect x="${cx}" y="${cy}" width="${dotSize}" height="${dotSize}" rx="${r}" fill="#f1f5f9"/>
  <rect x="${cx + dotSize + gap}" y="${cy}" width="${dotSize}" height="${dotSize}" rx="${r}" fill="#666c74"/>
</svg>
`;
}

const publicDir = resolve(__dirname, '..', 'public');
mkdirSync(publicDir, { recursive: true });

writeFileSync(resolve(publicDir, 'icon-192.png'),        makePNG(192));
writeFileSync(resolve(publicDir, 'icon-512.png'),        makePNG(512));
writeFileSync(resolve(publicDir, 'apple-touch-icon.png'), makePNG(180));
writeFileSync(resolve(publicDir, 'icon.svg'),            makeSVG());

console.log('Icons written to public/ (icon-192.png, icon-512.png, apple-touch-icon.png, icon.svg)');
