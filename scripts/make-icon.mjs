/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Renders build/icon.png: the ExploreFly mark (two offset blocks) in white on a black square.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const S = 512;

// Same geometry as the Logo component, in the 2001 px source frame
const BLOCKS = [[842, 188, 1850, 1120], [150, 1120, 842, 1842]];
const box = [150, 188, 1850, 1842];
const scale = (S * 0.62) / Math.max(box[2] - box[0], box[3] - box[1]);
const ox = (S - (box[2] - box[0]) * scale) / 2 - box[0] * scale;
const oy = (S - (box[3] - box[1]) * scale) / 2 - box[1] * scale;

const rgba = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const k = (y * S + x) * 4;
  // 4x4 supersampling keeps the block edges crisp but not jagged
  let cover = 0;
  for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
    const px = x + (sx + 0.5) / 4, py = y + (sy + 0.5) / 4;
    if (BLOCKS.some(([x0, y0, x1, y1]) => px >= ox + x0 * scale && px < ox + x1 * scale && py >= oy + y0 * scale && py < oy + y1 * scale)) cover++;
  }
  const v = Math.round((cover / 16) * 255);
  rgba[k] = v; rgba[k + 1] = v; rgba[k + 2] = v; rgba[k + 3] = 255;
}

// Minimal PNG encoder
const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b) => {
  let c = 0xffffffff;
  for (const v of b) c = table[(c ^ v) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
};
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) rgba.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
mkdirSync(join(ROOT, 'build'), { recursive: true });
writeFileSync(join(ROOT, 'build', 'icon.png'), Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
]));
console.log('build/icon.png');
