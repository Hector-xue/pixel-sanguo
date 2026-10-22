// 场景舞台的地面摆设：屋舍、篱笆、树、货摊、帐篷、营火……原尺寸像素（和人物一样细），
// 每种地点一套摆放规则，按地点名做随机种子，同一个地方每次进来摆得一样。
import { Grid, seeded } from './pixel';
import { C, blend } from './palette';

export type PropKind =
  | 'house' | 'hut' | 'fence' | 'well' | 'hay' | 'cart' | 'jar' | 'lantern' | 'stall' | 'banner' | 'tent' | 'fire' | 'rack'
  | 'tree' | 'blossom' | 'pine' | 'willow' | 'bush' | 'flowers' | 'rock' | 'reeds' | 'boat' | 'stalagmite' | 'crystal' | 'torch'
  | 'grave' | 'pillar' | 'stakes' | 'sign' | 'bamboo' | 'deadtree' | 'lion' | 'tufts';

// 会发光的摆设（夜里加暖光）：返回光点相对贴图左上角的位置
export const GLOW: Partial<Record<PropKind, [number, number][]>> = {
  lantern: [[5, 6]], fire: [[11, 12]], torch: [[4, 2]], house: [[13, 21]], stall: [[16, 10]], crystal: [[6, 6]],
};

function outlined(g: Grid): Grid {
  g.outline(C.ink);
  return g;
}

function house(rnd: () => number, small: boolean): Grid {
  const w = small ? 30 : 40;
  const g = new Grid(w + 4, 40);
  const wall = rnd() < 0.5 ? C.lightPaper : C.paper;
  const roof = rnd() < 0.5 ? C.darkGray : C.brown;
  const roofD = roof === C.darkGray ? C.ink : C.darkBrown;
  const ox = 2;
  const base = 39;
  const wh = small ? 13 : 16;
  // 墙 + 柱
  g.rect(ox + 3, base - wh, w - 6, wh, wall);
  g.rect(ox + 3, base - wh, 2, wh, C.brown);
  g.rect(ox + w - 5, base - wh, 2, wh, C.brown);
  g.rect(ox + 3, base - 2, w - 6, 2, C.lightGray);
  // 门窗
  const dx = ox + Math.round(w / 2) - 3;
  g.rect(dx, base - 10, 7, 10, C.darkBrown);
  g.rect(dx + 3, base - 10, 1, 10, C.brown);
  if (!small) {
    g.rect(ox + 8, base - 12, 6, 5, C.darkBrown);
    g.rect(ox + 8, base - 10, 6, 1, C.lightBrown);
    g.rect(ox + w - 14, base - 12, 6, 5, C.darkBrown);
    g.rect(ox + w - 14, base - 10, 6, 1, C.lightBrown);
  }
  // 歇山顶：屋檐两头翘起，瓦垄一道一道
  const ry = base - wh;
  g.poly([[ox - 1, ry + 1], [ox + w + 1, ry + 1], [ox + w - 5, ry - 10], [ox + 5, ry - 10]], roof);
  for (let x = ox + 3; x < ox + w - 1; x += 3) g.line(x, ry, x + (x < ox + w / 2 ? 2 : -2), ry - 8, roofD);
  g.rect(ox - 2, ry, 3, 2, roof);
  g.rect(ox + w - 1, ry, 3, 2, roof);
  g.set(ox - 2, ry - 1, roof);
  g.set(ox + w + 1, ry - 1, roof);
  g.rect(ox + 4, ry - 11, w - 8, 2, roofD);
  if (!small) {
    // 烟囱
    g.rect(ox + w - 12, ry - 15, 4, 6, C.gray);
    g.rect(ox + w - 13, ry - 16, 6, 1, C.darkGray);
  }
  return outlined(g);
}

function fence(): Grid {
  const g = new Grid(30, 12);
  for (let x = 1; x < 30; x += 6) {
    g.rect(x, 1, 2, 11, C.lightBrown);
    g.set(x, 0, C.lightBrown);
  }
  g.rect(0, 4, 30, 2, C.brown);
  g.rect(0, 8, 30, 1, C.brown);
  return outlined(g);
}

function well(): Grid {
  const g = new Grid(22, 26);
  g.rect(3, 16, 16, 9, C.lightGray);
  for (let x = 3; x < 19; x += 4) g.rect(x, 16 + ((x / 4) % 2) * 4, 3, 1, C.gray);
  g.rect(3, 15, 16, 2, C.gray);
  g.rect(4, 4, 2, 12, C.brown);
  g.rect(16, 4, 2, 12, C.brown);
  g.poly([[1, 5], [21, 5], [17, 0], [5, 0]], C.darkBrown);
  g.rect(9, 6, 4, 6, C.lightBrown);
  g.line(11, 6, 11, 14, C.darkGray);
  return outlined(g);
}

function hay(): Grid {
  const g = new Grid(22, 18);
  g.ellipse(11, 12, 10, 7, C.gold, (_x, y) => y < 17);
  g.ellipse(11, 7, 6, 5, C.gold);
  for (let k = 0; k < 9; k++) g.line(3 + k * 2, 16, 4 + k * 2, 8 + (k % 3), C.tan);
  g.rect(2, 11, 18, 1, C.brown);
  return outlined(g);
}

function cart(): Grid {
  const g = new Grid(32, 20);
  g.rect(3, 6, 22, 6, C.lightBrown);
  g.rect(3, 6, 22, 1, C.tan);
  for (let x = 5; x < 25; x += 5) g.rect(x, 7, 1, 5, C.brown);
  g.line(25, 9, 31, 12, C.brown);
  g.ellipse(9, 14, 5, 5, C.brown);
  g.ellipse(9, 14, 3, 3, C.lightBrown);
  g.set(9, 14, C.darkBrown);
  // 车上的麻袋
  g.ellipse(9, 4, 4, 3, C.sand);
  g.ellipse(17, 4, 4, 3, C.tan);
  return outlined(g);
}

function jar(rnd: () => number): Grid {
  const g = new Grid(20, 14);
  for (const [x, c] of [[5, C.brown], [14, C.darkBrown]] as [number, number][]) {
    g.ellipse(x, 8, 4, 5, c);
    g.rect(x - 2, 2, 4, 2, c);
    g.set(x - 2, 6, blend(c, C.white, 0.375));
    if (rnd() < 0.5) g.rect(x - 3, 2, 6, 1, C.red);
  }
  return outlined(g);
}

function lantern(): Grid {
  const g = new Grid(11, 34);
  g.rect(4, 8, 2, 26, C.darkBrown);
  g.rect(1, 3, 2, 1, C.darkBrown);
  g.rect(1, 3, 8, 1, C.darkBrown);
  g.ellipse(5, 7, 4, 4, C.red);
  g.rect(2, 7, 7, 1, C.gold);
  g.rect(4, 11, 2, 2, C.gold);
  g.set(3, 6, C.orange);
  return outlined(g);
}

function stall(rnd: () => number): Grid {
  const g = new Grid(34, 30);
  const cloth = [C.red, C.blue, C.green, C.gold][Math.floor(rnd() * 4)];
  g.rect(3, 9, 2, 20, C.brown);
  g.rect(29, 9, 2, 20, C.brown);
  // 遮阳布：一道道条纹，下沿波浪
  g.rect(1, 3, 32, 6, cloth);
  for (let x = 1; x < 33; x += 4) g.rect(x, 3, 2, 6, C.lightPaper);
  for (let x = 1; x < 33; x += 4) g.ellipse(x + 2, 9, 2, 1.5, cloth);
  // 摊台和货
  g.rect(2, 19, 30, 4, C.lightBrown);
  g.rect(2, 19, 30, 1, C.tan);
  g.rect(4, 23, 26, 6, C.brown);
  for (let x = 5; x < 29; x += 5) g.ellipse(x + 1, 17, 2, 2, [C.orange, C.lime, C.red, C.yellow][(x / 5) % 4]);
  return outlined(g);
}

function banner(rnd: () => number): Grid {
  const g = new Grid(16, 44);
  const c = [C.red, C.gold, C.blue, C.green][Math.floor(rnd() * 4)];
  g.rect(2, 2, 2, 42, C.darkBrown);
  g.rect(1, 1, 4, 1, C.gold);
  g.poly([[4, 4], [15, 4], [15, 24], [10, 21], [4, 24]], c);
  g.rect(4, 4, 11, 1, blend(c, C.white, 0.375));
  g.rect(7, 9, 5, 7, blend(c, C.ink, 0.375));
  g.rect(8, 10, 3, 5, blend(c, C.white, 0.5));
  return outlined(g);
}

function tent(): Grid {
  const g = new Grid(34, 26);
  g.poly([[1, 25], [17, 2], [33, 25]], C.sand);
  g.poly([[17, 2], [33, 25], [22, 25]], C.tan);
  g.poly([[13, 25], [17, 12], [21, 25]], C.darkBrown);
  g.line(17, 0, 17, 3, C.brown);
  g.rect(17, 0, 4, 2, C.red);
  return outlined(g);
}

function fire(): Grid {
  const g = new Grid(22, 16);
  // 柴堆 + 一圈石头（火苗另外用动画画）
  g.line(3, 14, 18, 10, C.brown);
  g.line(4, 10, 19, 14, C.darkBrown);
  for (let x = 1; x < 22; x += 4) g.ellipse(x, 14, 2, 1.5, C.gray);
  g.ellipse(11, 10, 3, 2, C.orange);
  return outlined(g);
}

function rack(): Grid {
  const g = new Grid(24, 30);
  g.rect(2, 8, 2, 22, C.brown);
  g.rect(20, 8, 2, 22, C.brown);
  g.rect(1, 10, 22, 2, C.darkBrown);
  g.rect(1, 22, 22, 2, C.darkBrown);
  for (const x of [6, 11, 16]) {
    g.rect(x, 1, 1, 27, C.lightBrown);
    g.poly([[x - 1, 4], [x + 2, 4], [x + 0.5, 0]], C.lightGray);
  }
  return outlined(g);
}

function tree(rnd: () => number, kind: 'tree' | 'blossom'): Grid {
  const g = new Grid(36, 46);
  const leaf = kind === 'blossom' ? C.pink : rnd() < 0.5 ? C.green : C.grass;
  const leafD = kind === 'blossom' ? blend(C.pink, C.darkRed, 0.375) : C.darkGreen;
  const leafL = kind === 'blossom' ? blend(C.pink, C.white, 0.5) : C.lime;
  g.rect(16, 24, 4, 22, C.brown);
  g.line(18, 30, 10, 22, C.brown);
  g.line(18, 28, 26, 21, C.brown);
  for (const [cx, cy, r] of [[18, 14, 11], [9, 20, 8], [27, 19, 8], [14, 8, 7], [23, 9, 7]] as [number, number, number][]) g.ellipse(cx, cy, r, r * 0.85, leaf);
  for (let k = 0; k < 18; k++) {
    const x = 4 + rnd() * 28;
    const y = 6 + rnd() * 20;
    g.ellipse(x, y, 1.6, 1.3, rnd() < 0.5 ? leafD : leafL, (xx, yy) => g.get(xx, yy) !== 0);
  }
  g.ellipse(22, 24, 8, 3, leafD, (x, y) => g.get(x, y) === leaf);
  return outlined(g);
}

function pine(rnd: () => number): Grid {
  const h = 40 + Math.floor(rnd() * 10);
  const g = new Grid(26, h);
  g.rect(12, h - 9, 3, 9, C.brown);
  for (let k = 0; k < 4; k++) {
    const top = 2 + k * ((h - 14) / 4);
    const half = 4 + k * 2.6;
    g.poly([[13 - half, top + 10], [13 + half, top + 10], [13, top]], k % 2 ? C.darkGreen : C.green);
    g.line(13, top + 1, 13 + half - 1, top + 10, C.darkGreen);
  }
  return outlined(g);
}

function willow(rnd: () => number): Grid {
  const g = new Grid(38, 48);
  g.rect(17, 18, 4, 30, C.brown);
  g.ellipse(19, 12, 16, 10, C.grass);
  // 垂下来的柳条
  for (let x = 4; x < 35; x += 2) {
    const len = 18 + Math.floor(rnd() * 16);
    g.line(x, 12, x + (x < 19 ? -1 : 1), 12 + len, x % 4 ? C.grass : C.green);
  }
  return outlined(g);
}

function bush(rnd: () => number, flowers: boolean): Grid {
  const g = new Grid(26, 16);
  for (const [cx, cy, r] of [[7, 10, 6], [14, 8, 7], [20, 10, 5]] as [number, number, number][]) g.ellipse(cx, cy, r, r * 0.8, C.green);
  for (let k = 0; k < 10; k++) g.set(3 + rnd() * 20, 4 + rnd() * 9, rnd() < 0.5 ? C.lime : C.darkGreen);
  if (flowers) for (let k = 0; k < 8; k++) {
    const x = 3 + rnd() * 20;
    const y = 3 + rnd() * 9;
    g.set(x, y, [C.yellow, C.pink, C.white, C.red][k % 4]);
    g.set(x + 1, y, C.yellow);
  }
  return outlined(g);
}

function rock(rnd: () => number): Grid {
  const g = new Grid(24, 16);
  g.ellipse(12, 10, 10, 6, C.gray);
  g.ellipse(9, 8, 6, 4, C.lightGray);
  if (rnd() < 0.6) g.ellipse(20, 12, 4, 3, C.darkGray);
  g.rect(4, 14, 16, 1, C.darkGray);
  return outlined(g);
}

function reeds(rnd: () => number): Grid {
  const g = new Grid(18, 24);
  for (let k = 0; k < 7; k++) {
    const x = 2 + k * 2 + Math.floor(rnd() * 2);
    const top = 2 + Math.floor(rnd() * 8);
    g.line(x, 23, x + (k % 2 ? 1 : -1), top, k % 2 ? C.grass : C.green);
    if (k % 2 === 0) g.rect(x - 1, top - 1, 2, 4, C.brown);
  }
  return outlined(g);
}

function boat(): Grid {
  const g = new Grid(40, 16);
  g.poly([[1, 6], [39, 6], [33, 14], [7, 14]], C.brown);
  g.rect(3, 6, 34, 2, C.lightBrown);
  g.poly([[14, 5], [26, 5], [25, 0], [15, 0]], C.tan);
  g.line(30, 6, 38, 0, C.darkBrown);
  return outlined(g);
}

function stalagmite(rnd: () => number): Grid {
  const h = 18 + Math.floor(rnd() * 14);
  const g = new Grid(14, h);
  g.poly([[1, h - 1], [13, h - 1], [8, 0], [6, 0]], C.gray);
  g.poly([[6, 0], [8, 0], [9, h - 1], [5, h - 1]], C.lightGray);
  return outlined(g);
}

function crystal(): Grid {
  const g = new Grid(14, 18);
  g.poly([[3, 17], [6, 3], [9, 17]], C.lilac);
  g.poly([[7, 17], [10, 6], [13, 17]], C.purple);
  g.poly([[0, 17], [2, 10], [5, 17]], C.sky);
  g.line(5, 6, 5, 15, C.white);
  return outlined(g);
}

function torch(): Grid {
  const g = new Grid(9, 28);
  g.rect(3, 6, 3, 22, C.brown);
  g.rect(2, 5, 5, 2, C.darkGray);
  g.ellipse(4.5, 3, 3, 3, C.orange);
  g.ellipse(4.5, 3, 1.5, 2, C.yellow);
  return outlined(g);
}

function grave(rnd: () => number): Grid {
  const g = new Grid(16, 20);
  g.ellipse(8, 7, 6, 6, C.gray, (_x, y) => y < 8);
  g.rect(2, 7, 12, 12, C.gray);
  g.rect(4, 5, 8, 1, C.lightGray);
  g.rect(7, 8, 2, 7, C.darkGray);
  g.rect(5, 10, 6, 1, C.darkGray);
  if (rnd() < 0.5) g.line(12, 4, 9, 12, C.darkGray);
  return outlined(g);
}

function pillar(rnd: () => number): Grid {
  const h = 22 + Math.floor(rnd() * 14);
  const g = new Grid(14, h);
  g.rect(3, 3, 8, h - 3, C.lightGray);
  g.rect(8, 3, 3, h - 3, C.gray);
  g.rect(1, h - 3, 12, 3, C.gray);
  g.poly([[3, 3], [11, 3], [9, 0], [6, 2], [4, 0]], C.lightGray);
  return outlined(g);
}

function stakes(): Grid {
  const g = new Grid(32, 18);
  for (let x = 1; x < 32; x += 5) {
    g.rect(x, 4, 3, 14, C.lightBrown);
    g.poly([[x, 4], [x + 3, 4], [x + 1.5, 0]], C.tan);
  }
  g.rect(0, 9, 32, 2, C.brown);
  return outlined(g);
}

function sign(): Grid {
  const g = new Grid(20, 26);
  g.rect(9, 6, 2, 20, C.brown);
  g.poly([[1, 4], [16, 4], [19, 7], [16, 10], [1, 10]], C.lightBrown);
  g.rect(3, 6, 10, 1, C.darkBrown);
  g.rect(3, 8, 7, 1, C.darkBrown);
  g.poly([[3, 13], [17, 13], [17, 18], [3, 18], [1, 15]], C.tan);
  g.rect(6, 15, 9, 1, C.darkBrown);
  return outlined(g);
}

function bambooClump(rnd: () => number): Grid {
  const g = new Grid(22, 50);
  for (let k = 0; k < 4; k++) {
    const x = 3 + k * 5;
    const top = Math.floor(rnd() * 10);
    g.rect(x, top, 2, 50 - top, k % 2 ? C.grass : C.green);
    for (let y = top + 6; y < 50; y += 8) g.rect(x - 1, y, 4, 1, C.darkGreen);
    g.line(x + 1, top + 4, x + 6, top + 1, C.grass);
  }
  return outlined(g);
}

function deadTree(): Grid {
  const g = new Grid(28, 40);
  g.rect(12, 14, 4, 26, C.darkBrown);
  g.line(14, 18, 4, 6, C.darkBrown);
  g.line(14, 16, 24, 4, C.darkBrown);
  g.line(8, 11, 4, 12, C.darkBrown);
  g.line(20, 9, 26, 10, C.darkBrown);
  g.line(14, 14, 14, 2, C.darkBrown);
  return outlined(g);
}

function lion(): Grid {
  const g = new Grid(20, 24);
  g.rect(2, 18, 16, 6, C.gray);
  g.ellipse(10, 12, 7, 7, C.lightGray);
  g.ellipse(10, 6, 6, 5, C.lightGray);
  for (let k = 0; k < 6; k++) g.set(5 + k * 2, 3 + (k % 2), C.gray);
  g.set(8, 6, C.ink);
  g.set(12, 6, C.ink);
  g.rect(8, 9, 4, 1, C.darkGray);
  g.ellipse(14, 16, 3, 3, C.gray);
  return outlined(g);
}

function tufts(rnd: () => number): Grid {
  const g = new Grid(14, 8);
  for (let k = 0; k < 5; k++) {
    const x = 1 + k * 3;
    g.line(x, 7, x + (k % 2 ? 1 : -1), 2 + Math.floor(rnd() * 3), k % 2 ? C.grass : C.green);
  }
  return g;
}

export function drawProp(kind: PropKind, seed: number): Grid {
  const rnd = seeded(seed);
  switch (kind) {
    case 'house': return house(rnd, false);
    case 'hut': return house(rnd, true);
    case 'fence': return fence();
    case 'well': return well();
    case 'hay': return hay();
    case 'cart': return cart();
    case 'jar': return jar(rnd);
    case 'lantern': return lantern();
    case 'stall': return stall(rnd);
    case 'banner': return banner(rnd);
    case 'tent': return tent();
    case 'fire': return fire();
    case 'rack': return rack();
    case 'tree': return tree(rnd, 'tree');
    case 'blossom': return tree(rnd, 'blossom');
    case 'pine': return pine(rnd);
    case 'willow': return willow(rnd);
    case 'bush': return bush(rnd, false);
    case 'flowers': return bush(rnd, true);
    case 'rock': return rock(rnd);
    case 'reeds': return reeds(rnd);
    case 'boat': return boat();
    case 'stalagmite': return stalagmite(rnd);
    case 'crystal': return crystal();
    case 'torch': return torch();
    case 'grave': return grave(rnd);
    case 'pillar': return pillar(rnd);
    case 'stakes': return stakes();
    case 'sign': return sign();
    case 'bamboo': return bambooClump(rnd);
    case 'deadtree': return deadTree();
    case 'lion': return lion();
    case 'tufts': return tufts(rnd);
  }
}

// 每种地点：必摆的地标 + 随机撒的小物件（权重）+ 撒多少个
interface Theme {
  fixed: PropKind[];
  scatter: [PropKind, number][];
  n: number;
}

const THEMES: Record<string, Theme> = {
  village: { fixed: ['house', 'hut', 'well', 'blossom', 'fence', 'hay'], scatter: [['bush', 3], ['flowers', 3], ['tufts', 4], ['jar', 1], ['tree', 2], ['cart', 1]], n: 14 },
  manor: { fixed: ['house', 'house', 'lantern', 'lantern', 'willow', 'lion'], scatter: [['flowers', 3], ['bush', 2], ['jar', 1], ['tufts', 2], ['rock', 1]], n: 12 },
  city: { fixed: ['stall', 'stall', 'lantern', 'lantern', 'banner', 'lion', 'cart'], scatter: [['jar', 3], ['tree', 1], ['bush', 1], ['sign', 1]], n: 11 },
  gate: { fixed: ['banner', 'banner', 'lion', 'rack', 'lantern'], scatter: [['jar', 2], ['rock', 2], ['bush', 1], ['tufts', 2]], n: 11 },
  camp: { fixed: ['tent', 'tent', 'fire', 'rack', 'banner', 'stakes'], scatter: [['jar', 2], ['rock', 2], ['tufts', 2], ['torch', 2]], n: 12 },
  forest: { fixed: ['pine', 'pine', 'pine', 'tree'], scatter: [['pine', 4], ['bush', 3], ['rock', 2], ['tufts', 3], ['flowers', 1]], n: 16 },
  bamboo: { fixed: ['bamboo', 'bamboo', 'bamboo'], scatter: [['bamboo', 4], ['rock', 2], ['tufts', 3], ['bush', 1]], n: 15 },
  hill: { fixed: ['rock', 'deadtree', 'sign'], scatter: [['rock', 5], ['bush', 2], ['tufts', 3], ['pine', 1]], n: 15 },
  grass: { fixed: ['tree', 'sign'], scatter: [['flowers', 3], ['bush', 3], ['tufts', 5], ['rock', 1], ['tree', 1]], n: 16 },
  road: { fixed: ['sign', 'cart', 'tree'], scatter: [['rock', 2], ['bush', 2], ['tufts', 4], ['flowers', 1]], n: 14 },
  farm: { fixed: ['hut', 'hay', 'hay', 'fence', 'fence'], scatter: [['tufts', 4], ['bush', 2], ['jar', 1], ['flowers', 2]], n: 13 },
  river: { fixed: ['willow', 'boat', 'reeds', 'reeds'], scatter: [['reeds', 3], ['rock', 2], ['tufts', 3], ['flowers', 1]], n: 14 },
  valley: { fixed: ['pine', 'rock', 'willow'], scatter: [['rock', 3], ['bush', 2], ['tufts', 3], ['pine', 2], ['flowers', 1]], n: 15 },
  pass: { fixed: ['banner', 'stakes', 'rock', 'torch'], scatter: [['rock', 4], ['tufts', 2], ['deadtree', 1]], n: 13 },
  cave: { fixed: ['torch', 'torch', 'crystal', 'stalagmite'], scatter: [['stalagmite', 4], ['rock', 3], ['crystal', 2]], n: 15 },
  tomb: { fixed: ['grave', 'grave', 'grave', 'deadtree', 'lantern'], scatter: [['grave', 3], ['rock', 2], ['tufts', 2], ['deadtree', 1]], n: 14 },
  ruins: { fixed: ['pillar', 'pillar', 'deadtree'], scatter: [['pillar', 2], ['rock', 4], ['tufts', 3], ['bush', 1]], n: 14 },
  marsh: { fixed: ['reeds', 'reeds', 'deadtree', 'willow'], scatter: [['reeds', 5], ['tufts', 3], ['rock', 1]], n: 15 },
  altar: { fixed: ['torch', 'torch', 'banner', 'pillar', 'pillar'], scatter: [['rock', 2], ['crystal', 1], ['tufts', 2]], n: 12 },
};

export interface PropSpot {
  kind: PropKind;
  x: number;
  y: number;
  seed: number;
}

// 在地面上撒摆设：避开人物站位（keep）和中间那条路；越大的东西越往后（远处）放
export function layoutProps(art: string, key: string, w: number, top: number, bottom: number, keep: [number, number][]): PropSpot[] {
  const th = THEMES[art] ?? THEMES.grass;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = seeded(h);
  const out: PropSpot[] = [];
  const pick = (): PropKind => {
    const tot = th.scatter.reduce((a, [, wt]) => a + wt, 0);
    let r = rnd() * tot;
    for (const [k, wt] of th.scatter) if ((r -= wt) < 0) return k;
    return th.scatter[0][0];
  };
  const big = new Set<PropKind>(['house', 'hut', 'tent', 'stall', 'willow', 'tree', 'blossom', 'pine', 'bamboo', 'deadtree', 'banner', 'boat']);
  const kinds: PropKind[] = [...th.fixed];
  for (let i = 0; i < th.n; i++) kinds.push(pick());
  for (const kind of kinds) {
    for (let tries = 0; tries < 24; tries++) {
      const isBig = big.has(kind);
      // 大件放在后半（靠近地平线）或者两边，小件随便
      // 大件多放后排；也有少数放到前排两边，压住画面下半截
      const front = isBig && rnd() < 0.3;
      const v = isBig ? (front ? 0.75 + rnd() * 0.25 : rnd() * 0.55) : rnd();
      const y = Math.round(top + v * (bottom - top));
      const side = rnd() < 0.5;
      const x = Math.round(isBig ? (side ? 8 + rnd() * (w * 0.3) : w * 0.7 + rnd() * (w * 0.3 - 8)) : 6 + rnd() * (w - 12));
      const nearPath = Math.abs(x - w * 0.5) < (isBig ? 40 : 18);
      const nearActor = keep.some(([kx, ky]) => Math.abs(kx - x) < (isBig ? 34 : 22) && Math.abs(ky - y) < (isBig ? 40 : 22));
      const nearProp = out.some((p) => Math.abs(p.x - x) < (isBig || big.has(p.kind) ? 30 : 14) && Math.abs(p.y - y) < (isBig || big.has(p.kind) ? 16 : 8));
      if (nearPath || nearActor || nearProp) continue;
      out.push({ kind, x, y, seed: Math.floor(rnd() * 1e6) });
      break;
    }
  }
  return out;
}
