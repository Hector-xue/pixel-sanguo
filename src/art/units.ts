// Q 版人物纸娃娃：头身 + 发型 + 服饰 + 武器分层拼，自动描边和阴影。
// 画布 32×32，人物朝左站在右侧 24 列里，左边 8 列留给攻击时伸出去的武器。
import { Grid } from './pixel';
import { C } from './palette';

export type Weapon = 'sword' | 'saber' | 'spear' | 'staff' | 'fan' | 'dagger' | 'axe' | 'club' | 'cane' | 'scroll' | 'none';
export type HairStyle = 'topknot' | 'band' | 'tail' | 'buns' | 'long' | 'highbun' | 'hood' | 'helmet' | 'short';
export type Pose = 'idle' | 'idle2' | 'atk' | 'cast' | 'hurt' | 'down';
export const POSES: Pose[] = ['idle', 'idle2', 'atk', 'cast', 'hurt', 'down'];

export interface Look {
  outfit: [number, number];
  trim: number;
  belt: number;
  boots: number;
  hair: [number, number];
  style: HairStyle;
  accent?: number;
  weapon: Weapon;
  metal?: number;
  orb?: number;
  female?: boolean;
  broad?: boolean;
  armor?: boolean;
  beard?: number;
  longBeard?: boolean;
  mask?: number;
  hat?: number;
  cape?: number;
}

const OX = 8;
export const UNIT_W = 32;
export const UNIT_H = 32;
export const FEET_Y = 29;

const HAIRS: [number, number][] = [[C.darkBrown, C.ink], [C.brown, C.darkBrown], [C.navy, C.ink]];
const MALE_STYLES: HairStyle[] = ['topknot', 'band', 'tail'];
const FEMALE_STYLES: HairStyle[] = ['buns', 'long', 'highbun'];

const HERO: Record<string, Omit<Look, 'hair' | 'style'>> = {
  warrior: { outfit: [C.red, C.darkRed], trim: C.gold, belt: C.brown, boots: C.brown, weapon: 'sword', armor: true, accent: C.red },
  scholar: { outfit: [C.blue, C.navy], trim: C.white, belt: C.gold, boots: C.darkBrown, weapon: 'fan', accent: C.lightBlue },
  mystic: { outfit: [C.purple, C.darkPurple], trim: C.yellow, belt: C.red, boots: C.ink, weapon: 'staff', orb: C.yellow, accent: C.lilac },
};

export function heroLook(classId: string, gender: string, variant: number): Look {
  const female = gender === 'female';
  const v = ((variant % 3) + 3) % 3;
  return { ...HERO[classId], female, hair: HAIRS[v], style: (female ? FEMALE_STYLES : MALE_STYLES)[v] };
}

export const LOOKS: Record<string, Look> = {
  thief: { outfit: [C.gray, C.darkGray], trim: C.lightGray, belt: C.brown, boots: C.darkBrown, hair: [C.darkGray, C.ink], style: 'hood', weapon: 'dagger', metal: C.lightGray },
  bandit: { outfit: [C.lightBrown, C.brown], trim: C.sand, belt: C.red, boots: C.darkBrown, hair: [C.darkBrown, C.ink], style: 'band', accent: C.red, weapon: 'club' },
  rogue: { outfit: [C.darkGray, C.ink], trim: C.gray, belt: C.darkRed, boots: C.ink, hair: [C.darkBrown, C.ink], style: 'tail', weapon: 'saber', mask: C.darkGray },
  soldier: { outfit: [C.green, C.darkGreen], trim: C.tan, belt: C.brown, boots: C.darkBrown, hair: [C.gray, C.darkGray], style: 'helmet', accent: C.red, weapon: 'spear', armor: true },
  witch: { outfit: [C.lilac, C.purple], trim: C.pink, belt: C.darkPurple, boots: C.darkPurple, hair: [C.darkPurple, C.ink], style: 'long', female: true, weapon: 'staff', orb: C.orange },
  brute: { outfit: [C.brown, C.darkBrown], trim: C.tan, belt: C.red, boots: C.ink, hair: [C.darkBrown, C.ink], style: 'band', accent: C.darkRed, weapon: 'axe', broad: true, beard: C.darkBrown },
  strategist: { outfit: [C.tan, C.lightBrown], trim: C.darkBrown, belt: C.darkRed, boots: C.darkBrown, hair: [C.darkBrown, C.ink], style: 'topknot', weapon: 'fan', beard: C.darkBrown, hat: C.darkGray },
  chief: { outfit: [C.darkRed, C.darkPurple], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.darkGray, C.ink], style: 'helmet', accent: C.gold, weapon: 'axe', metal: C.gold, broad: true, armor: true, beard: C.ink, cape: C.red },
  guide: { outfit: [C.lime, C.grass], trim: C.white, belt: C.green, boots: C.darkBrown, hair: [C.darkBrown, C.ink], style: 'topknot', weapon: 'scroll', hat: C.green },
  elder: { outfit: [C.tan, C.lightBrown], trim: C.paper, belt: C.brown, boots: C.darkBrown, hair: [C.lightGray, C.gray], style: 'topknot', weapon: 'cane', beard: C.white, longBeard: true },
  zhaoyun: { outfit: [C.white, C.lightGray], trim: C.lightBlue, belt: C.blue, boots: C.darkGray, hair: [C.lightGray, C.gray], style: 'helmet', accent: C.red, weapon: 'spear', armor: true, cape: C.white },
  helper: { outfit: [C.lightBlue, C.blue], trim: C.white, belt: C.gold, boots: C.darkBrown, hair: [C.darkBrown, C.ink], style: 'topknot', weapon: 'scroll', hat: C.navy },
  diaochan: { outfit: [C.pink, C.orange], trim: C.white, belt: C.gold, boots: C.darkRed, hair: [C.darkBrown, C.ink], style: 'highbun', female: true, weapon: 'fan', accent: C.gold },
  constable: { outfit: [C.navy, C.ink], trim: C.red, belt: C.red, boots: C.ink, hair: [C.darkBrown, C.ink], style: 'topknot', weapon: 'saber', hat: C.ink },
  squire: { outfit: [C.green, C.darkGreen], trim: C.paper, belt: C.gold, boots: C.darkBrown, hair: [C.darkBrown, C.ink], style: 'topknot', weapon: 'none', beard: C.darkBrown, hat: C.darkGreen },
  soldier_npc: { outfit: [C.red, C.darkRed], trim: C.gold, belt: C.brown, boots: C.darkBrown, hair: [C.gray, C.darkGray], style: 'helmet', accent: C.gold, weapon: 'spear', armor: true },
};

export function lookFor(key: string, variant = 0): Look {
  if (key.startsWith('hero_')) {
    const [, cls, gender] = key.split('_');
    return heroLook(cls, gender, variant);
  }
  return LOOKS[key] ?? LOOKS.thief;
}

interface Frame {
  hx: number;
  hy: number;
  eyesClosed: boolean;
  arm: 'down' | 'forward' | 'up';
}

function frameOf(pose: Pose): Frame {
  switch (pose) {
    case 'idle2':
      return { hx: OX + 11.5, hy: 10, eyesClosed: false, arm: 'down' };
    case 'atk':
      return { hx: OX + 10.5, hy: 9, eyesClosed: false, arm: 'forward' };
    case 'cast':
      return { hx: OX + 11.5, hy: 9, eyesClosed: false, arm: 'up' };
    case 'hurt':
      return { hx: OX + 12.5, hy: 9, eyesClosed: true, arm: 'down' };
    default:
      return { hx: OX + 11.5, hy: 9, eyesClosed: pose === 'down', arm: 'down' };
  }
}

function drawBackHair(g: Grid, L: Look, f: Frame): void {
  const [hm] = L.hair;
  if (L.style === 'long') g.rect(Math.round(f.hx + 2), Math.round(f.hy - 1), 6, 14, hm);
  if (L.style === 'tail') {
    g.rect(Math.round(f.hx + 5), Math.round(f.hy - 2), 2, 4, hm);
    g.rect(Math.round(f.hx + 6), Math.round(f.hy + 2), 2, 7, hm);
  }
  if (L.cape) g.poly([[OX + 12, 15], [OX + 20, 16], [OX + 21, 27], [OX + 13, 27]], L.cape);
}

function drawBody(g: Grid, L: Look, f: Frame): void {
  const [om] = L.outfit;
  const w = L.broad ? 1 : 0;
  for (let y = 15; y <= 26; y++) {
    let l = OX + 8 - (y - 15) * 0.25 - w;
    const r = OX + 15 + (y - 15) * 0.25 + w;
    if (L.female && y > 21) l -= (y - 21) * 0.35;
    for (let x = Math.round(l); x <= Math.round(r); x++) g.set(x, y, om);
  }
  g.line(OX + 12, 15, OX + 9, 19, L.trim);
  g.line(OX + 12, 15, OX + 13, 17, L.trim);
  g.rect(OX + 6 - w, 21, 11 + 2 * w, 1, L.belt);
  g.set(OX + 10, 21, C.gold);
  if (L.armor) {
    g.rect(OX + 6 - w, 15, 4, 2, C.gray);
    g.rect(OX + 13, 15, 3 + w, 2, C.gray);
  }
  g.rect(OX + 7, 27, 3, 2, L.boots);
  g.rect(OX + 13, 27, 3, 2, L.boots);
  // 手臂
  if (f.arm === 'down') {
    g.rect(OX + 6, 16, 2, 5, om);
    g.rect(OX + 5, 20, 2, 2, C.skin);
  } else if (f.arm === 'forward') {
    g.rect(OX + 3, 17, 5, 2, om);
    g.rect(OX + 1, 17, 2, 2, C.skin);
  } else {
    g.rect(OX + 5, 12, 2, 5, om);
    g.rect(OX + 6, 16, 2, 2, om);
    g.rect(OX + 4, 10, 2, 2, C.skin);
  }
}

function drawHead(g: Grid, L: Look, f: Frame): void {
  const { hx, hy } = f;
  const [hm] = L.hair;
  g.ellipse(hx, hy, 6.6, 6.3, C.skin);
  // 发型
  const cap = (x: number, y: number) => y + 0.5 < hy - 1.5 || (x + 0.5 > hx + 2 + (y - hy) * 0.6 && y < hy + 4);
  if (L.style === 'helmet') {
    g.ellipse(hx, hy, 7.1, 6.9, C.gray, (_x, y) => y + 0.5 < hy - 0.5);
    g.rect(Math.round(hx - 7), Math.round(hy - 1), 14, 1, C.lightGray);
    g.ellipse(hx, hy, 7.1, 6.9, hm, (x, y) => y >= hy - 0.5 && x + 0.5 > hx + 3 && y < hy + 4);
    g.rect(Math.round(hx - 1), Math.round(hy - 9), 2, 3, L.accent ?? C.red);
  } else if (L.style === 'hood') {
    g.ellipse(hx, hy, 7.2, 7.0, hm, (x, y) => y + 0.5 < hy - 1 || (x + 0.5 > hx + 1 && y < hy + 6));
  } else {
    g.ellipse(hx, hy, 7.0, 6.8, hm, cap);
    const fy = Math.round(hy - 2);
    for (let x = Math.round(hx - 5); x <= Math.round(hx + 2); x++) g.set(x, fy, hm);
    g.set(Math.round(hx - 5), fy + 1, hm);
    g.set(Math.round(hx - 2), fy + 1, hm);
  }
  if (L.style === 'topknot') {
    g.ellipse(hx + 1, hy - 7.5, 2.2, 2, hm);
    g.rect(Math.round(hx - 1), Math.round(hy - 6), 4, 1, L.accent ?? C.gold);
  }
  if (L.style === 'band' || L.style === 'short') {
    if (L.accent) g.rect(Math.round(hx - 7), Math.round(hy - 3), 14, 1, L.accent);
  }
  if (L.style === 'buns') {
    g.ellipse(hx - 4.5, hy - 6, 2.3, 2.2, hm);
    g.ellipse(hx + 4.5, hy - 6.5, 2.3, 2.2, hm);
  }
  if (L.style === 'highbun') {
    g.ellipse(hx + 1.5, hy - 7.5, 3, 2.5, hm);
    g.line(Math.round(hx - 2), Math.round(hy - 9), Math.round(hx + 5), Math.round(hy - 6), L.accent ?? C.gold);
  }
  if (L.hat !== undefined) {
    g.rect(Math.round(hx - 3), Math.round(hy - 8), 7, 3, L.hat);
    g.rect(Math.round(hx + 4), Math.round(hy - 6), 1, 5, L.hat);
  }
  // 五官（朝左，前眼在左）
  const ey = Math.round(hy + 1);
  const ex1 = Math.round(hx - 4.5);
  const ex2 = Math.round(hx - 0.5);
  if (f.eyesClosed) {
    g.set(ex1, ey + 1, C.ink);
    g.set(ex1 + 1, ey, C.ink);
    g.set(ex2, ey, C.ink);
    g.set(ex2 + 1, ey + 1, C.ink);
  } else {
    g.rect(ex1, ey, 1, 2, C.ink);
    g.rect(ex2, ey, 1, 2, C.ink);
    if (L.female) {
      g.set(ex1 - 1, ey, C.ink);
      g.set(ex2 + 1, ey, C.ink);
    }
  }
  if (L.female) {
    g.set(ex1 - 1, ey + 3, C.pink);
    g.set(ex2 + 1, ey + 3, C.pink);
  }
  g.set(Math.round(hx - 2.5), Math.round(hy + 4), C.skinShade);
  if (L.mask !== undefined) g.rect(Math.round(hx - 7), Math.round(hy + 3), 9, 2, L.mask);
  if (L.beard !== undefined) {
    for (let x = Math.round(hx - 5); x <= Math.round(hx + 1); x++) g.set(x, Math.round(hy + 5), L.beard);
    g.rect(Math.round(hx - 4), Math.round(hy + 4), 2, 1, L.beard);
    g.rect(Math.round(hx - 1), Math.round(hy + 4), 2, 1, L.beard);
    if (L.longBeard) g.poly([[hx - 5, hy + 5], [hx + 1, hy + 5], [hx - 1.5, hy + 11], [hx - 3.5, hy + 11]], L.beard);
  }
}

function drawWeapon(g: Grid, L: Look, f: Frame): void {
  const metal = L.metal ?? C.white;
  const wood = C.lightBrown;
  if (f.arm === 'forward') {
    // 攻击：武器水平指向前方
    const y = 17;
    switch (L.weapon) {
      case 'sword':
      case 'saber':
        g.rect(0, y, OX + 1, 1, metal);
        g.rect(OX, y - 1, 1, 3, C.gold);
        if (L.weapon === 'saber') g.set(0, y - 1, metal);
        return;
      case 'spear':
        g.rect(0, y, OX + 2, 1, wood);
        g.poly([[0, y - 1.5], [0, y + 2.5], [-3, y + 0.5]], metal);
        g.rect(2, y, 3, 1, metal);
        g.rect(5, y - 1, 1, 3, L.accent ?? C.red);
        return;
      case 'staff':
      case 'cane':
        g.rect(0, y, OX + 2, 1, C.brown);
        if (L.orb) g.ellipse(1, y + 0.5, 1.8, 1.8, L.orb);
        return;
      case 'fan':
        g.ellipse(OX - 2, y + 0.5, 3, 3.5, C.white);
        g.line(OX - 4, y - 1, OX - 1, y + 1, C.sand);
        return;
      case 'dagger':
        g.rect(OX - 4, y, 4, 1, metal);
        return;
      case 'axe':
        g.rect(1, y, OX + 1, 1, wood);
        g.poly([[0, y - 3], [3, y - 3], [3, y + 4], [0, y + 4]], metal);
        return;
      case 'club':
        g.rect(1, y - 1, OX, 2, wood);
        g.ellipse(1.5, y + 0, 2, 2, wood);
        return;
      case 'scroll':
        g.rect(OX - 3, y - 1, 3, 3, C.paper);
        return;
      default:
        return;
    }
  }
  const up = f.arm === 'up';
  const hx = up ? OX + 4 : OX + 5;
  const hy = up ? 10 : 20;
  const x = hx - 2;
  switch (L.weapon) {
    case 'sword':
    case 'saber':
      g.rect(x, hy - 13, 1, 12, metal);
      if (L.weapon === 'saber') g.set(x - 1, hy - 13, metal);
      g.rect(x - 1, hy - 1, 3, 1, C.gold);
      g.rect(x, hy, 1, 3, C.brown);
      return;
    case 'spear':
      g.rect(x, Math.max(0, hy - 20), 1, 28, wood);
      g.poly([[x - 1.5, Math.max(0, hy - 20) + 3], [x + 2.5, Math.max(0, hy - 20) + 3], [x + 0.5, Math.max(0, hy - 20) - 1]], metal);
      g.rect(x - 1, Math.max(0, hy - 20) + 4, 3, 1, L.accent ?? C.red);
      return;
    case 'staff':
      g.rect(x, hy - 16, 1, 24, C.brown);
      g.ellipse(x + 0.5, hy - 17, 2, 2, L.orb ?? C.yellow);
      return;
    case 'cane':
      g.rect(x, hy - 7, 1, 15, C.brown);
      g.set(x + 1, hy - 8, C.brown);
      return;
    case 'fan':
      g.ellipse(x + 0.5, hy - 4, 3, 3.5, C.white);
      g.line(x - 1, hy - 6, x + 1, hy - 2, C.sand);
      g.rect(x + 1, hy - 1, 1, 2, C.brown);
      return;
    case 'dagger':
      g.rect(x, hy - 5, 1, 4, metal);
      g.rect(x, hy - 1, 1, 2, C.brown);
      return;
    case 'axe':
      g.rect(x, hy - 11, 1, 17, wood);
      g.poly([[x + 0.5, hy - 12], [x - 3, hy - 13], [x - 3, hy - 6], [x + 0.5, hy - 7]], metal);
      return;
    case 'club':
      g.rect(x - 1, hy - 9, 2, 11, wood);
      g.ellipse(x, hy - 9, 2, 2, wood);
      return;
    case 'scroll':
      g.rect(x - 1, hy - 1, 4, 3, C.paper);
      g.rect(x - 1, hy - 1, 1, 3, C.tan);
      return;
    default:
      return;
  }
}

export function drawUnit(L: Look, pose: Pose): Grid {
  const f = frameOf(pose);
  const g = new Grid(UNIT_W, UNIT_H);
  drawBackHair(g, L, f);
  drawBody(g, L, f);
  drawHead(g, L, f);
  drawWeapon(g, L, f);
  const shades: Record<number, number> = { [L.outfit[0]]: L.outfit[1], [L.hair[0]]: L.hair[1], [C.skin]: C.skinShade };
  if (L.cape) shades[L.cape] = L.outfit[1];
  g.shadeRight(shades, 1);
  g.outline(C.ink);
  if (pose === 'down') {
    const r = g.rotateCW();
    // 转完后人物贴着地面
    const out = new Grid(UNIT_W, UNIT_H);
    out.blit(r, 0, -2);
    return out;
  }
  return g;
}

// 头像 24×24：取上半身
export function drawAvatar(L: Look): Grid {
  const g = drawUnit(L, 'idle');
  return g.crop(OX, 0, 24, 24);
}
