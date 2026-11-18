// Fills the local database with sample products (solid-color placeholder images). Run: npm run seed
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import type { Unit } from '../shared/types.ts';
import { uploadsDir } from '../server/db.ts';
import { createProduct, listProducts } from '../server/store.ts';

if (listProducts().length) {
  console.log('Products already exist, nothing to do.');
  process.exit(0);
}

const samples: [string, number, Unit, [number, number, number]][] = [
  ['Bedana tuxumi', 1500, 'piece', [214, 196, 168]],
  ['Tovuq tuxumi', 1800, 'piece', [236, 214, 180]],
  ["Bedana go'shti", 85000, 'kg', [196, 120, 96]],
  ['Bedana (tirik)', 12000, 'piece', [150, 132, 110]],
];

for (const [name, price, unit, rgb] of samples) {
  const imageFile = `seed-${Math.random().toString(36).slice(2)}.png`;
  writeFileSync(join(uploadsDir, imageFile), solidPng(400, rgb));
  createProduct({ name, price, unit, pack: unit === 'piece' ? { size: 10, price: price * 10 } : null, description: '', imageFiles: [imageFile] });
}
console.log(`Seeded ${samples.length} products.`);

function solidPng(size: number, [r, g, b]: number[]): Buffer {
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array(size).fill(row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
