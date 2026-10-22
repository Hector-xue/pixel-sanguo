// 半身立绘（对话、人物卡用）：64×72 正面胸像，按 Look 逐项画——脸型、眼型、眉、鼻、嘴、胡子、发型、头饰、交领/铠甲/披风。
// 和战场小人用同一套外观参数，所以 140 多个人物都有自己的立绘；显示时放大 2 倍。
import { Grid } from './pixel';
import { C, blend } from './palette';
import { skinOf } from './units';
import type { Eyes, Look } from './units';

export const BUST_W = 64;
export const BUST_H = 72;
const CX = 32;
// 眼睛那一行
const EY = 31;

interface P {
  g: Grid;
  L: Look;
  sk: number;
  sks: number;
  hm: number;
  hd: number;
  o: number;
  od: number;
  // 肩宽的一半
  sw: number;
  fem: boolean;
}

function line2(g: Grid, x0: number, y0: number, x1: number, y1: number, c: number): void {
  g.line(x0, y0, x1, y1, c);
  g.line(x0, y0 + 1, x1, y1 + 1, c);
}

// ===== 身后：披风、长发、飘带、雉鸡翎下半段 =====
function back(p: P): void {
  const { g, L } = p;
  if (L.cape !== undefined) g.poly([[CX - p.sw - 5, 72], [CX - p.sw + 2, 50], [CX + p.sw - 2, 50], [CX + p.sw + 5, 72]], L.cape);
  if (L.style === 'long' || (p.fem && L.style !== 'helmet' && L.style !== 'hood' && L.style !== 'buns')) {
    // 披到肩后的长发
    g.poly([[CX - 15, 22], [CX - 13, 46], [CX - 17, 60], [CX - 9, 58], [CX - 8, 30]], p.hm);
    g.poly([[CX + 15, 22], [CX + 13, 46], [CX + 17, 60], [CX + 9, 58], [CX + 8, 30]], p.hm);
  }
  if (L.style === 'tail') g.poly([[CX + 9, 12], [CX + 14, 12], [CX + 19, 30], [CX + 17, 46], [CX + 13, 34]], p.hm);
  if (L.sash !== undefined) {
    // 披帛：从肩后绕出来，两边垂下
    g.poly([[CX - p.sw - 1, 52], [CX - p.sw - 6, 72], [CX - p.sw - 1, 72], [CX - p.sw + 3, 54]], L.sash);
    g.poly([[CX + p.sw + 1, 52], [CX + p.sw + 6, 72], [CX + p.sw + 1, 72], [CX + p.sw - 3, 54]], L.sash);
  }
  if (L.head === 'guard' || (L.style === 'band' && L.accent !== undefined && !L.head)) {
    const c = L.headColor ?? L.accent ?? C.red;
    // 护额 / 抹额的两根飘带
    g.poly([[CX + 11, 17], [CX + 13, 17], [CX + 22, 34], [CX + 19, 35]], c);
    g.poly([[CX + 11, 18], [CX + 13, 19], [CX + 17, 38], [CX + 15, 38]], blend(c, C.ink, 0.25));
  }
  if (L.head === 'lunjin') {
    const c = L.headColor ?? L.outfit[1];
    g.poly([[CX - 11, 16], [CX - 9, 16], [CX - 14, 34], [CX - 16, 33]], c);
    g.poly([[CX + 11, 16], [CX + 9, 16], [CX + 14, 34], [CX + 16, 33]], c);
  }
}

// ===== 身子 =====
function torso(p: P): void {
  const { g, L, sw, o } = p;
  const top = 48;
  if (L.bare) {
    // 光膀子：肩臂和胸膛都是皮肤，斜挎一条布带
    g.poly([[CX - sw, 72], [CX - sw + 1, 56], [CX - sw + 6, top + 1], [CX - 5, top - 2], [CX + 5, top - 2], [CX + sw - 6, top + 1], [CX + sw - 1, 56], [CX + sw, 72]], p.sk);
    g.line(CX - 9, 58, CX - 2, 60, p.sks);
    g.line(CX + 2, 60, CX + 9, 58, p.sks);
    if (L.fat) g.ellipse(CX, 70, 12, 6, p.sks, (_x, y) => y < 72);
    for (let i = 0; i < 4; i++) g.line(CX - sw + 4 + i, 52, CX + sw - 6 + i, 72, o);
    if (L.bells) for (let k = 0; k < 4; k++) g.ellipse(CX - sw + 9 + k * 7, 55 + k * 5, 1.6, 1.6, C.gold);
    return;
  }
  g.poly([[CX - sw, 72], [CX - sw + 1, 57], [CX - sw + 6, top + 2], [CX - 5, top - 1], [CX + 5, top - 1], [CX + sw - 6, top + 2], [CX + sw - 1, 57], [CX + sw, 72]], o);
  if (L.armor) {
    const m = L.metal ?? C.lightGray;
    const ms = blend(m, C.ink, 0.375);
    // 胸甲：鱼鳞纹 + 护心镜
    g.rect(CX - 12, 54, 24, 18, ms);
    for (let y = 55; y < 72; y += 3) for (let x = CX - 12 + ((y / 3) % 2 ? 0 : 2); x < CX + 12; x += 4) {
      g.rect(x, y, 3, 2, m);
    }
    g.ellipse(CX, 61, 4.5, 4.5, C.gold);
    g.ellipse(CX, 61, 2.6, 2.6, blend(C.yellow, C.white, 0.5));
    // 肩甲：两块弧形甲片
    for (const sx of [-1, 1]) {
      const x0 = CX + sx * (sw - 6);
      g.ellipse(x0, 55, 8, 6, m, (_x, y) => y < 59);
      g.rect(x0 - 7, 57, 14, 2, ms);
      g.set(x0 - 3 * sx, 53, C.white);
    }
    // 领口
    g.poly([[CX - 6, top - 1], [CX + 6, top - 1], [CX, 54]], L.trim);
    return;
  }
  // 交领：里衣白，外衣领口左压右
  g.poly([[CX - 6, top - 1], [CX + 6, top - 1], [CX + 1, 60]], C.white);
  g.poly([[CX - 7, top - 1], [CX - 4, top - 1], [CX + 4, 63], [CX + 1, 64]], L.trim);
  g.poly([[CX + 7, top - 1], [CX + 4, top - 1], [CX - 1, 56], [CX + 1, 58]], L.trim);
  // 宽袖的褶
  g.line(CX - sw + 4, 60, CX - sw + 7, 72, p.od);
  g.line(CX + sw - 5, 60, CX + sw - 8, 72, p.od);
  if (p.fem || L.weapon === 'fan' || L.weapon === 'staff') {
    // 高腰系带
    g.rect(CX - sw + 4, 67, (sw - 4) * 2, 3, L.belt);
    g.rect(CX - 2, 66, 4, 5, L.accent ?? L.trim);
  }
  if (L.bells) for (let k = 0; k < 3; k++) g.ellipse(CX - 8 + k * 8, 69, 1.6, 1.6, C.gold);
}

// ===== 头 =====
function headShape(p: P): void {
  const { g, L } = p;
  const rx = L.fat ? 12.5 : p.fem ? 10 : 11;
  // 脖子
  g.rect(CX - 4, 40, 8, 9, p.sk);
  g.rect(CX - 4, 40, 8, 2, p.sks);
  // 耳朵
  for (const sx of [-1, 1]) {
    g.ellipse(CX + sx * (rx + 0.5), 31, 2.2, 3.2, p.sk);
    g.set(CX + sx * (rx + 0.5), 31, p.sks);
  }
  // 脸：上半椭圆 + 下颌（男的方一点，女的尖一点，胖的有双下巴）
  g.ellipse(CX, 28, rx, 12, p.sk, (_x, y) => y < 32);
  if (p.fem) g.poly([[CX - rx, 31], [CX + rx, 31], [CX + 6, 39], [CX, 42], [CX - 6, 39]], p.sk);
  else if (L.fat) g.ellipse(CX, 34, rx, 9, p.sk);
  else g.poly([[CX - rx, 31], [CX + rx, 31], [CX + rx - 1, 36], [CX + 5, 42], [CX - 5, 42], [CX - rx + 1, 36]], p.sk);
  if (L.fat) g.line(CX - 6, 43, CX + 6, 43, p.sks);
}

function eye(g: Grid, ex: number, outer: number, type: Eyes, iris: number): void {
  const ink = C.ink;
  const y = EY;
  switch (type) {
    case 'fierce':
      g.rect(ex - 2, y - 1, 5, 1, ink);
      g.rect(ex - 2, y, 5, 2, C.white);
      g.rect(ex - 1, y, 2, 2, ink);
      g.set(ex + (outer < 0 ? 2 : -2), y - 1, ink);
      g.set(ex + (outer < 0 ? 2 : -2), y - 2, ink);
      return;
    case 'narrow':
      g.rect(ex - 2, y, 5, 1, ink);
      g.rect(ex - 1, y + 1, 3, 1, iris);
      g.set(ex + outer * 3, y - 1, ink);
      return;
    case 'old':
      g.set(ex - 2, y + 1, ink);
      g.rect(ex - 1, y, 3, 1, ink);
      g.set(ex + 2, y + 1, ink);
      g.line(ex - 1, y + 3, ex + 1, y + 3, blend(C.skinShade, C.brown, 0.25));
      return;
    case 'ring':
      g.ellipse(ex, y + 1, 3, 2.6, C.white);
      g.rect(ex - 1, y, 2, 2, ink);
      g.set(ex - 3, y + 1, ink);
      g.set(ex + 3, y + 1, ink);
      return;
    case 'blank':
      g.rect(ex - 2, y - 1, 5, 3, C.white);
      g.rect(ex - 2, y - 2, 5, 1, ink);
      return;
    case 'gentle':
    case 'sparkle': {
      const big = type === 'sparkle';
      g.rect(ex - 2, y - 2, 5, 1, ink);
      g.set(ex + outer * 3, y - 3, ink);
      g.rect(ex - 2, y - 1, 5, big ? 4 : 3, C.white);
      g.rect(ex - 1, y - 1, 3, big ? 4 : 3, iris);
      g.set(ex, y, ink);
      g.set(ex - 1, y - 1, C.white);
      if (big) g.set(ex + 1, y + 2, C.white);
      return;
    }
    default:
      g.rect(ex - 2, y - 2, 5, 1, ink);
      g.rect(ex - 2, y - 1, 5, 3, C.white);
      g.rect(ex - 1, y - 1, 3, 3, iris);
      g.set(ex, y, ink);
      g.set(ex - 1, y - 1, C.white);
  }
}

function brows(p: P, type: Eyes): void {
  const { g, L } = p;
  const light = L.hair[0] === C.lightGray || L.hair[0] === C.white || L.hair[0] === C.gray;
  const b = L.beard ?? (p.fem || light ? p.hd : C.ink);
  const y = EY - 5;
  for (const sx of [-1, 1]) {
    const inner = CX + sx * 2;
    const outer = CX + sx * 8;
    switch (type) {
      case 'fierce':
        line2(g, inner, y + 2, outer, y - 1, b);
        break;
      case 'ring':
        line2(g, inner, y + 2, outer, y - 2, b);
        g.line(inner, y + 3, outer, y - 1, b);
        break;
      case 'narrow':
        g.line(inner, y + 1, outer, y - 1, b);
        break;
      case 'old':
        // 长寿眉往两边垂
        line2(g, inner, y, outer + sx * 2, y + 2, b);
        break;
      case 'gentle':
      case 'sparkle':
        g.line(inner, y + 1, inner + sx * 3, y, b);
        g.line(inner + sx * 3, y, outer, y + 1, b);
        break;
      default:
        if (p.fem) {
          g.line(inner, y + 1, outer, y + 1, b);
        } else {
          g.rect(Math.min(inner, outer), y, 7, 2, b);
          g.set(outer, y + 2, b);
        }
    }
  }
}

function mouth(p: P): void {
  const { g, L } = p;
  const m = L.mouth ?? (L.beardStyle === 'bushy' ? 'grin' : 'line');
  const y = 39;
  const lip = p.fem ? C.red : blend(p.sks, C.darkRed, 0.375);
  switch (m) {
    case 'grin':
      g.rect(CX - 3, y - 1, 7, 3, C.darkRed);
      g.rect(CX - 3, y - 1, 7, 1, C.white);
      break;
    case 'smile':
      g.set(CX - 3, y - 1, lip);
      g.rect(CX - 2, y, 5, 1, lip);
      g.set(CX + 3, y - 1, lip);
      break;
    case 'frown':
      g.rect(CX - 2, y, 5, 1, C.darkBrown);
      g.set(CX - 3, y + 1, C.darkBrown);
      g.set(CX + 3, y + 1, C.darkBrown);
      break;
    case 'fang':
      g.rect(CX - 3, y, 7, 1, C.ink);
      g.set(CX - 2, y + 1, C.white);
      g.set(CX + 2, y + 1, C.white);
      break;
    default:
      if (L.beardStyle !== 'full') g.rect(CX - 2, y, p.fem ? 4 : 5, 1, lip);
      if (p.fem) g.set(CX - 1, y + 1, blend(C.red, C.pink, 0.5));
  }
}

function beard(p: P): void {
  const { g, L } = p;
  const b = L.beard;
  if (b === undefined) return;
  const lite = blend(b, C.white, 0.25);
  const must = () => {
    line2(g, CX - 1, 37, CX - 6, 39, b);
    line2(g, CX + 1, 37, CX + 6, 39, b);
  };
  switch (L.beardStyle) {
    case 'mustache':
      must();
      return;
    case 'goatee':
      must();
      g.rect(CX - 2, 41, 5, 4, b);
      g.rect(CX - 1, 45, 3, 2, b);
      return;
    case 'long':
      // 美髯：两鬓连到下巴，一直垂到胸口，几道亮丝
      must();
      g.poly([[CX - 9, 36], [CX - 5, 41], [CX + 5, 41], [CX + 9, 36], [CX + 8, 48], [CX + 4, 62], [CX, 68], [CX - 4, 62], [CX - 8, 48]], b);
      for (const x of [-4, 0, 4]) g.line(CX + x, 43, CX + x * 0.6, 63, lite);
      g.rect(CX - 2, 39, 5, 1, C.darkRed);
      return;
    case 'bushy':
      // 虎须：下巴一圈短硬胡子往外扎
      g.poly([[CX - 11, 33], [CX - 5, 37], [CX + 5, 37], [CX + 11, 33], [CX + 9, 42], [CX + 4, 46], [CX - 4, 46], [CX - 9, 42]], b);
      for (const [x0, y0, x1, y1] of [[-11, 36, -16, 34], [-10, 40, -15, 42], [-7, 44, -10, 49], [-2, 46, -3, 51], [3, 46, 4, 51], [7, 44, 10, 49], [10, 40, 15, 42], [11, 36, 16, 34]]) line2(g, CX + x0, y0, CX + x1, y1, b);
      g.rect(CX - 3, 38, 7, 3, C.darkRed);
      g.rect(CX - 3, 38, 7, 1, C.white);
      return;
    case 'full':
      // 络腮胡：从耳根到下巴一整团
      g.poly([[CX - 11, 30], [CX - 8, 37], [CX + 8, 37], [CX + 11, 30], [CX + 11, 40], [CX + 6, 47], [CX - 6, 47], [CX - 11, 40]], b);
      must();
      g.rect(CX - 2, 39, 5, 2, C.darkRed);
      for (const x of [-6, -2, 2, 6]) g.line(CX + x, 42, CX + x, 46, lite);
      return;
    case 'stubble':
      for (let y = 36; y <= 42; y++) for (let x = CX - 9; x <= CX + 9; x++) if ((x + y) % 2 === 0 && g.get(x, y) === p.sk) g.set(x, y, blend(p.sk, b, 0.5));
      return;
    default:
      must();
      g.rect(CX - 2, 41, 5, 3, b);
      if (L.longBeard) {
        g.poly([[CX - 5, 41], [CX + 5, 41], [CX + 3, 56], [CX, 60], [CX - 3, 56]], b);
        g.line(CX, 43, CX, 57, lite);
      }
  }
}

function face(p: P): void {
  const { g, L } = p;
  const type: Eyes = L.eyes ?? (p.fem ? 'gentle' : 'round');
  const iris = L.skin === 'ghoul' ? C.lime : p.fem ? C.brown : C.darkBrown;
  eye(g, CX - 5, -1, type, iris);
  eye(g, CX + 5, 1, type, iris);
  brows(p, type);
  // 鼻子：一道影 + 鼻底
  g.set(CX + 1, 33, p.sks);
  g.set(CX + 1, 34, p.sks);
  g.rect(CX - 1, 35, 3, 1, p.sks);
  if (p.fem) {
    g.rect(CX - 9, 35, 3, 1, blend(C.pink, p.sk, 0.375));
    g.rect(CX + 7, 35, 3, 1, blend(C.pink, p.sk, 0.375));
  }
  if (L.skin === 'ghoul') {
    g.line(CX - 8, 34, CX - 6, 38, blend(C.green, C.gray, 0.5));
    g.line(CX + 8, 34, CX + 6, 38, blend(C.green, C.gray, 0.5));
  }
  if (L.patch) {
    // 独眼罩盖右眼（画面右边），带子勒过额头
    g.ellipse(CX + 5, EY, 4, 3.5, C.ink);
    g.line(CX + 1, EY - 2, CX - 11, 22, C.ink);
    g.line(CX + 9, EY - 1, CX + 11, EY - 1, C.ink);
  }
  if (L.scar) line2(g, CX - 9, 27, CX - 4, 36, blend(C.darkRed, p.sk, 0.375));
  if (L.mask !== undefined) {
    g.poly([[CX - 11, 34], [CX + 11, 34], [CX + 10, 40], [CX + 5, 44], [CX - 5, 44], [CX - 10, 40]], L.mask);
    g.line(CX - 11, 35, CX + 11, 35, blend(L.mask, C.ink, 0.375));
  }
  beard(p);
  if (L.mask === undefined) mouth(p);
}

// ===== 头发 =====
function hair(p: P): void {
  const { g, L, hm } = p;
  const hl = blend(hm, C.white, 0.25);
  if (L.style === 'helmet') return helmet(p);
  if (L.style === 'hood') {
    // 兜帽：把整颗头裹住，只露脸
    g.ellipse(CX, 27, 15, 16, hm, (x, y) => !((x - CX) ** 2 / 100 + (y - 30) ** 2 / 150 < 1) || y < 20);
    g.poly([[CX - 15, 30], [CX - 18, 52], [CX + 18, 52], [CX + 15, 30], [CX + 10, 44], [CX - 10, 44]], hm);
    g.line(CX - 10, 19, CX + 10, 19, blend(hm, C.ink, 0.375));
    return;
  }
  // 发顶 + 两鬓
  g.ellipse(CX, 25, 12.5, 12.5, hm, (_x, y) => y < 25);
  g.rect(CX - 12, 22, 3, 10, hm);
  g.rect(CX + 10, 22, 3, 10, hm);
  // 刘海：中分，两侧一绺一绺往下
  for (let x = CX - 11; x <= CX + 11; x++) {
    const d = Math.abs(x - CX);
    const drop = d < 2 ? 0 : (d % 4 < 2 ? 3 : 1) + (d > 7 ? 2 : 0);
    for (let y = 17; y < 19 + drop; y++) g.set(x, y, hm);
  }
  // 头顶高光
  g.line(CX - 7, 16, CX - 2, 14, hl);
  g.line(CX - 8, 18, CX - 4, 16, hl);
  if (L.style === 'short') for (let x = CX - 9; x <= CX + 9; x += 3) g.set(x, 12, hm);
  if (L.style === 'topknot' || L.style === 'tail') {
    g.ellipse(CX, 9, 5, 4.5, hm);
    g.line(CX - 3, 7, CX, 6, hl);
    g.rect(CX - 4, 12, 9, 2, L.accent ?? C.gold);
  }
  if (L.style === 'band' && L.accent !== undefined && !L.head) {
    g.rect(CX - 12, 18, 25, 3, L.accent);
    g.rect(CX - 12, 18, 25, 1, blend(L.accent, C.white, 0.25));
  }
  if (L.style === 'buns') {
    for (const sx of [-1, 1]) {
      g.ellipse(CX + sx * 10, 12, 5, 4.6, hm);
      g.line(CX + sx * 8, 9, CX + sx * 11, 8, hl);
      g.ellipse(CX + sx * 13, 9, 1.6, 1.6, L.accent ?? C.pink);
    }
  }
  if (L.style === 'highbun') {
    g.ellipse(CX, 7, 6.5, 6, hm);
    g.line(CX - 3, 4, CX + 1, 2, hl);
    g.line(CX - 10, 9, CX + 10, 4, L.accent ?? C.gold);
    g.ellipse(CX + 10, 4, 1.6, 1.6, C.red);
  }
  if (L.style === 'long' || p.fem) {
    // 鬓边垂下的两缕
    g.poly([[CX - 12, 24], [CX - 9, 24], [CX - 10, 40], [CX - 13, 38]], hm);
    g.poly([[CX + 12, 24], [CX + 9, 24], [CX + 10, 40], [CX + 13, 38]], hm);
  }
}

function helmet(p: P): void {
  const { g, L } = p;
  const metal = L.metal ?? C.lightGray;
  const shell = L.head === 'lion' ? C.white : C.gray;
  const dark = blend(shell, C.ink, 0.375);
  g.ellipse(CX, 24, 14, 13, shell, (_x, y) => y < 24);
  // 护颊
  g.rect(CX - 14, 22, 4, 15, shell);
  g.rect(CX + 11, 22, 4, 15, shell);
  g.line(CX - 13, 36, CX - 10, 38, dark);
  g.line(CX + 13, 36, CX + 10, 38, dark);
  // 盔沿 + 盔梁
  g.rect(CX - 14, 20, 29, 3, metal);
  g.rect(CX - 1, 11, 3, 9, metal);
  g.line(CX - 8, 14, CX - 3, 12, blend(shell, C.white, 0.5));
  if (L.head === 'lion') {
    // 狮头盔：额前狮面，一圈金鬃
    for (let x = CX - 13; x <= CX + 13; x += 2) g.rect(x, 20 + ((x / 2) % 2), 2, 3, C.gold);
    g.rect(CX - 6, 13, 12, 6, C.gold);
    g.rect(CX - 4, 15, 2, 2, C.ink);
    g.rect(CX + 2, 15, 2, 2, C.ink);
    g.rect(CX - 2, 17, 4, 1, C.darkRed);
  }
  const hc = L.headColor ?? L.accent ?? C.red;
  if (L.head === 'plume' || L.head === 'lion') {
    // 大红盔缨，一丝丝往后飘
    g.rect(CX - 1, 7, 3, 4, metal);
    g.ellipse(CX + 2, 4, 6, 4, hc);
    for (let k = 0; k < 4; k++) g.line(CX + 4 + k, 3 + k, CX + 12 + k * 2, 10 + k * 2, hc);
    g.line(CX - 1, 2, CX + 5, 1, blend(hc, C.white, 0.375));
  } else {
    g.rect(CX - 1, 5, 3, 6, L.accent ?? C.red);
    g.rect(CX - 3, 10, 7, 1, metal);
  }
}

function feather(g: Grid, pts: [number, number][], c: number): void {
  let k = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
    for (let j = 0; j < n; j++, k++) {
      const col = Math.floor(k / 4) % 2 ? C.white : c;
      const x = ax + ((bx - ax) * j) / n;
      const y = ay + ((by - ay) * j) / n;
      g.set(x, y, col);
      g.set(x, y + 1, col);
    }
  }
}

function headgear(p: P): void {
  const { g, L } = p;
  const hc = L.headColor ?? L.accent ?? C.red;
  const metal = L.metal ?? C.lightGray;
  if (L.hat !== undefined && !L.head) {
    // 普通的帽子：软脚幞头
    g.ellipse(CX, 12, 11, 7, L.hat, (_x, y) => y < 14);
    g.rect(CX - 11, 12, 23, 6, L.hat);
    g.rect(CX - 11, 17, 23, 1, blend(L.hat, C.white, 0.25));
    g.rect(CX - 15, 14, 4, 2, L.hat);
    g.rect(CX + 12, 14, 4, 2, L.hat);
  }
  switch (L.head) {
    case 'guard':
      g.rect(CX - 12, 17, 25, 3, metal);
      g.rect(CX - 4, 15, 9, 5, C.gold);
      g.ellipse(CX + 0.5, 17.5, 1.6, 1.6, C.red);
      break;
    case 'jin': {
      const c = L.headColor ?? L.outfit[1];
      g.ellipse(CX, 11, 11, 7, c, (_x, y) => y < 13);
      g.rect(CX - 11, 11, 23, 7, c);
      g.rect(CX - 11, 16, 23, 2, L.trim);
      break;
    }
    case 'lunjin': {
      const c = L.headColor ?? L.outfit[1];
      g.ellipse(CX, 10, 12, 8, c, (_x, y) => y < 13);
      g.rect(CX - 12, 10, 25, 7, c);
      for (const x of [-7, -2, 3, 8]) g.line(CX + x, 4, CX + x - 1, 15, blend(c, C.ink, 0.375));
      g.rect(CX - 12, 16, 25, 2, L.trim);
      break;
    }
    case 'daoguan':
      g.ellipse(CX, 9, 5, 4.5, L.hair[0]);
      g.rect(CX - 4, 4, 9, 5, C.gold);
      for (const x of [-4, 0, 4]) g.rect(CX + x, 2, 1, 2, C.gold);
      g.line(CX - 9, 8, CX + 9, 6, C.brown);
      g.ellipse(CX + 0.5, 6, 1.4, 1.4, L.orb ?? C.red);
      break;
    case 'zijin':
      g.rect(CX - 12, 17, 25, 3, C.gold);
      g.ellipse(CX + 0.5, 18.5, 1.6, 1.6, C.red);
      g.rect(CX - 5, 6, 11, 7, C.gold);
      g.rect(CX - 3, 8, 7, 3, blend(C.yellow, C.white, 0.5));
      g.ellipse(CX + 0.5, 9.5, 1.6, 1.6, C.red);
      // 两根雉鸡翎向两边弯出去
      feather(g, [[CX - 3, 6], [CX - 8, 1], [CX - 16, 0], [CX - 24, 3], [CX - 29, 10]], hc);
      feather(g, [[CX + 3, 6], [CX + 8, 1], [CX + 16, 0], [CX + 24, 3], [CX + 29, 10]], hc);
      break;
    case 'buyao': {
      const c = L.headColor ?? C.gold;
      g.line(CX - 12, 10, CX + 6, 4, c);
      for (let k = 0; k < 7; k++) {
        g.set(CX - 11, 11 + k, k % 2 ? C.red : c);
        g.set(CX - 8, 10 + k, k % 2 ? c : C.red);
      }
      g.ellipse(CX + 9, 10, 2.6, 2.6, C.pink);
      g.ellipse(CX + 9, 10, 1, 1, C.yellow);
      break;
    }
    case 'flower':
      for (const [fx, fy] of [[CX - 10, 12], [CX + 10, 11], [CX + 13, 16]] as [number, number][]) {
        g.ellipse(fx, fy, 2.8, 2.8, hc);
        g.ellipse(fx, fy, 1, 1, C.yellow);
      }
      break;
    case 'cap':
      g.rect(CX - 10, 7, 21, 11, L.hat ?? C.ink);
      g.rect(CX - 13, 16, 27, 3, L.hat ?? C.ink);
      g.ellipse(CX + 0.5, 5, 4, 3, hc);
      for (let k = -3; k <= 3; k += 2) g.line(CX + k, 6, CX + k * 1.6, 10, hc);
      break;
    case 'crown':
      // 进贤冠：前高后低，金梁
      g.poly([[CX - 12, 19], [CX + 12, 19], [CX + 11, 9], [CX - 11, 1]], L.hat ?? C.ink);
      for (const k of [0, 4]) g.line(CX - 10, 4 + k, CX + 10, 11 + k, C.gold);
      g.rect(CX - 13, 17, 27, 2, C.gold);
      break;
    case 'feather':
      feather(g, [[CX + 4, 14], [CX + 8, 6], [CX + 15, 1], [CX + 24, 2]], hc);
      break;
    case 'talisman':
      g.rect(CX - 11, 8, 23, 9, L.hat ?? C.darkGray);
      g.rect(CX - 13, 16, 27, 2, L.hat ?? C.darkGray);
      // 额前垂下一张黄符，盖到下巴
      g.rect(CX - 3, 17, 7, 25, C.yellow);
      g.line(CX, 19, CX, 39, C.red);
      g.rect(CX - 2, 23, 5, 1, C.red);
      g.rect(CX - 2, 30, 5, 1, C.red);
      break;
    default:
      break;
  }
}

export function drawBust(L: Look): Grid {
  const g = new Grid(BUST_W, BUST_H);
  const [sk, sks] = skinOf(L);
  const fem = !!L.female;
  const sw = L.fat ? 28 : L.broad ? 26 : fem ? 19 : 23;
  const p: P = { g, L, sk, sks, hm: L.hair[0], hd: L.hair[1], o: L.outfit[0], od: L.outfit[1], sw, fem };
  back(p);
  torso(p);
  if (L.style === 'hood') hair(p);
  headShape(p);
  if (L.style !== 'hood') hair(p);
  face(p);
  headgear(p);
  const shades: Record<number, number> = { [L.outfit[0]]: L.outfit[1], [L.hair[0]]: L.hair[1], [sk]: sks };
  if (L.cape !== undefined) shades[L.cape] = L.outfit[1];
  g.shadeRight(shades, 4);
  g.outline(C.ink);
  // 底边用有序抖动淡出
  for (let y = BUST_H - 10; y < BUST_H; y++) {
    const t = (y - (BUST_H - 10)) / 10;
    for (let x = 0; x < BUST_W; x++) if (((x * 5 + y * 3) % 8) / 8 < t) g.set(x, y, 0);
  }
  return g;
}
