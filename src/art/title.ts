// 标题页：春日清晨的全彩像素背景（分层远景、桃花、飘云、飞鸟、落花）和金色招牌字。
// 只给标题页用，不走 32 色调色板；按 2 倍放大显示。
import Phaser from 'phaser';
import { ridge, seeded } from './pixel';

const ch = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
export function mixc(a: number, b: number, t: number): number {
  const [ar, ag, ab] = ch(a);
  const [br, bg, bb] = ch(b);
  t = Math.max(0, Math.min(1, t));
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

// 多段渐变取色
function ramp(stops: number[], t: number): number {
  t = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  return mixc(stops[i], stops[i + 1], t - i);
}

// 全彩像素画布：带透明度，后画的按 alpha 叠在上面
class Px {
  data: Uint8ClampedArray;

  constructor(public w: number, public h: number) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  set(x: number, y: number, c: number, a = 1): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const o = (y * this.w + x) * 4;
    const [r, g, b] = ch(c);
    const ea = this.data[o + 3] / 255;
    const na = a + ea * (1 - a);
    const k = na ? a / na : 0;
    this.data[o] = this.data[o] + (r - this.data[o]) * k;
    this.data[o + 1] = this.data[o + 1] + (g - this.data[o + 1]) * k;
    this.data[o + 2] = this.data[o + 2] + (b - this.data[o + 2]) * k;
    this.data[o + 3] = na * 255;
  }

  get(x: number, y: number): number {
    const o = (y * this.w + x) * 4;
    return (this.data[o] << 16) | (this.data[o + 1] << 8) | this.data[o + 2];
  }

  alpha(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }

  disc(cx: number, cy: number, r: number, c: number | ((x: number, y: number, dx: number, dy: number) => number | null)): void {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const dx = (x + 0.5 - cx) / r;
        const dy = (y + 0.5 - cy) / r;
        if (dx * dx + dy * dy > 1) continue;
        const col = typeof c === 'number' ? c : c(x, y, dx, dy);
        if (col !== null) this.set(x, y, col);
      }
    }
  }

  toCanvas(): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = this.w;
    cv.height = this.h;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    img.data.set(this.data);
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}

// 分档渐变：每档同色，档与档之间只有一行稀疏交错，远看平滑、近看干净
function bands(p: Px, x0: number, y0: number, w: number, h: number, stops: number[], n: number): void {
  const colorOf = (k: number) => ramp(stops, (k + 0.5) / n);
  for (let y = 0; y < h; y++) {
    const k = Math.min(n - 1, Math.floor((y / h) * n));
    const last = Math.floor(((y + 1) / h) * n) !== k && k < n - 1;
    for (let x = 0; x < w; x++) p.set(x0 + x, y0 + y, last && (x + y) % 2 === 0 ? colorOf(k + 1) : colorOf(k));
  }
}

const SUN = 0xfffbea;
const HAZE = 0xfde8c8;

interface Layout {
  w: number;
  h: number;
  hz: number;
  sx: number;
  sy: number;
}

function layout(w: number, h: number): Layout {
  const hz = Math.round(h * 0.5);
  return { w, h, hz, sx: Math.round(w * 0.84), sy: hz - 74 };
}

function drawSky(L: Layout): Px {
  const p = new Px(L.w, L.hz + 4);
  bands(p, 0, 0, L.w, L.hz + 4, [0x4a8fd8, 0x6fb0e8, 0xa2d4f2, 0xd8ecf0, HAZE], 14);
  // 太阳的光晕：一圈圈阶梯，越往外越淡
  const rings: [number, number][] = [[44, 0.07], [30, 0.13], [20, 0.22], [13, 0.4], [9, 0.7]];
  for (const [r, a] of rings) {
    for (let y = L.sy - r - 1; y <= L.sy + r + 1; y++) for (let x = L.sx - r - 1; x <= L.sx + r + 1; x++) {
      const d = Math.hypot(x + 0.5 - L.sx, (y + 0.5 - L.sy) * 1.05);
      if (d <= r) p.set(x, y, 0xfff4d6, a);
    }
  }
  p.disc(L.sx, L.sy, 6, SUN);
  // 斜射的光柱，非常淡
  for (let k = 0; k < 5; k++) {
    const ang = Math.PI * (0.62 + k * 0.075);
    const half = 0.018 + (k % 2) * 0.01;
    for (let y = 0; y < L.hz; y++) for (let x = 0; x < L.w; x++) {
      const a = Math.atan2(y - L.sy, x - L.sx);
      const d = Math.hypot(x - L.sx, y - L.sy);
      if (d > 12 && Math.abs(a - ang) < half) p.set(x, y, 0xffffff, 0.06 * Math.max(0, 1 - d / 170));
    }
  }
  return p;
}

// 尖峰山：几座山峰取下包络，再叠一点起伏。明暗分界从峰顶顺着山脊弯弯曲曲往下走（右坡朝阳）
interface Range {
  line: number[];
  px: number[];
  py: number[];
}

function peakLine(rnd: () => number, w: number, base: number, lo: number, hi: number, n: number, slope: number, seed: number): Range {
  const ps = Array.from({ length: n }, (_, i) => ({
    x: ((i + 0.2 + rnd() * 0.6) / n) * (w + 40) - 20,
    y: base - (lo + rnd() * (hi - lo)),
    s: slope * (0.75 + rnd() * 0.5),
  }));
  const jit = ridge(seed, w, 0, 5, 6);
  const out: Range = { line: [], px: [], py: [] };
  for (let x = 0; x < w; x++) {
    let best = base;
    let bp = ps[0];
    for (const pk of ps) {
      const dx = Math.abs(x - pk.x);
      const y = pk.y + pk.s * dx * (1 - Math.min(0.4, dx / 100));
      if (y < best) {
        best = y;
        bp = pk;
      }
    }
    // 越靠山脚起伏越大，峰顶保持尖
    const k = Math.min(1, (best - bp.y) / 10);
    out.line.push(Math.round(Math.min(base, best - jit[x] * 0.6 * k)));
    out.px.push(bp.x);
    out.py.push(bp.y);
  }
  return out;
}

function mountainLayer(p: Px, m: Range, bottom: number, body: number, light: number, crest: number, mist: number, mistH: number): void {
  for (let x = 0; x < p.w; x++) {
    const top = m.line[x];
    for (let y = top; y < bottom; y++) {
      const d = y - m.py[x];
      const edge = m.px[x] + Math.sin(d * 0.22 + m.px[x]) * 2.2 + d * 0.35;
      const lit = x > edge;
      let c = lit ? light : body;
      if (lit && y - top < 1) c = crest;
      // 山脚雾气：分三档越往下越白
      const fog = Math.max(0, 1 - (bottom - y) / mistH);
      const lv = Math.floor(fog * 3) / 3;
      p.set(x, y, mixc(c, mist, lv * 0.75));
    }
  }
}

function city(p: Px, x0: number, x1: number, base: number, wall: number, lit: number, dark: number): void {
  const wh = 6;
  for (let x = x0; x < x1; x++) for (let y = base - wh; y < base; y++) p.set(x, y, wall);
  for (let x = x0; x < x1; x += 3) p.set(x, base - wh - 1, wall);
  for (let x = x0; x < x1; x++) p.set(x, base - wh, lit);
  // 城楼两层，飞檐上翘
  const tx = Math.round((x0 + x1) / 2);
  const tier = (cx: number, y: number, hw: number, hh: number) => {
    for (let yy = y - hh; yy < y; yy++) for (let x = cx - hw + 2; x <= cx + hw - 2; x++) p.set(x, yy, dark);
    for (let x = cx - hw; x <= cx + hw; x++) p.set(x, y - hh, wall);
    for (let x = cx - hw + 1; x <= cx + hw - 1; x++) p.set(x, y - hh - 1, wall);
    for (let x = cx - hw + 1; x <= cx + hw - 1; x++) p.set(x, y - hh - 1, lit, x > cx ? 1 : 0.4);
    p.set(cx - hw - 1, y - hh - 1, wall);
    p.set(cx + hw + 1, y - hh - 1, wall);
  };
  tier(tx, base - wh, 9, 4);
  tier(tx, base - wh - 5, 6, 3);
  for (let y = base - 4; y < base; y++) for (let x = tx - 1; x <= tx + 1; x++) p.set(x, y, dark);
}

function drawFar(L: Layout): Px {
  const p = new Px(L.w, L.hz + 4);
  const rnd = seeded(4242);
  const far = peakLine(rnd, L.w, L.hz - 18, 34, 58, 5, 1.05, 11);
  mountainLayer(p, far, L.hz + 4, 0xaec8e4, 0xc8dcef, 0xe2eef8, 0xf2ece0, 30);
  const mid = peakLine(rnd, L.w, L.hz - 4, 16, 34, 4, 0.8, 23);
  mountainLayer(p, mid, L.hz + 4, 0x86a8d2, 0xa6c2e2, 0xd2e4f4, 0xe8ecec, 22);
  city(p, Math.round(L.w * 0.02), Math.round(L.w * 0.3), L.hz - 1, 0x93abc8, 0xc2d4e6, 0x6f8bb0);
  // 一层横着的薄雾
  for (let y = L.hz - 6; y < L.hz + 4; y++) for (let x = 0; x < L.w; x++) p.set(x, y, 0xf6f0e4, y < L.hz - 3 ? 0.25 : 0.5);
  return p;
}

function bush(p: Px, cx: number, cy: number, r: number, dark: number, body: number, light: number): void {
  p.disc(cx, cy, r, (_x, _y, dx, dy) => (dx + -dy * 0.6 > 0.55 ? light : dx - dy < -0.7 ? dark : body));
}

function house(p: Px, x: number, base: number, w: number, h: number): void {
  const wall = 0xf4efe2;
  const wallSh = 0xd8cdb6;
  for (let y = base - h; y < base; y++) for (let i = 0; i < w; i++) p.set(x + i, y, i < 2 ? wallSh : wall);
  for (let i = 0; i < w; i++) p.set(x + i, base - 1, 0xc9bb9e);
  // 青瓦屋顶，两端起翘
  const rt = base - h;
  for (let k = 0; k < 5; k++) for (let i = -3 + k; i < w + 3 - k; i++) p.set(x + i, rt - k, k === 4 ? 0x3e4659 : k === 0 ? 0x2f3646 : 0x56607a);
  for (let i = -2; i < w + 2; i += 2) p.set(x + i, rt - 1, 0x7d88a3);
  p.set(x - 4, rt - 1, 0x2f3646);
  p.set(x + w + 3, rt - 1, 0x2f3646);
  p.set(x - 4, rt - 2, 0x3e4659);
  p.set(x + w + 3, rt - 2, 0x3e4659);
  // 门和窗
  const dx = x + Math.floor(w / 2) - 2;
  for (let y = base - 6; y < base; y++) for (let i = 0; i < 4; i++) p.set(dx + i, y, i === 3 ? 0x5a3a26 : 0x7a5236);
  for (const wx of [x + 3, x + w - 6]) for (let y = rt + 3; y < rt + 6; y++) for (let i = 0; i < 3; i++) p.set(wx + i, y, (i + y) % 2 ? 0xa07a50 : 0x6a4a30);
}

function blossom(p: Px, cx: number, cy: number, r: number, rnd: () => number): void {
  const n = Math.round(r * r * 0.55) + 4;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * r;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d * 0.75;
    // 整个树冠右上受光、左下背光
    const lx = (x - cx) / r - (y - cy) / r;
    const base = lx > 0.45 ? 0xf8b9cd : lx < -0.55 ? 0xd77496 : 0xf09ab8;
    const rr = 1 + rnd() * 1.6;
    p.disc(x, y, rr, (_x, _y, dx, dy) => (dx - dy > 0.9 ? 0xffdde8 : dy > 0.6 ? mixc(base, 0xb85a80, 0.35) : base));
  }
  for (let i = 0; i < r * 1.5; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * r;
    p.set(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.75, rnd() < 0.6 ? 0xfff6fa : 0xffe0ea);
  }
}

function branch(p: Px, pts: [number, number][], w0: number, w1: number): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const tt = (i + t) / (pts.length - 1);
      const r = w0 + (w1 - w0) * tt;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      for (let j = -Math.ceil(r); j <= Math.ceil(r); j++) {
        if (Math.abs(j) > r) continue;
        p.set(x, y + j, Math.abs(j) > r - 0.6 ? 0x2e1c18 : j < -r * 0.2 ? 0x8a5e4c : j > r * 0.35 ? 0x3f2822 : 0x5e3d34);
      }
    }
  }
}

function drawNear(L: Layout): Px {
  const { w, h, hz } = L;
  const p = new Px(w, h);
  const rnd = seeded(777);
  // 近处的绿丘
  const hill = ridge(31, w, hz + 2, 12, 26);
  for (let x = 0; x < w; x++) for (let y = hill[x]; y < hz + 6; y++) {
    const d = y - hill[x];
    p.set(x, y, d < 1 ? 0xc4e690 : d < 4 ? 0x9fd06c : 0x86c05a);
  }
  for (let x = 4; x < w; x += 9 + Math.floor(rnd() * 8)) bush(p, x, hill[x] + 1, 3 + rnd() * 2.5, 0x4f8f48, 0x6aab52, 0x9ad070);
  // 田野：远浅近深
  bands(p, 0, hz + 4, w, h - hz - 4, [0xb6dc86, 0x98cc64, 0x7cba50, 0x64a744, 0x4f9139], 9);
  // 小路，透视越近越宽，略弯
  const pathAt = (y: number) => {
    const t = (y - hz - 4) / (h - hz - 4);
    return { cx: w * 0.5 - t * t * w * 0.08 + Math.sin(t * 3.2) * 4, half: 1.5 + Math.pow(t, 1.25) * 24, t };
  };
  for (let y = hz + 4; y < h; y++) {
    const { cx, half, t } = pathAt(y);
    const l = Math.round(cx - half);
    const r = Math.round(cx + half);
    for (let x = l; x <= r; x++) {
      const u = (x - l) / Math.max(1, r - l);
      p.set(x, y, u > 0.55 && u < 0.8 ? 0xf3e2b6 : u < 0.12 ? 0xd2b47c : 0xe8d09a);
    }
    if (t > 0.1) {
      p.set(l - 1, y, 0x8bbf5c);
      p.set(r + 1, y, 0x8bbf5c);
    }
  }
  for (let i = 0; i < 40; i++) {
    const y = hz + 10 + Math.floor(rnd() * (h - hz - 12));
    const { cx, half } = pathAt(y);
    p.set(cx + (rnd() - 0.5) * half * 1.6, y, 0xcdb07c);
  }
  // 村舍和树
  bush(p, 12, hz + 1, 6, 0x3f7a3a, 0x5e9f48, 0x8cc466);
  house(p, 16, hz + 8, 18, 9);
  bush(p, w - 10, hz, 7, 0x3f7a3a, 0x5e9f48, 0x8cc466);
  house(p, w - 38, hz + 10, 20, 10);
  bush(p, w - 44, hz + 7, 4, 0x3f7a3a, 0x5e9f48, 0x8cc466);
  // 草丛：越近越大越密，避开小路
  for (let i = 0; i < w * (h - hz) * 0.0065; i++) {
    const gy = hz + 6 + Math.floor(Math.pow(rnd(), 0.8) * (h - hz - 6));
    const gx = Math.floor(rnd() * w);
    const m = 2 + Math.floor(rnd() * 4);
    for (let j = 0; j < m; j++) {
      const y = Math.round(gy + (rnd() - 0.5) * 4);
      const x = Math.round(gx + (rnd() - 0.5) * 10);
      if (y >= h) continue;
      const { cx, half, t } = pathAt(y);
      if (Math.abs(x - cx) < half + 2) continue;
      const bh = 1 + Math.round(t * 3);
      const dark = mixc(0x3f7f34, 0x6aa84c, 0.25 + 0.5 * (1 - t));
      for (let k = 0; k < bh; k++) {
        p.set(x, y - k, dark);
        if (bh > 2 && k < bh - 1) {
          p.set(x - 1, y - k + 1, dark);
          p.set(x + 1, y - k + 1, dark);
        }
      }
      if (rnd() < 0.4) p.set(x + 1, y - bh, 0xcdeb96);
    }
  }
  // 野花
  for (let i = 0; i < 70; i++) {
    const y = hz + 8 + Math.floor(rnd() * (h - hz - 10));
    const x = Math.floor(rnd() * w);
    const { cx, half } = pathAt(y);
    if (Math.abs(x - cx) < half + 3) continue;
    const c = [0xffffff, 0xfff07a, 0xffb0c8, 0xe8f0ff][i % 4];
    p.set(x, y, c);
    if (i % 3 === 0) p.set(x + 1, y, c);
  }
  // 左下一株桃树
  const tx = 18;
  const ty = Math.round(hz + (h - hz) * 0.68);
  branch(p, [[tx - 8, h + 2], [tx - 2, ty + 28], [tx + 5, ty + 8], [tx + 3, ty - 14]], 5, 2);
  branch(p, [[tx + 5, ty + 14], [tx + 18, ty - 2]], 1.6, 0.8);
  branch(p, [[tx + 1, ty + 4], [tx - 10, ty - 8]], 1.5, 0.8);
  for (const [bx, by, r] of [[tx - 10, ty - 10, 9], [tx + 17, ty - 5, 9], [tx + 3, ty - 18, 11], [tx + 8, ty, 7], [tx - 4, ty + 6, 6], [tx + 24, ty + 4, 5]] as [number, number, number][]) blossom(p, bx, by, r, rnd);
  // 落在草上的花瓣
  for (let i = 0; i < 30; i++) p.set(tx + (rnd() - 0.2) * 44, ty + 26 + rnd() * 20, rnd() < 0.5 ? 0xf8b4c8 : 0xffe0ea);
  // 右上角斜进来一枝桃花，框住画面
  branch(p, [[w + 4, 4], [w - 16, 14], [w - 34, 20], [w - 46, 30]], 2.4, 0.8);
  branch(p, [[w - 22, 16], [w - 30, 6]], 1.1, 0.6);
  for (const [bx, by, r] of [[w - 6, 9, 7], [w - 24, 20, 6], [w - 31, 5, 4], [w - 44, 31, 5], [w - 1, 21, 5], [w - 15, 13, 4]] as [number, number, number][]) blossom(p, bx, by, r, rnd);
  // 最下面一排深色草叶，压住画面底边
  for (let x = 0; x < w; x++) {
    const bh = 3 + Math.round((Math.sin(x * 0.9) + Math.sin(x * 0.37 + 1)) * 1.5 + rnd() * 3);
    for (let k = 0; k < bh; k++) p.set(x, h - 1 - k, k > bh - 2 ? 0x4c8c3c : 0x356a30);
  }
  return p;
}

function cloud(seed: number, w: number, h: number): Px {
  const p = new Px(w, h);
  const rnd = seeded(seed);
  const lumps: [number, number, number][] = [];
  const n = 3 + Math.floor(w / 10);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const r = (h * 0.62) * (0.45 + Math.sin(t * Math.PI) * 0.55) * (0.8 + rnd() * 0.3);
    lumps.push([t * (w - 2 * r) + r, h - 2 - r * 0.75, r]);
  }
  const inside = (x: number, y: number) => y < h - 2 && lumps.some(([cx, cy, r]) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    const below = h - 2 - y;
    // 光从右上来：右上边缘亮，底下两行发蓝
    let c = 0xf4f8fc;
    if (!inside(x + 1, y - 1) || !inside(x, y - 1)) c = 0xffffff;
    if (below < 2) c = 0xc4d6ec;
    else if (below < 4) c = 0xdae6f3;
    p.set(x, y, c);
  }
  return p;
}

function petal(a: number, b: number): Px {
  const p = new Px(2, 2);
  p.set(0, 0, a);
  p.set(1, 0, b);
  p.set(1, 1, a);
  return p;
}

function bird(up: boolean): Px {
  const p = new Px(7, 4);
  const c = 0x37475e;
  p.set(3, 2, c);
  if (up) {
    p.set(2, 1, c); p.set(1, 0, c); p.set(4, 1, c); p.set(5, 0, c);
  } else {
    p.set(2, 2, c); p.set(1, 3, c); p.set(4, 2, c); p.set(5, 3, c); p.set(0, 3, c); p.set(6, 3, c);
  }
  return p;
}

function tex(scene: Phaser.Scene, key: string, make: () => Px): string {
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, make().toCanvas());
  return key;
}

// 铺好整张标题背景并让它动起来；返回地平线的屏幕 y（给按钮排版参考）
export function titleBackdrop(scene: Phaser.Scene, sw: number, sh: number): number {
  const L = layout(Math.ceil(sw / 2), Math.ceil(sh / 2));
  const k = `${L.w}x${L.h}`;
  scene.add.image(0, 0, tex(scene, `tt:sky:${k}`, () => drawSky(L))).setOrigin(0).setScale(2);
  // 云：慢慢往左飘，出了画面从右边回来
  const specs: [number, number, number, number, number][] = [[1, 46, 14, 6, 9], [2, 30, 10, 22, 6], [3, 60, 16, L.hz - 58, 5], [4, 24, 8, L.hz - 44, 4], [5, 38, 11, L.hz - 34, 7]];
  for (const [seed, cw, chh, cy, speed] of specs) {
    const img = scene.add.image(((seed * 0.37) % 1) * sw, cy * 2, tex(scene, `tt:cloud:${seed}`, () => cloud(seed * 31, cw, chh))).setOrigin(0).setScale(2);
    const yf = cy / L.hz;
    img.setAlpha(yf > 0.5 ? 0.85 : 1);
    scene.tweens.add({
      targets: img, x: -cw * 2, duration: ((img.x + cw * 2) / speed) * 1000, ease: 'Linear',
      onComplete: () => {
        img.x = sw;
        scene.tweens.add({ targets: img, x: -cw * 2, duration: ((sw + cw * 2) / speed) * 1000, ease: 'Linear', repeat: -1 });
      },
    });
  }
  scene.add.image(0, 0, tex(scene, `tt:far:${k}`, () => drawFar(L))).setOrigin(0).setScale(2);
  // 鸟群：隔一阵从右往左飞过远山
  const bu = tex(scene, 'tt:bird:u', () => bird(true));
  const bd = tex(scene, 'tt:bird:d', () => bird(false));
  const birds = [0, 1, 2].map((i) => scene.add.image(-40, 0, bu).setScale(2).setData('i', i));
  const flock = () => {
    const y0 = (L.hz - 60 + Math.random() * 20) * 2;
    birds.forEach((b, i) => {
      b.setPosition(sw + 20 + i * 18, y0 + (i === 1 ? -10 : i * 6));
      scene.tweens.add({ targets: b, x: -30, y: b.y - 30, duration: 14000, delay: i * 200, ease: 'Linear' });
    });
  };
  flock();
  scene.time.addEvent({ delay: 20000, loop: true, callback: flock });
  scene.time.addEvent({ delay: 260, loop: true, callback: () => birds.forEach((b, i) => b.setTexture((Math.floor(scene.time.now / 260) + i) % 2 ? bu : bd)) });
  scene.add.image(0, 0, tex(scene, `tt:near:${k}`, () => drawNear(L))).setOrigin(0).setScale(2);
  // 落花：从桃树那边飘下来，左右摆
  const pa = tex(scene, 'tt:petal:a', () => petal(0xf7a6c0, 0xffd8e6));
  const pb = tex(scene, 'tt:petal:b', () => petal(0xffe4ee, 0xf3a0bc));
  for (let i = 0; i < 16; i++) {
    const img = scene.add.image(0, 0, i % 2 ? pa : pb).setScale(2);
    const drop = (first: boolean) => {
      const fromRight = Math.random() < 0.45;
      img.setPosition(fromRight ? sw - 20 - Math.random() * 90 : Math.random() * 110, fromRight ? Math.random() * 60 : sh * 0.62 + Math.random() * 40);
      if (first) img.y += Math.random() * sh * 0.3;
      img.setAngle(Math.random() * 90);
      const dur = 7000 + Math.random() * 6000;
      scene.tweens.add({
        targets: img, x: img.x - 60 - Math.random() * 80, y: Math.min(sh - 8, img.y + 160 + Math.random() * 200), angle: img.angle + 360,
        duration: dur, ease: 'Sine.easeIn', delay: first ? Math.random() * 6000 : 0, onComplete: () => drop(false),
      });
      scene.tweens.add({ targets: img, alpha: { from: 1, to: 0 }, duration: 900, delay: (first ? 0 : 0) + dur - 900 });
    };
    drop(true);
  }
  return L.hz * 2;
}

// 招牌字：点阵字放大，金色竖向渐变 + 顶边高光 + 深棕描边 + 投影
export function logoTex(scene: Phaser.Scene, str: string): string {
  const key = `tt:logo:${str}`;
  if (scene.textures.exists(key)) return key;
  const cw = str.length * 12;
  const src = document.createElement('canvas');
  src.width = cw;
  src.height = 14;
  const sc = src.getContext('2d')!;
  sc.font = '12px FusionPixel';
  sc.textBaseline = 'top';
  sc.fillStyle = '#fff';
  sc.fillText(str, 0, 1);
  const a = sc.getImageData(0, 0, cw, 14).data;
  const S = 2;
  const pad = 4;
  const p = new Px(cw * S + pad * 2, 14 * S + pad * 2);
  const on = (x: number, y: number) => {
    const sx = Math.floor((x - pad) / S);
    const sy = Math.floor((y - pad) / S);
    return sx >= 0 && sy >= 0 && sx < cw && sy < 14 && a[(sy * cw + sx) * 4 + 3] > 110;
  };
  const near = (x: number, y: number, r: number) => {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (Math.abs(i) + Math.abs(j) <= r + (r > 1 ? 1 : 0) && on(x + i, y + j)) return true;
    return false;
  };
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    if (on(x, y)) continue;
    if (near(x - 2, y - 3, 2)) p.set(x, y, 0x2a1406, 0.45);
  }
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    if (on(x, y)) continue;
    if (near(x, y, 2)) p.set(x, y, near(x, y, 1) ? 0x5a1e08 : 0xfff2d0);
  }
  const top = pad + S;
  const bot = pad + 13 * S;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    if (!on(x, y)) continue;
    const t = (y - top) / (bot - top);
    let c = ramp([0xfffbe0, 0xffe27a, 0xf7bc3c, 0xe48a1c, 0xb85a10], Math.floor(t * 6) / 5);
    if (!on(x, y - 1)) c = 0xfffff4;
    else if (!on(x, y + 1)) c = 0x8a3c0a;
    p.set(x, y, c);
  }
  scene.textures.addCanvas(key, p.toCanvas());
  return key;
}
