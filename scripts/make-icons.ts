// 生成主屏图标（PWA / 安卓）：64×64 像素画——暮色天空、落日光晕、远山，前面一位头戴紫金冠、插雉鸡翎的武将半身像。
// 不画边框（安卓会把图标裁成圆形 / 圆角方形），主体放在中间八成的安全区里。
// 用法：npx vite-node scripts/make-icons.ts（改了立绘画法后重跑一次，产物提交进 public/）
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { C, PALETTE, blend } from '../src/art/palette';
import { Grid, ridge, seeded } from '../src/art/pixel';
import { drawBust } from '../src/art/bust';
import { lookFor } from '../src/art/units';

const N = 64;
const g = new Grid(N, N);
// 天：上深紫红，往下烧成金橙，分档不渐变
const sky = [C.darkPurple, blend(C.darkPurple, C.darkRed, 0.5), C.darkRed, blend(C.darkRed, C.red, 0.5), C.red, blend(C.red, C.orange, 0.5), C.orange, blend(C.orange, C.gold, 0.5), C.gold];
for (let y = 0; y < N; y++) {
  const t = Math.min(sky.length - 1, Math.floor((y / 46) * sky.length));
  for (let x = 0; x < N; x++) g.set(x, y, sky[t]);
}
// 落日光晕：几圈同心环，越往里越亮
const sunC = [blend(C.orange, C.yellow, 0.375), C.yellow, blend(C.yellow, C.white, 0.5)];
[[22, 0], [17, 1], [12, 2]].forEach(([r, k]) => g.ellipse(32, 30, r, r, sunC[k]));
// 远山两层剪影
const far = ridge(11, N, 46, 9, 14);
const near = ridge(23, N, 53, 6, 10);
for (let x = 0; x < N; x++) {
  for (let y = Math.round(far[x]); y < N; y++) g.set(x, y, blend(C.darkPurple, C.red, 0.375));
  for (let y = Math.round(near[x]); y < N; y++) g.set(x, y, C.darkPurple);
}
// 几片桃花
const rnd = seeded(5);
for (let i = 0; i < 9; i++) {
  const x = Math.floor(rnd() * N);
  const y = Math.floor(rnd() * 40);
  if (Math.hypot(x - 32, y - 30) < 24) continue;
  g.set(x, y, C.pink);
  g.set(x + 1, y, blend(C.pink, C.white, 0.5));
}
// 武将：紫金冠、雉鸡翎、金甲红袍
const hero = drawBust({ ...lookFor('m_lvbu'), cape: C.darkRed });
g.blit(hero, 0, 2);

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
