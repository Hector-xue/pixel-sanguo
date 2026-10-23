// 界面质感层（照原版老版）：灰石云纹边框、聊天区深石板、主界面火焰底、渐变按钮面。
// 这些是界面专用色，不进 32 色美术调色板。
import Phaser from 'phaser';

export const UI = {
  // 面板
  navy: 0x0c0e44, navyHi: 0x6a74c0, navyLo: 0x272b6a, navyEdge: 0x02031a,
  row: 0x161a58, rowHi: 0x343a86, rowLo: 0x0a0c30,
  black: 0x0a0604, gold: 0xe0a830, goldHi: 0xffe080, goldLo: 0x7a4a10,
  line: 0x8a4a1c,
  // 文字
  white: 0xf8f8f0, cream: 0xf0e0a8, yellow: 0xffe040, red: 0xff4a36, dim: 0x9aa0b4,
  green: 0x6cf060, blue: 0x7ab0ff, sky: 0xa8d8ff, magenta: 0xf070ff, orange: 0xffa040,
  // 石纹
  stone: 0x6c757c, stoneHi: 0x9ea6ac, stoneLo: 0x434a50,
  slate: 0x3c4549, slateHi: 0x5c676b, slateLo: 0x283033,
  teal: 0x1d5a66, tealHi: 0x4aa0ac, tealLo: 0x0b2a32,
} as const;

const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mix = (a: number, b: number, t: number): number => {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
};
const hexCss = (c: number): string => '#' + c.toString(16).padStart(6, '0');

// 竖直渐变：stops 从上到下均匀分布，按 2 像素一档量化，保持像素感
export function vgrad(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, stops: number[]): void {
  for (let j = 0; j < h; j += 2) {
    const t = h <= 2 ? 0 : Math.min(1, j / (h - 1)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t));
    g.fillStyle(stops.length === 1 ? stops[0] : mix(stops[i], stops[i + 1], t - i)).fillRect(x, y + j, w, Math.min(2, h - j));
  }
}

// 按钮面：圆角 1 像素 + 深色描边 + 渐变 + 顶部高光
export type Face = 'gold' | 'red' | 'blue' | 'magenta' | 'gray' | 'dark' | 'orange' | 'sel' | 'steel';
const FACES: Record<Face, { stops: number[]; edge: number; hi: number; text: number }> = {
  // 默认按钮：胡桃木面，奶油色字（宣纸面板上最稳）
  gold: { stops: [0xa8784a, 0x8a5c32, 0x6e4422, 0x553218], edge: 0x24140a, hi: 0xd8aa78, text: 0xfbefd0 },
  orange: { stops: [0xffe070, 0xffb030, 0xe87010, 0xb04808], edge: 0x501800, hi: 0xfff0b0, text: 0xfff8e8 },
  // 主按钮：朱漆，金色字
  red: { stops: [0xe8603e, 0xcc3a22, 0xa82414, 0x84160a], edge: 0x3a0804, hi: 0xffa888, text: 0xfff0c0 },
  blue: { stops: [0x9cc4ff, 0x5482f2, 0x3456d2, 0x2238a0], edge: 0x0a1450, hi: 0xd0e4ff, text: 0xffffff },
  magenta: { stops: [0xf8a0ff, 0xd050e8, 0xa828c0, 0x7a1490], edge: 0x30063c, hi: 0xffd8ff, text: 0xffffff },
  gray: { stops: [0xcfc6b4, 0xbdb3a0, 0xaa9f8a, 0x978c78], edge: 0x6a6052, hi: 0xe6dece, text: 0x6c6456 },
  dark: { stops: [0x3a2414, 0x24140a, 0x180c06], edge: 0xb07820, hi: 0x6a4a28, text: 0xffe040 },
  steel: { stops: [0xa8a8b4, 0x7c7c8a, 0x5c5c68, 0x44444e], edge: 0x101014, hi: 0xd0d0dc, text: 0xffffff },
  // 选中的分页：朱红书签
  sel: { stops: [0xd04a2e, 0xb4301c, 0x92200e], edge: 0x3a0804, hi: 0xff9a7a, text: 0xfff0c0 },
};

export function faceText(f: Face): number {
  return FACES[f].text;
}

export function drawFace(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, f: Face, pressed = false): void {
  const s = FACES[f];
  g.fillStyle(s.edge).fillRect(x + 1, y, w - 2, h).fillRect(x, y + 1, w, h - 2);
  const stops = pressed ? s.stops.map((c) => mix(c, 0x000000, 0.22)) : s.stops;
  vgrad(g, x + 1, y + 1, w - 2, h - 2, stops);
  if (!pressed) g.fillStyle(s.hi, 0.85).fillRect(x + 2, y + 1, w - 4, 1);
}

// 菱形指令按钮（战斗）
export function drawDiamond(g: Phaser.GameObjects.Graphics, r: number, enabled: boolean, pressed: boolean): void {
  const pts = (k: number) => [new Phaser.Math.Vector2(0, -k), new Phaser.Math.Vector2(k, 0), new Phaser.Math.Vector2(0, k), new Phaser.Math.Vector2(-k, 0)];
  const base = enabled ? [0xfffac0, 0xffd848, 0xf8aa18, 0xe07c00] : [0xc8c8c8, 0xa0a0a8, 0x808088, 0x606068];
  const st = pressed ? base.map((c) => mix(c, 0x000000, 0.25)) : base;
  g.fillStyle(0x3a1800).fillPoints(pts(r), true);
  // 用水平条带画渐变，再用比例裁成菱形
  for (let y = -r + 1; y < r; y++) {
    const half = r - 1 - Math.abs(y);
    if (half <= 0) continue;
    const t = ((y + r) / (2 * r)) * (st.length - 1);
    const i = Math.min(st.length - 2, Math.floor(t));
    g.fillStyle(mix(st[i], st[i + 1], t - i)).fillRect(-half, y, half * 2, 1);
  }
  g.fillStyle(0xffffff, enabled && !pressed ? 0.6 : 0.2).fillRect(-Math.round(r / 3), -r + 3, Math.round(r / 1.5), 1);
}

// ===== 画布纹理 =====
function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): string {
  if (scene.textures.exists(key)) return key;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  paint(ctx);
  scene.textures.addCanvas(key, cv);
  return key;
}

// 逐点画上万个点的纹理（宣纸、石面）：点先写进像素数组，画完一次贴回去——一个点一次 fillRect 在慢手机上要几十毫秒
let pix: { ctx: CanvasRenderingContext2D; img: ImageData } | null = null;
function beginPix(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  pix = { ctx, img: ctx.getImageData(0, 0, w, h) };
}
function endPix(): void {
  if (pix) pix.ctx.putImageData(pix.img, 0, 0);
  pix = null;
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, c: number): void {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (pix && pix.ctx === ctx) {
    const { width, height, data } = pix.img;
    // 和 fillRect 一样：画到外面的点不算
    if (ix < 0 || iy < 0 || ix >= width || iy >= height) return;
    const o = (iy * width + ix) * 4;
    data[o] = (c >> 16) & 255;
    data[o + 1] = (c >> 8) & 255;
    data[o + 2] = c & 255;
    data[o + 3] = 255;
    return;
  }
  ctx.fillStyle = hexCss(c);
  ctx.fillRect(ix, iy, 1, 1);
}

// 回纹云：一圈螺线，亮线压暗影，像浮雕
function swirl(ctx: CanvasRenderingContext2D, cx: number, cy: number, turns: number, dir: 1 | -1, hi: number, lo: number): void {
  const seen = new Set<string>();
  for (let t = 0; t < turns * Math.PI * 2; t += 0.04) {
    const r = 1 + t * 0.9;
    const x = Math.round(cx + Math.cos(t * dir) * r);
    const y = Math.round(cy + Math.sin(t * dir) * r);
    const k = `${x},${y}`;
    if (seen.has(k)) continue;
    seen.add(k);
    px(ctx, x + 1, y + 1, lo);
    px(ctx, x, y, hi);
  }
}

function stonePaint(ctx: CanvasRenderingContext2D, w: number, h: number, base: number, hi: number, lo: number, seed: number): void {
  ctx.fillStyle = hexCss(base);
  ctx.fillRect(0, 0, w, h);
  beginPix(ctx, w, h);
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  // 石面杂点
  for (let i = 0; i < (w * h) / 9; i++) px(ctx, rnd() * w, rnd() * h, rnd() < 0.5 ? mix(base, hi, 0.35) : mix(base, lo, 0.4));
  // 云纹：交错排开，左旋右旋相间
  const step = 46;
  for (let row = -1; row * (step * 0.62) < h + step; row++) {
    for (let col = -1; col * step < w + step; col++) {
      const cx = col * step + (row % 2 ? step / 2 : 0);
      const cy = row * step * 0.62;
      swirl(ctx, cx, cy, 2.2, row % 2 ? 1 : -1, hi, lo);
      // 云尾：一段弧线连到下一朵
      for (let t = 0; t < 1; t += 0.03) {
        const x = cx + 6 + t * (step / 2 - 6);
        const y = cy + 7 + Math.sin(t * Math.PI) * 6;
        px(ctx, x + 1, y + 1, lo);
        px(ctx, x, y, hi);
      }
    }
  }
  endPix();
}

export function stoneTex(scene: Phaser.Scene, w: number, h: number): string {
  return canvasTex(scene, `ui_stone_${w}x${h}`, w, h, (ctx) => stonePaint(ctx, w, h, UI.stone, UI.stoneHi, UI.stoneLo, 7));
}

export function slateTex(scene: Phaser.Scene, w: number, h: number): string {
  return canvasTex(scene, `ui_slate_${w}x${h}`, w, h, (ctx) => stonePaint(ctx, w, h, UI.slate, UI.slateHi, UI.slateLo, 11));
}

// 主界面右栏的火焰底：左上近黑，往右下烧成橘红，再叠一圈淡云纹
export function fireTex(scene: Phaser.Scene, w: number, h: number): string {
  return canvasTex(scene, `ui_fire_${w}x${h}`, w, h, (ctx) => {
    const stops = [0x0c0404, 0x2a0806, 0x6a1408, 0xb03008, 0xe86a10, 0xffa630];
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        // 光源在右下偏中
        const dx = (x - w * 0.78) / w;
        const dy = (y - h * 0.92) / h;
        let t = 1 - Math.min(1, Math.sqrt(dx * dx * 1.6 + dy * dy * 1.1) * 1.25);
        t = Math.max(0, t);
        // 量化成 6 档 + 棋盘抖动，像素画的过渡
        const q = t * (stops.length - 1);
        let i = Math.floor(q);
        if (q - i > 0.5 && ((x + y) / 2) % 2 === 0) i++;
        ctx.fillStyle = hexCss(stops[Math.min(stops.length - 1, i)]);
        ctx.fillRect(x, y, 2, 2);
      }
    }
    // 一道斜向光带（原版右栏中间那道亮弧）
    for (let k = 0; k < w * 1.2; k++) {
      const x = k;
      const y = h * 0.95 - k * 0.55 + Math.sin(k / 18) * 4;
      for (let d = 0; d < 6; d++) {
        if (x < 0 || x >= w || y + d < 0 || y + d >= h) continue;
        ctx.fillStyle = `rgba(255,190,90,${0.10 - d * 0.015})`;
        ctx.fillRect(Math.round(x), Math.round(y + d), 1, 1);
      }
    }
    swirl(ctx, w * 0.72, h * 0.5, 3, 1, 0x7a2a10, 0x1a0604);
  });
}

// 战场地面：原版是一大片平沙地，上沿一道碎石坎，零星几丛黄花、绿灌木和石头
export function groundTex(scene: Phaser.Scene, w: number, h: number, seed: number): string {
  return canvasTex(scene, `ui_ground_${w}x${h}_${seed}`, w, h, (ctx) => {
    let s = seed * 7919 + 1;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const sand = 0xd4b072;
    ctx.fillStyle = hexCss(sand);
    ctx.fillRect(0, 0, w, h);
    // 沙面：大块深浅斑 + 细杂点
    for (let i = 0; i < 40; i++) {
      const cx = rnd() * w;
      const cy = rnd() * h;
      const rw = 10 + rnd() * 30;
      for (let k = 0; k < rw * 3; k++) px(ctx, cx + (rnd() - 0.5) * rw * 2, cy + (rnd() - 0.5) * rw * 0.6, rnd() < 0.5 ? 0xc8a464 : 0xdcbc80);
    }
    for (let i = 0; i < (w * h) / 40; i++) px(ctx, rnd() * w, rnd() * h, rnd() < 0.6 ? 0xb89458 : 0xe6c890);
    // 上沿碎石坎
    for (let x = 0; x < w; x++) {
      const t = 3 + Math.round(Math.sin(x / 9) * 2 + Math.sin(x / 23) * 2 + rnd() * 2);
      for (let y = 0; y < t; y++) px(ctx, x, y, y === t - 1 ? 0x8a6a3a : y % 2 ? 0x9a7a48 : 0xb08c58);
    }
    for (let i = 0; i < w / 6; i++) stone(ctx, rnd() * w, 2 + rnd() * 6, 2 + rnd() * 3);
    // 下沿一道草坡，点几朵红花（原版战场底边）
    for (let x = 0; x < w; x++) {
      const t = 9 + Math.round(Math.sin(x / 13) * 3 + Math.sin(x / 5) * 1 + rnd() * 2);
      for (let y = h - t; y < h; y++) px(ctx, x, y, y === h - t ? 0x6a9a30 : (x + y) % 3 === 0 ? 0x3e6a22 : y < h - t + 3 ? 0x5a8a2a : 0x4a7a26);
      if (rnd() < 0.3) px(ctx, x, h - t - 1, 0x8ab840);
    }
    for (let i = 0; i < w / 14; i++) {
      const fx = rnd() * w;
      const fy = h - 3 - rnd() * 7;
      px(ctx, fx, fy, 0xe82818);
      px(ctx, fx + 1, fy, 0xff5030);
      px(ctx, fx, fy - 1, 0xff7050);
      px(ctx, fx + 1, fy + 1, 0x2a4a18);
    }
    // 零星装饰（避开中间菱形菜单那一列）
    const spots: [number, number][] = [[w * 0.78, h * 0.08], [w * 0.88, h * 0.62], [w * 0.1, h * 0.86], [w * 0.62, h * 0.9], [w * 0.05, h * 0.16]];
    spots.forEach(([x, y], i) => {
      if (i % 3 === 0) flowerBush(ctx, x, y, rnd);
      else if (i % 3 === 1) shrub(ctx, x, y, rnd);
      else stone(ctx, x, y, 5);
    });
    for (let i = 0; i < 14; i++) tuft(ctx, rnd() * w, 10 + rnd() * (h - 20));
  });

  function stone(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    for (let j = -r; j <= r * 0.7; j++) for (let i = -r * 1.4; i <= r * 1.4; i++) {
      if ((i * i) / (r * r * 2) + (j * j) / (r * r) > 1) continue;
      px(ctx, x + i, y + j, j < -r * 0.3 ? 0xb8b4a8 : j < r * 0.2 ? 0x8c887e : 0x5c5850);
    }
  }
  function tuft(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    for (const [dx, dy] of [[0, 0], [1, -1], [2, -2], [3, -1], [4, 0], [2, -1], [-1, -1]]) px(ctx, x + dx, y + dy, dy < -1 ? 0x8ab040 : 0x5a8030);
  }
  function shrub(ctx: CanvasRenderingContext2D, x: number, y: number, rnd: () => number): void {
    for (let k = 0; k < 7; k++) {
      const cx = x + (rnd() - 0.5) * 16;
      const cy = y + (rnd() - 0.5) * 6;
      const r = 4 + rnd() * 3;
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        if (i * i + j * j > r * r) continue;
        px(ctx, cx + i, cy + j, j < -r / 3 ? 0x9ad050 : j < r / 3 ? 0x5a9a34 : 0x2e6020);
      }
    }
    for (let i = -12; i < 12; i++) px(ctx, x + i, y + 8, 0x8a6a3a);
  }
  function flowerBush(ctx: CanvasRenderingContext2D, x: number, y: number, rnd: () => number): void {
    shrub(ctx, x, y + 4, rnd);
    for (let k = 0; k < 16; k++) {
      const fx = x + (rnd() - 0.5) * 22;
      const fy = y + (rnd() - 0.5) * 12 - 2;
      px(ctx, fx, fy, 0x6a4000);
      px(ctx, fx - 1, fy - 1, 0xffe040);
      px(ctx, fx, fy - 1, 0xffc020);
      px(ctx, fx - 1, fy, 0xf0a010);
    }
  }
}

// ===== 精品化界面材质：宣纸、漆木框、金角花、题签、印章钮 =====
export const PAPER = { base: 0xf0e2c0, hi: 0xf8eed6, lo: 0xe2cfa4, fiber: 0xd8c294, edge: 0xc9ae80, ink: 0x3b2a1a };

// 宣纸：底色 + 细纤维 + 稀疏杂点 + 四周微微泛黄
export function paperTex(scene: Phaser.Scene, w: number, h: number): string {
  return canvasTex(scene, `ui_paper_${w}x${h}`, w, h, (ctx) => {
    ctx.fillStyle = hexCss(PAPER.base);
    ctx.fillRect(0, 0, w, h);
    beginPix(ctx, w, h);
    let s = w * 31 + h * 17;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < (w * h) / 14; i++) px(ctx, rnd() * w, rnd() * h, rnd() < 0.5 ? PAPER.hi : PAPER.lo);
    // 横向纤维：一段段短线
    for (let i = 0; i < (w * h) / 160; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const len = 3 + rnd() * 9;
      for (let k = 0; k < len; k++) px(ctx, x + k, y + (k > len / 2 && rnd() < 0.3 ? 1 : 0), PAPER.fiber);
    }
    // 四边泛黄（抖动着过渡，不画渐变）
    for (let d = 0; d < 6; d++) {
      const c = mix(PAPER.base, PAPER.edge, 1 - d / 6);
      for (let x = 0; x < w; x++) {
        if ((x + d) % (d + 1) === 0) {
          px(ctx, x, d, c);
          px(ctx, x, h - 1 - d, c);
        }
      }
      for (let y = 0; y < h; y++) {
        if ((y + d) % (d + 1) === 0) {
          px(ctx, d, y, c);
          px(ctx, w - 1 - d, y, c);
        }
      }
    }
    endPix();
  });
}

// 漆木框：外圈深木 4 像素（带木纹和高光），里面一道金线，四角金色云头
export function woodFrame(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  g.fillStyle(0x160c06).fillRect(x, y, w, h);
  g.fillStyle(0x3a2212).fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle(0x5a3820).fillRect(x + 1, y + 1, w - 2, 1).fillRect(x + 1, y + 1, 1, h - 2);
  g.fillStyle(0x24140a).fillRect(x + 1, y + h - 2, w - 2, 1).fillRect(x + w - 2, y + 1, 1, h - 2);
  // 木纹
  for (let i = 6; i < w - 6; i += 7) g.fillStyle(0x4a2c16).fillRect(x + i, y + 2, 3, 1).fillRect(x + i + 2, y + h - 3, 3, 1);
  g.fillStyle(0x0c0604).fillRect(x + 4, y + 4, w - 8, h - 8);
  g.fillStyle(UI.gold).fillRect(x + 5, y + 5, w - 10, h - 10);
  g.fillStyle(0x0c0604, 0).fillRect(x, y, 1, 1);
  for (const [cx, cy, sx, sy] of [[x + 5, y + 5, 1, 1], [x + w - 6, y + 5, -1, 1], [x + 5, y + h - 6, 1, -1], [x + w - 6, y + h - 6, -1, -1]]) cornerCloud(g, cx, cy, sx, sy);
}

// 金色云头角花：L 形回纹
export function cornerCloud(g: Phaser.GameObjects.Graphics, x: number, y: number, sx: number, sy: number): void {
  const pts: [number, number, number][] = [
    [0, 0, UI.goldHi], [1, 0, UI.goldHi], [2, 0, UI.gold], [3, 0, UI.gold], [4, 0, UI.goldLo], [5, 0, UI.goldLo],
    [0, 1, UI.goldHi], [0, 2, UI.gold], [0, 3, UI.gold], [0, 4, UI.goldLo], [0, 5, UI.goldLo],
    [2, 2, UI.goldHi], [3, 2, UI.gold], [2, 3, UI.gold], [4, 3, UI.goldLo], [3, 4, UI.goldLo],
  ];
  for (const [dx, dy, c] of pts) g.fillStyle(c).fillRect(x + dx * sx - (sx < 0 ? 0 : 0), y + dy * sy, 1, 1);
}

// 朱漆题签：两端燕尾，金边，标题写在中间
export function titlePlaque(g: Phaser.GameObjects.Graphics, cx: number, y: number, w: number, h = 18): void {
  const x = Math.round(cx - w / 2);
  for (let j = 0; j < h; j++) {
    const notch = Math.max(0, 5 - Math.abs(j - (h - 1) / 2));
    g.fillStyle(0x5a0c06).fillRect(x - 9 + Math.round(notch), y + j, 12 - Math.round(notch), 1);
    g.fillStyle(0x5a0c06).fillRect(x + w - 3, y + j, 12 - Math.round(notch), 1);
  }
  g.fillStyle(0x2a0402).fillRect(x - 1, y - 1, w + 2, h + 2);
  vgrad(g, x, y, w, h, [0xd8482c, 0xb42c18, 0x8c1a0c]);
  g.fillStyle(0xff9a78).fillRect(x, y, w, 1);
  g.fillStyle(UI.gold).fillRect(x + 2, y + 2, w - 4, 1).fillRect(x + 2, y + h - 3, w - 4, 1);
}

// 印章式小方钮（关闭、角标）：朱红方块，奶油色描边
export function sealBox(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, pressed = false): void {
  g.fillStyle(0x3a0804).fillRect(x, y, s, s);
  vgrad(g, x + 1, y + 1, s - 2, s - 2, pressed ? [0x8c1a0c, 0x6a1006] : [0xd4442a, 0xa8240e]);
  g.fillStyle(0xfff0c0, 0.9).fillRect(x + 2, y + 2, s - 4, 1).fillRect(x + 2, y + s - 3, s - 4, 1).fillRect(x + 2, y + 2, 1, s - 4).fillRect(x + s - 3, y + 2, 1, s - 4);
}

// 时辰滤镜：一层正片叠底的色块。Canvas 渲染（没有 WebGL 的手机）有的不支持正片叠底，
// 会退成普通覆盖、整块不透明地盖住舞台——这时改成半透明的暗色罩子，压暗的程度按滤镜颜色的亮度算
export function timeTint(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: number): Phaser.GameObjects.Rectangle {
  const r = scene.add.rectangle(x, y, w, h, color).setOrigin(0);
  const renderer = scene.game.renderer as Phaser.Renderer.Canvas.CanvasRenderer;
  const canvasNoMultiply = scene.game.renderer.type === Phaser.CANVAS && renderer.blendModes?.[Phaser.BlendModes.MULTIPLY] !== 'multiply';
  if (!canvasNoMultiply) return r.setBlendMode(Phaser.BlendModes.MULTIPLY);
  const ch = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
  const lum = (ch[0] * 0.3 + ch[1] * 0.59 + ch[2] * 0.11) / 255;
  const dark = (ch[0] * 0.35) << 16 | (ch[1] * 0.35) << 8 | (ch[2] * 0.35);
  return r.setFillStyle(dark, Math.min(0.7, 1 - lum));
}
