// 地点场景（主界面横幅、战斗背景、小地图）：按地形程序生成，种子固定所以每次一样
import { Grid, ridge, seeded } from './pixel';
import { C, blend } from './palette';

export type SceneArt = 'village' | 'forest' | 'hill' | 'bamboo' | 'grass' | 'manor' | 'valley' | 'gate' | 'camp' | 'road' | 'city' | 'farm' | 'river' | 'cave'
  | 'tomb' | 'marsh' | 'ruins' | 'pass' | 'altar';

interface Ctx {
  g: Grid;
  w: number;
  h: number;
  horizon: number;
  rnd: () => number;
  haze: number;
}

// 分档渐变：每档同色，不再整片棋盘格；交界不加交错行（手机上看像扫描线）
function bandFill(g: Grid, x0: number, y0: number, w: number, h: number, top: number, bottom: number, n = Math.max(3, Math.min(9, Math.round(h / 4)))): void {
  const col = (k: number) => blend(top, bottom, n <= 1 ? 0 : k / (n - 1));
  for (let y = 0; y < h; y++) {
    const k = Math.min(n - 1, Math.floor((y / h) * n));
    for (let x = 0; x < w; x++) g.set(x0 + x, y0 + y, col(k));
  }
}

function sky(c: Ctx, top: number, bottom: number): void {
  c.haze = bottom;
  bandFill(c.g, 0, 0, c.w, c.horizon, top, bottom);
}

function clouds(c: Ctx, n: number): void {
  for (let i = 0; i < n; i++) {
    const cx = c.rnd() * c.w;
    const cy = 4 + c.rnd() * c.horizon * 0.35;
    const len = 8 + c.rnd() * 14;
    c.g.ellipse(cx, cy, len / 2, 2, C.white);
    c.g.ellipse(cx - len / 4, cy - 1.5, len / 4, 2, C.white);
  }
}

function mountains(c: Ctx, seed: number, base: number, amp: number, freq: number, col: number, shade?: number): number[] {
  const line = ridge(seed, c.w, base, amp, freq);
  // 山脚泛起一层雾，往天边的颜色里化开，远近才分得开
  const fogFrom = c.horizon - Math.max(3, Math.round(amp * 0.45));
  for (let x = 0; x < c.w; x++) {
    for (let y = line[x]; y < c.horizon + 2; y++) {
      const f = y < fogFrom ? 0 : (y - fogFrom) / Math.max(1, c.horizon - fogFrom);
      c.g.set(x, y, f <= 0 ? col : blend(col, c.haze, f < 0.5 ? 0.25 : 0.5));
    }
    if (shade !== undefined && x > 0 && line[x] > line[x - 1]) c.g.set(x, line[x], shade);
  }
  return line;
}

function ground(c: Ctx, main: number, alt: number, speck: number): void {
  // 远处偏 alt（更亮更虚），近处是 main
  bandFill(c.g, 0, c.horizon, c.w, c.h - c.horizon, blend(main, alt, 0.5), main, Math.max(3, Math.round((c.h - c.horizon) / 6)));
  for (let i = 0; i < c.w * (c.h - c.horizon) * 0.02; i++) {
    const x = Math.floor(c.rnd() * c.w);
    const y = c.horizon + 2 + Math.floor(c.rnd() * (c.h - c.horizon - 2));
    c.g.set(x, y, speck);
    c.g.set(x + 1, y - 1, speck);
  }
}

function pine(c: Ctx, x: number, base: number, size: number, col: number, dark: number): void {
  c.g.rect(x - 1, base - 3, 2, 4, C.brown);
  for (let k = 0; k < 3; k++) {
    const top = base - 3 - size - k * size * 0.55 + size * 0.2;
    const half = size * (0.75 - k * 0.15);
    c.g.poly([[x - half, base - 3 - k * size * 0.55], [x + half, base - 3 - k * size * 0.55], [x, top]], col);
    c.g.line(x + 1, top + 1, x + half - 1, base - 4 - k * size * 0.55, dark);
  }
}

function roundTree(c: Ctx, x: number, base: number, r: number, col: number, dark: number): void {
  c.g.rect(x - 1, base - r, 2, r + 1, C.brown);
  c.g.ellipse(x, base - r - r * 0.6, r, r * 0.8, col);
  c.g.ellipse(x + r * 0.35, base - r - r * 0.4, r * 0.55, r * 0.5, dark);
}

function house(c: Ctx, x: number, base: number, w: number, h: number, roof: number, roofDark: number): void {
  c.g.rect(x, base - h, w, h, C.paper);
  c.g.rect(x + w - 2, base - h, 2, h, C.sand);
  c.g.poly([[x - 3, base - h], [x + w + 3, base - h], [x + w - 1, base - h - 6], [x + 1, base - h - 6]], roof);
  c.g.rect(x - 3, base - h, w + 6, 1, roofDark);
  c.g.rect(x + Math.floor(w / 2) - 2, base - 6, 4, 6, C.darkBrown);
  c.g.rect(x + 2, base - h + 3, 3, 3, C.brown);
  if (w > 14) c.g.rect(x + w - 6, base - h + 3, 3, 3, C.brown);
}

function bamboo(c: Ctx, x: number, top: number, base: number, col: number, node: number): void {
  c.g.rect(x, top, 2, base - top, col);
  for (let y = base - 5; y > top; y -= 7) c.g.rect(x, y, 2, 1, node);
  const leafY = top + 3 + Math.floor(c.rnd() * 6);
  c.g.line(x + 2, leafY, x + 6, leafY - 2, C.green);
  c.g.line(x - 1, leafY + 5, x - 5, leafY + 3, C.green);
}

function palisade(c: Ctx, base: number, h: number, from = 0, to = c.w): void {
  for (let x = from; x < to; x += 4) {
    c.g.rect(x, base - h, 3, h, C.brown);
    c.g.rect(x + 2, base - h, 1, h, C.darkBrown);
    c.g.poly([[x, base - h], [x + 3, base - h], [x + 1.5, base - h - 3]], C.brown);
  }
  c.g.rect(from, base - h + 3, to - from, 1, C.darkBrown);
  c.g.rect(from, base - 4, to - from, 1, C.darkBrown);
}

function flag(c: Ctx, x: number, base: number, col: number): void {
  c.g.rect(x, base - 18, 1, 18, C.darkBrown);
  c.g.poly([[x + 1, base - 18], [x + 9, base - 16], [x + 1, base - 12]], col);
}

function tent(c: Ctx, x: number, base: number, w: number): void {
  c.g.poly([[x, base], [x + w, base], [x + w / 2, base - w * 0.7]], C.tan);
  c.g.poly([[x + w / 2, base], [x + w, base], [x + w / 2, base - w * 0.7]], C.lightBrown);
  c.g.poly([[x + w / 2 - 2, base], [x + w / 2 + 2, base], [x + w / 2, base - 6]], C.darkBrown);
}

function rock(c: Ctx, x: number, base: number, r: number): void {
  c.g.ellipse(x, base - r * 0.5, r, r * 0.6, C.gray);
  c.g.ellipse(x + r * 0.3, base - r * 0.4, r * 0.6, r * 0.4, C.darkGray);
  c.g.set(Math.round(x - r * 0.4), Math.round(base - r * 0.8), C.lightGray);
}

// 枯树：歪干 + 几根秃枝
function deadTree(c: Ctx, x: number, base: number, h: number): void {
  c.g.rect(x, base - h, 2, h, C.darkBrown);
  c.g.line(x + 1, base - h + 3, x + 6, base - h - 1, C.darkBrown);
  c.g.line(x, base - h + 6, x - 5, base - h + 2, C.darkBrown);
  c.g.line(x + 1, base - h * 0.5, x + 5, base - h * 0.5 - 3, C.darkBrown);
}

// 坟包 + 墓碑
function grave(c: Ctx, x: number, base: number, r: number): void {
  c.g.ellipse(x, base, r, r * 0.55, C.lightBrown, (_x, y) => y <= base);
  c.g.rect(x - 1, base - r * 0.55 - 5, 3, 5, C.lightGray);
  c.g.rect(x + 1, base - r * 0.55 - 5, 1, 5, C.gray);
}

function path(c: Ctx, col: number, edge: number, x0: number, x1: number): void {
  for (let y = c.horizon; y < c.h; y++) {
    const t = (y - c.horizon) / (c.h - c.horizon);
    const cx = x0 + (x1 - x0) * t;
    const half = 3 + t * c.w * 0.12;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) c.g.set(x, y, col);
    c.g.set(Math.round(cx - half) - 1, y, edge);
    c.g.set(Math.round(cx + half) + 1, y, edge);
  }
}

export function drawScene(art: SceneArt, w: number, h: number, horizonRatio: number, seed = 7): Grid {
  const g = new Grid(w, h);
  const c: Ctx = { g, w, h, horizon: Math.round(h * horizonRatio), rnd: seeded(seed * 97 + art.length * 13), haze: C.sky };
  const hz = c.horizon;
  switch (art) {
    case 'village': {
      sky(c, C.lightBlue, C.sky);
      clouds(c, 3);
      mountains(c, seed, hz - 4, hz * 0.45, 30, C.lightBlue, C.blue);
      mountains(c, seed + 1, hz + 1, hz * 0.2, 18, C.grass, C.green);
      ground(c, C.grass, C.lime, C.green);
      path(c, C.sand, C.tan, w * 0.5, w * 0.42);
      const n = Math.max(2, Math.floor(w / 50));
      for (let i = 0; i < n; i++) {
        const x = Math.floor((i + 0.2) * (w / n));
        if (Math.abs(x + 9 - w * 0.48) < 16) continue;
        house(c, x, hz + 6 + (i % 2) * 3, 16 + (i % 2) * 4, 10, i % 2 ? C.lightBrown : C.darkGray, i % 2 ? C.brown : C.ink);
      }
      roundTree(c, w - 14, hz + 9, 5, C.green, C.darkGreen);
      roundTree(c, 10, hz + 12, 4, C.green, C.darkGreen);
      break;
    }
    case 'forest': {
      sky(c, C.sky, C.lightPaper);
      mountains(c, seed, hz - 2, hz * 0.4, 26, C.lightBlue);
      ground(c, C.green, C.darkGreen, C.grass);
      path(c, C.tan, C.lightBrown, w * 0.55, w * 0.5);
      for (let x = -4; x < w + 6; x += 9) pine(c, x + Math.floor(c.rnd() * 4), hz + 2, 7 + c.rnd() * 3, C.darkGreen, C.ink);
      for (let x = 2; x < w; x += 23) pine(c, x + Math.floor(c.rnd() * 8), hz + 8 + Math.floor(c.rnd() * 5), 9, C.green, C.darkGreen);
      break;
    }
    case 'hill': {
      sky(c, C.lightGray, C.paper);
      mountains(c, seed, hz - 3, hz * 0.55, 34, C.tan, C.lightBrown);
      mountains(c, seed + 3, hz + 2, hz * 0.3, 20, C.lightBrown, C.brown);
      ground(c, C.tan, C.sand, C.lightBrown);
      for (let i = 0; i < w / 30; i++) rock(c, c.rnd() * w, hz + 6 + c.rnd() * (h - hz - 8), 3 + c.rnd() * 3);
      for (let i = 0; i < 2; i++) {
        const x = Math.floor(c.rnd() * w);
        g.line(x, hz + 6, x, hz - 8, C.brown);
        g.line(x, hz - 3, x + 4, hz - 7, C.brown);
        g.line(x, hz - 5, x - 3, hz - 9, C.brown);
      }
      break;
    }
    case 'bamboo': {
      sky(c, C.lime, C.paper);
      for (let x = 0; x < w; x += 6) bamboo(c, x + Math.floor(c.rnd() * 3), 0, hz + 3, C.grass, C.green);
      ground(c, C.green, C.grass, C.darkGreen);
      for (let x = 3; x < w; x += 14) bamboo(c, x + Math.floor(c.rnd() * 5), 0, hz + 10 + Math.floor(c.rnd() * 4), C.green, C.darkGreen);
      path(c, C.sand, C.tan, w * 0.45, w * 0.55);
      break;
    }
    case 'grass': {
      sky(c, C.sky, C.lightPaper);
      clouds(c, 4);
      mountains(c, seed, hz - 1, hz * 0.25, 40, C.lightBlue);
      ground(c, C.grass, C.lime, C.green);
      for (let i = 0; i < w * 0.25; i++) {
        const x = c.rnd() * w;
        const y = hz + 3 + c.rnd() * (h - hz - 3);
        g.set(x, y, C.green);
        g.set(x - 1, y - 1, C.green);
        g.set(x + 1, y - 1, C.green);
        if (c.rnd() < 0.15) g.set(x, y - 2, c.rnd() < 0.5 ? C.yellow : C.pink);
      }
      roundTree(c, w * 0.8, hz + 4, 4, C.green, C.darkGreen);
      break;
    }
    case 'manor': {
      sky(c, C.sky, C.paper);
      for (let x = 0; x < w; x += 7) bamboo(c, x, 0, hz - 6, C.grass, C.green);
      ground(c, C.sand, C.tan, C.lightBrown);
      g.rect(0, hz - 12, w, 12, C.lightPaper);
      g.rect(0, hz - 14, w, 2, C.darkGray);
      g.rect(0, hz - 15, w, 1, C.ink);
      const gx = Math.floor(w / 2) - 10;
      g.rect(gx, hz - 20, 20, 20, C.red);
      g.rect(gx + 2, hz - 14, 16, 14, C.darkRed);
      g.rect(gx + 9, hz - 14, 2, 14, C.gold);
      g.poly([[gx - 4, hz - 20], [gx + 24, hz - 20], [gx + 20, hz - 26], [gx, hz - 26]], C.darkGray);
      g.rect(gx + 6, hz - 25, 8, 3, C.gold);
      break;
    }
    case 'valley': {
      sky(c, C.paper, C.sky);
      ground(c, C.green, C.grass, C.darkGreen);
      for (let y = 0; y < h; y++) {
        const l = Math.round(w * 0.22 + Math.sin(y / 9) * 5 + (y / h) * w * 0.05);
        const r = Math.round(w * 0.76 - Math.sin(y / 7) * 5 - (y / h) * w * 0.05);
        for (let x = 0; x < l; x++) g.set(x, y, x > l - 3 ? C.brown : C.lightBrown);
        for (let x = r; x < w; x++) g.set(x, y, x < r + 3 ? C.brown : C.lightBrown);
      }
      for (let y = hz; y < h; y++) {
        const cx = w / 2 + Math.sin(y / 6) * 6;
        const half = 2 + ((y - hz) / (h - hz)) * 10;
        for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) g.set(x, y, (x + y) % 5 === 0 ? C.sky : C.lightBlue);
      }
      pine(c, w * 0.15, hz - 6, 6, C.darkGreen, C.ink);
      pine(c, w * 0.88, hz - 10, 7, C.darkGreen, C.ink);
      break;
    }
    case 'gate': {
      sky(c, C.lightGray, C.sky);
      mountains(c, seed, hz - 2, hz * 0.6, 28, C.lightBrown, C.brown);
      ground(c, C.tan, C.sand, C.lightBrown);
      palisade(c, hz + 2, 18);
      const gx = Math.floor(w / 2) - 12;
      g.rect(gx, hz - 30, 24, 32, C.brown);
      g.rect(gx + 4, hz - 12, 16, 14, C.darkBrown);
      g.rect(gx - 2, hz - 32, 28, 4, C.darkBrown);
      g.poly([[gx - 4, hz - 32], [gx + 28, hz - 32], [gx + 24, hz - 38], [gx, hz - 38]], C.darkGray);
      flag(c, gx - 6, hz - 16, C.red);
      flag(c, gx + 30, hz - 16, C.red);
      path(c, C.sand, C.lightBrown, w / 2, w / 2);
      break;
    }
    case 'camp': {
      sky(c, C.orange, C.yellow);
      mountains(c, seed, hz - 2, hz * 0.5, 30, C.brown, C.darkBrown);
      ground(c, C.tan, C.sand, C.lightBrown);
      palisade(c, hz - 2, 12);
      for (let i = 0; i < w / 40; i++) tent(c, i * 40 + 6 + c.rnd() * 10, hz + 8 + (i % 2) * 4, 18);
      const fx = Math.floor(w * 0.5);
      g.rect(fx - 4, hz + 18, 9, 2, C.brown);
      g.poly([[fx - 3, hz + 18], [fx + 4, hz + 18], [fx + 0.5, hz + 10]], C.orange);
      g.poly([[fx - 1, hz + 18], [fx + 2, hz + 18], [fx + 0.5, hz + 13]], C.yellow);
      flag(c, Math.floor(w * 0.85), hz + 4, C.darkRed);
      break;
    }
    case 'road': {
      sky(c, C.sky, C.lightPaper);
      clouds(c, 2);
      mountains(c, seed, hz - 2, hz * 0.35, 30, C.lightBlue);
      ground(c, C.grass, C.lime, C.green);
      path(c, C.sand, C.tan, w * 0.6, w * 0.3);
      g.rect(Math.floor(w * 0.75), hz - 4, 2, 14, C.brown);
      g.rect(Math.floor(w * 0.75) - 6, hz - 3, 12, 4, C.tan);
      g.rect(Math.floor(w * 0.75) - 6, hz + 1, 12, 1, C.brown);
      roundTree(c, w * 0.12, hz + 6, 5, C.green, C.darkGreen);
      break;
    }
    case 'city': {
      sky(c, C.sky, C.lightPaper);
      clouds(c, 2);
      mountains(c, seed, hz - 4, hz * 0.4, 34, C.lightBlue);
      ground(c, C.sand, C.tan, C.lightBrown);
      // 城墙：垛口 + 墙砖缝；高度按地平线缩放，矮横幅里城楼也放得下
      const wallH = Math.max(10, Math.round(hz * 0.42));
      const top = hz + 2 - wallH;
      g.rect(0, top, w, wallH, C.lightGray);
      for (let x = 0; x < w; x += 6) g.rect(x, top - 2, 4, 2, C.lightGray);
      for (let y = top + 3; y < hz + 2; y += 4) for (let x = Math.floor(y / 4) % 2 ? 0 : 4; x < w; x += 8) g.rect(x, y, 1, 3, C.gray);
      g.rect(0, top, w, 1, C.gray);
      g.rect(0, hz + 1, w, 1, C.darkGray);
      // 城门楼
      const tw = 28;
      const th = Math.max(6, Math.round(hz * 0.22));
      const gx = Math.floor(w / 2) - tw / 2;
      const ty = top - th;
      g.rect(gx, ty, tw, th, C.red);
      g.rect(gx + 3, ty + 2, 4, th - 3, C.darkRed);
      g.rect(gx + tw - 7, ty + 2, 4, th - 3, C.darkRed);
      g.poly([[gx - 6, ty], [gx + tw + 6, ty], [gx + tw, ty - 5], [gx, ty - 5]], C.darkGray);
      g.rect(gx - 6, ty, tw + 12, 1, C.ink);
      g.rect(gx + 10, ty - 4, 8, 2, C.gold);
      const dh = Math.round(wallH * 0.6);
      g.rect(gx + 8, hz + 2 - dh, 12, dh, C.darkBrown);
      g.ellipse(gx + 14, hz + 2 - dh, 6, 3, C.darkBrown);
      path(c, C.lightBrown, C.tan, w / 2, w / 2);
      break;
    }
    case 'farm': {
      sky(c, C.sky, C.lightPaper);
      clouds(c, 3);
      mountains(c, seed, hz - 2, hz * 0.3, 40, C.grass, C.green);
      ground(c, C.green, C.grass, C.darkGreen);
      // 一垄一垄的田
      for (let y = hz + 3; y < h; y += 4) {
        const t = (y - hz) / (h - hz);
        for (let x = 0; x < w; x++) if ((x + Math.floor(y / 4) * 3) % 7 < 3) g.set(x, y, t > 0.5 ? C.lime : C.yellow);
        g.rect(0, y + 2, w, 1, C.lightBrown);
      }
      house(c, Math.floor(w * 0.12), hz + 2, 16, 10, C.tan, C.brown);
      g.rect(Math.floor(w * 0.8), hz - 8, 1, 12, C.brown);
      g.rect(Math.floor(w * 0.8) - 3, hz - 5, 7, 1, C.brown);
      g.ellipse(Math.floor(w * 0.8) + 0.5, hz - 9, 2, 2, C.tan);
      roundTree(c, w * 0.6, hz + 2, 4, C.green, C.darkGreen);
      break;
    }
    case 'river': {
      sky(c, C.paper, C.sky);
      mountains(c, seed, hz - 4, hz * 0.55, 26, C.lightBlue, C.blue);
      ground(c, C.grass, C.lime, C.green);
      // 河横穿画面下半部
      const ry = Math.round(hz + (h - hz) * 0.35);
      for (let y = ry; y < ry + Math.max(8, (h - hz) * 0.3); y++) {
        for (let x = 0; x < w; x++) g.set(x, y, (x * 3 + y * 5) % 11 === 0 ? C.white : (x + y) % 4 === 0 ? C.sky : C.lightBlue);
        g.set(0, y, C.blue);
      }
      g.rect(0, ry, w, 1, C.blue);
      // 木桥
      const bx = Math.floor(w * 0.6);
      g.rect(bx, ry - 2, 16, 3, C.lightBrown);
      g.rect(bx, ry + 1, 16, 1, C.brown);
      for (let x = bx; x < bx + 16; x += 5) g.rect(x, ry - 5, 1, 5, C.brown);
      for (let i = 0; i < w / 12; i++) {
        const x = Math.floor(c.rnd() * w);
        g.rect(x, ry - 4, 1, 4, C.green);
        g.set(x, ry - 5, C.brown);
      }
      pine(c, w * 0.1, hz - 2, 6, C.darkGreen, C.ink);
      break;
    }
    case 'cave': {
      // 洞里没有天：顶上是石壁，往下渐亮，地上散着宝石的反光
      bandFill(g, 0, 0, w, h, C.ink, C.darkBrown);
      for (let x = 0; x < w; x += 5 + Math.floor(c.rnd() * 6)) {
        const len = 3 + Math.floor(c.rnd() * (hz * 0.4));
        g.poly([[x, 0], [x + 4, 0], [x + 2, len]], C.brown);
      }
      bandFill(g, 0, hz, w, h - hz, C.brown, C.lightBrown);
      for (let i = 0; i < w / 6; i++) {
        const x = Math.floor(c.rnd() * w);
        const y = hz + 2 + Math.floor(c.rnd() * (h - hz - 3));
        g.set(x, y, [C.sky, C.red, C.lime, C.white][i % 4]);
      }
      rock(c, w * 0.2, hz + 6, 5);
      rock(c, w * 0.75, hz + 10, 7);
      const tx = Math.floor(w * 0.5);
      g.rect(tx, hz - 14, 2, 10, C.brown);
      g.poly([[tx - 2, hz - 14], [tx + 4, hz - 14], [tx + 1, hz - 21]], C.orange);
      g.poly([[tx, hz - 14], [tx + 2, hz - 14], [tx + 1, hz - 18]], C.yellow);
      break;
    }
    case 'tomb': {
      // 乱葬岗：暮紫的天、秃树、坟包和墓碑，地上发灰
      sky(c, C.darkPurple, C.purple);
      mountains(c, seed, hz - 2, hz * 0.45, 30, C.darkGray, C.ink);
      ground(c, C.gray, C.darkGray, C.lightBrown);
      for (let i = 0; i < w / 22; i++) grave(c, 8 + i * 22 + c.rnd() * 8, hz + 5 + (i % 3) * 4, 6 + c.rnd() * 3);
      deadTree(c, Math.floor(w * 0.15), hz + 2, 18);
      deadTree(c, Math.floor(w * 0.82), hz + 3, 22);
      for (let i = 0; i < 6; i++) g.ellipse(c.rnd() * w, hz - 4 - c.rnd() * 10, 1.5, 1.5, C.lime);
      break;
    }
    case 'marsh': {
      // 大泽：灰绿的天，芦苇和一汪一汪的水
      sky(c, C.lightGray, C.sky);
      mountains(c, seed, hz - 2, hz * 0.3, 40, C.grass, C.green);
      ground(c, C.green, C.grass, C.darkGreen);
      for (let i = 0; i < 5; i++) {
        const px = c.rnd() * w;
        const py = hz + 4 + c.rnd() * (h - hz - 8);
        g.ellipse(px, py, 10 + c.rnd() * 12, 2.5 + c.rnd() * 2, C.lightBlue);
        g.ellipse(px - 2, py - 0.5, 4, 1, C.sky);
      }
      for (let i = 0; i < w / 4; i++) {
        const x = Math.floor(c.rnd() * w);
        const base = hz + 2 + Math.floor(c.rnd() * (h - hz - 2));
        g.rect(x, base - 6, 1, 6, C.lime);
        g.rect(x, base - 8, 1, 2, C.lightBrown);
      }
      break;
    }
    case 'ruins': {
      // 焚毁的宫城：暗红的天、残墙断柱、黑烟
      sky(c, C.darkRed, C.orange);
      ground(c, C.darkGray, C.gray, C.ink);
      for (let i = 0; i < 4; i++) {
        const x = Math.floor(i * w / 4 + c.rnd() * 10);
        const hh = 10 + Math.floor(c.rnd() * 16);
        g.rect(x, hz - hh, 14, hh + 2, C.gray);
        g.rect(x + 11, hz - hh, 3, hh + 2, C.darkGray);
        for (let k = 0; k < 4; k++) g.set(x + Math.floor(c.rnd() * 14), hz - hh, C.clear);
        g.rect(x + 3, hz - hh + 4, 4, 4, C.ink);
      }
      for (const x of [w * 0.3, w * 0.7]) {
        g.rect(Math.floor(x), hz - 26, 4, 28, C.darkRed);
        g.rect(Math.floor(x) + 3, hz - 26, 1, 28, C.ink);
      }
      for (let i = 0; i < 8; i++) g.ellipse(w * 0.5 + (c.rnd() - 0.5) * w * 0.6, hz - 30 - i * 3, 4 + i, 2.5, C.darkGray);
      break;
    }
    case 'pass': {
      // 蜀道栈道：两侧峭壁，栈道横在崖上
      sky(c, C.paper, C.sky);
      mountains(c, seed, hz - 4, hz * 0.9, 16, C.lightBrown, C.brown);
      mountains(c, seed + 3, hz, hz * 0.5, 22, C.brown, C.darkBrown);
      ground(c, C.brown, C.lightBrown, C.darkBrown);
      const py = hz + Math.round((h - hz) * 0.3);
      g.rect(0, py, w, 3, C.tan);
      g.rect(0, py + 3, w, 1, C.darkBrown);
      for (let x = 2; x < w; x += 7) g.line(x, py + 3, x - 3, py + 9, C.darkBrown);
      for (let x = 0; x < w; x += 9) g.rect(x, py - 5, 1, 5, C.darkBrown);
      g.rect(0, py - 5, w, 1, C.darkBrown);
      pine(c, w * 0.85, hz - 6, 6, C.darkGreen, C.ink);
      break;
    }
    case 'altar': {
      // 天师坛：三层石台，香炉，两面道幡
      sky(c, C.lilac, C.paper);
      mountains(c, seed, hz - 2, hz * 0.55, 26, C.lightBlue, C.blue);
      ground(c, C.lightGray, C.gray, C.darkGray);
      const ax = Math.floor(w / 2);
      g.rect(ax - 26, hz - 4, 52, 6, C.gray);
      g.rect(ax - 18, hz - 10, 36, 6, C.lightGray);
      g.rect(ax - 10, hz - 16, 20, 6, C.gray);
      g.rect(ax - 26, hz + 1, 52, 1, C.darkGray);
      g.rect(ax - 3, hz - 22, 6, 6, C.darkBrown);
      g.ellipse(ax, hz - 25, 2, 3, C.lightGray);
      for (const fx of [ax - 34, ax + 34]) {
        g.rect(fx, hz - 30, 1, 32, C.darkBrown);
        g.rect(fx + 1, hz - 29, 5, 16, C.yellow);
        g.rect(fx + 2, hz - 26, 3, 1, C.red);
        g.rect(fx + 2, hz - 22, 3, 1, C.red);
      }
      break;
    }
  }
  return g;
}
