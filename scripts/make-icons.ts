// 生成主屏图标（PWA）：用游戏里的武将头像，铺朱红底、金边，最近邻放大后写 PNG
// 用法：npx vite-node scripts/make-icons.ts（改了头像画法后重跑一次，产物提交进 public/）
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { C, PALETTE } from '../src/art/palette';
import { Grid } from '../src/art/pixel';
import { drawAvatar, heroLook } from '../src/art/units';

const N = 32;
const g = new Grid(N, N);
g.rect(0, 0, N, N, C.darkRed);
g.rect(2, 2, N - 4, N - 4, C.red);
for (let i = 2; i < N - 2; i++) {
  g.set(i, 2, C.gold);
  g.set(i, N - 3, C.gold);
  g.set(2, i, C.gold);
  g.set(N - 3, i, C.gold);
}
const av = drawAvatar(heroLook('warrior', 'male', 0));
for (let y = 0; y < av.h; y++) for (let x = 0; x < av.w; x++) {
  const c = av.get(x, y);
  if (c) g.set(x + (N - av.w) / 2, y + (N - av.h) / 2, c);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Buffer): number => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer): Buffer => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size: number): Buffer {
  const s = size / N;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const hex = PALETTE[g.get(Math.floor(x / s), Math.floor(y / s))];
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = parseInt(hex.slice(1, 3), 16);
      raw[o + 1] = parseInt(hex.slice(3, 5), 16);
      raw[o + 2] = parseInt(hex.slice(5, 7), 16);
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const size of [192, 512, 180]) writeFileSync(`public/icon-${size}.png`, png(size));
console.log('icons written');
