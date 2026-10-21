// 调色板索引的像素网格：先在网格上画，最后一次性转成画布
import { PALETTE } from './palette';

export class Grid {
  data: Uint8Array;

  constructor(public w: number, public h: number) {
    this.data = new Uint8Array(w * h);
  }

  in(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): number {
    return this.in(x, y) ? this.data[y * this.w + x] : 0;
  }

  set(x: number, y: number, c: number): void {
    x = Math.round(x);
    y = Math.round(y);
    if (this.in(x, y)) this.data[y * this.w + x] = c;
  }

  rect(x: number, y: number, w: number, h: number, c: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: number, test?: (x: number, y: number) => boolean): void {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1 && (!test || test(x, y))) this.set(x, y, c);
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, c: number): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }

  // 三角形/多边形填充（扫描线）
  poly(pts: [number, number][], c: number): void {
    const ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % pts.length];
        const yc = y + 0.5;
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, c);
    }
  }

  // 只在已有颜色 from 的像素上替换成 to
  recolor(from: number, to: number): void {
    for (let i = 0; i < this.data.length; i++) if (this.data[i] === from) this.data[i] = to;
  }

  // 每段同色像素的最右 n 个换成阴影色（光从左前方来）
  shadeRight(map: Record<number, number>, n = 2): void {
    for (let y = 0; y < this.h; y++) {
      let x = 0;
      while (x < this.w) {
        const c = this.get(x, y);
        let e = x;
        while (e + 1 < this.w && this.get(e + 1, y) === c) e++;
        const sh = map[c];
        if (c && sh !== undefined && e - x + 1 > n) for (let k = 0; k < n; k++) this.set(e - k, y, sh);
        x = e + 1;
      }
    }
  }

  // 自动描边：透明像素挨着实色就涂成描边色
  outline(c: number): void {
    const src = this.data.slice();
    const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < this.w && y < this.h ? src[y * this.w + x] : 0);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (at(x, y)) continue;
        if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) this.data[y * this.w + x] = c;
      }
    }
  }

  blit(src: Grid, ox: number, oy: number): void {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const c = src.get(x, y);
      if (c) this.set(ox + x, oy + y, c);
    }
  }

  clone(): Grid {
    const g = new Grid(this.w, this.h);
    g.data.set(this.data);
    return g;
  }

  flipX(): Grid {
    const g = new Grid(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) g.data[y * this.w + x] = this.get(this.w - 1 - x, y);
    return g;
  }

  // 顺时针转 90 度（倒地帧）
  rotateCW(): Grid {
    const g = new Grid(this.h, this.w);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) g.set(this.h - 1 - y, x, this.get(x, y));
    return g;
  }

  crop(x: number, y: number, w: number, h: number): Grid {
    const g = new Grid(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g.set(i, j, this.get(x + i, y + j));
    return g;
  }

  toCanvas(scale = 1): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = this.w * scale;
    cv.height = this.h * scale;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(cv.width, cv.height);
    const rgb = PALETTE.map((p) => (p.startsWith('#') ? [parseInt(p.slice(1, 3), 16), parseInt(p.slice(3, 5), 16), parseInt(p.slice(5, 7), 16)] : null));
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x++) {
        const c = this.data[Math.floor(y / scale) * this.w + Math.floor(x / scale)];
        const col = rgb[c];
        if (!col) continue;
        const o = (y * cv.width + x) * 4;
        img.data[o] = col[0];
        img.data[o + 1] = col[1];
        img.data[o + 2] = col[2];
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}

// 4×4 有序抖动，用来画天空渐变
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function dither(x: number, y: number, t: number): boolean {
  return t * 16 > BAYER[(y % 4) * 4 + (x % 4)] + 0.5;
}

// 一维平滑噪声（画山脊线）
export function ridge(seed: number, w: number, base: number, amp: number, freq: number): number[] {
  const pts: number[] = [];
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const knots: number[] = [];
  const n = Math.ceil(w / freq) + 2;
  for (let i = 0; i < n; i++) knots.push(rnd());
  for (let x = 0; x < w; x++) {
    const f = x / freq;
    const i = Math.floor(f);
    const t = f - i;
    const sm = t * t * (3 - 2 * t);
    pts.push(Math.round(base - amp * (knots[i] * (1 - sm) + knots[i + 1] * sm)));
  }
  return pts;
}

export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
