// 12×12 物品图标
import { Grid } from './pixel';
import { C } from './palette';

function bottle(body: number, light: number, big: boolean): Grid {
  const g = new Grid(12, 12);
  g.rect(5, 1, 2, 1, C.brown);
  g.rect(5, 2, 2, 2, C.white);
  const r = big ? 4 : 3;
  g.ellipse(6, 7.5, r, big ? 3.8 : 3.2, body);
  g.set(4, 6, light);
  g.set(4, 7, light);
  g.outline(C.ink);
  return g;
}

function pouch(col: number, tie: number): Grid {
  const g = new Grid(12, 12);
  g.ellipse(6, 7.5, 4, 3.5, col);
  g.rect(4, 3, 4, 2, col);
  g.rect(4, 4, 4, 1, tie);
  g.outline(C.ink);
  return g;
}

export function drawItemIcon(id: string): Grid {
  switch (id) {
    case 'dieda':
      return bottle(C.orange, C.yellow, false);
    case 'zhixue':
      return bottle(C.red, C.pink, false);
    case 'jinchuang':
      return bottle(C.gold, C.yellow, true);
    case 'huichun':
      return bottle(C.darkRed, C.red, true);
    case 'huami':
      return bottle(C.lightBlue, C.white, false);
    case 'qingquan':
      return bottle(C.blue, C.sky, true);
    case 'yaocai':
      return pouch(C.grass, C.red);
    case 'zhusun': {
      const g = new Grid(12, 12);
      g.poly([[3, 11], [9, 11], [6, 1]], C.lime);
      g.line(4, 8, 8, 8, C.green);
      g.line(5, 5, 7, 5, C.green);
      g.outline(C.ink);
      return g;
    }
    case 'tiekuang': {
      const g = new Grid(12, 12);
      g.poly([[2, 9], [4, 3], [8, 2], [10, 7], [7, 10]], C.gray);
      g.set(5, 4, C.lightGray);
      g.set(7, 6, C.darkGray);
      g.outline(C.ink);
      return g;
    }
    case 'dahuan': {
      const g = new Grid(12, 12);
      g.ellipse(6, 6.5, 4, 4, C.gold);
      g.ellipse(5, 5.5, 1.5, 1.5, C.yellow);
      g.outline(C.ink);
      return g;
    }
    case 'yulu':
      return bottle(C.sky, C.white, true);
    case 'zhangben':
    case 'xinfa1':
    case 'xinfa2':
    case 'xinfa3':
    case 'jinengshu':
      return book(id === 'zhangben' ? C.brown : id === 'xinfa1' ? C.green : id === 'xinfa2' ? C.blue : id === 'xinfa3' ? C.purple : C.red);
    case 'jingtie':
    case 'jinggang':
    case 'xuantie':
      return ore(id === 'jingtie' ? C.lightGray : id === 'jinggang' ? C.sky : C.darkGray, id === 'xuantie' ? C.purple : C.white);
    case 'zhenkuang':
      return ore(C.brown, C.pink);
    case 'jiangjunling':
    case 'dajiangjunling':
    case 'xiaoqiaoling':
    case 'zhaoyunling':
      return token(id === 'jiangjunling' ? C.gold : id === 'dajiangjunling' ? C.red : id === 'xiaoqiaoling' ? C.pink : C.white);
    case 'baoxiang':
    case 'gaojibaoxiang':
      return chest(id === 'baoxiang' ? C.brown : C.darkRed, id === 'baoxiang' ? C.gold : C.yellow);
    case 'tilidan': {
      const g = new Grid(12, 12);
      g.ellipse(6, 6.5, 3.5, 3.5, C.red);
      g.set(5, 5, C.pink);
      g.outline(C.ink);
      return g;
    }
    case 'chanzi': {
      const g = new Grid(12, 12);
      g.line(9, 1, 5, 7, C.brown);
      g.line(10, 1, 6, 7, C.lightBrown);
      g.poly([[2, 7], [7, 7], [6, 11], [2, 11]], C.lightGray);
      g.outline(C.ink);
      return g;
    }
    default: {
      const gem = /^gem_(\w+)_(\d)$/.exec(id);
      if (gem) return gemIcon(gem[1], Number(gem[2]));
      return pouch(C.tan, C.brown);
    }
  }
}

function book(col: number): Grid {
  const g = new Grid(12, 12);
  g.rect(2, 2, 8, 9, col);
  g.rect(3, 2, 1, 9, C.ink);
  g.rect(5, 4, 4, 1, C.paper);
  g.rect(5, 6, 3, 1, C.paper);
  g.rect(9, 3, 1, 7, C.paper);
  g.outline(C.ink);
  return g;
}

function ore(col: number, glint: number): Grid {
  const g = new Grid(12, 12);
  g.poly([[2, 9], [3, 4], [7, 2], [10, 6], [8, 10]], col);
  g.set(5, 4, glint);
  g.set(6, 5, glint);
  g.set(8, 7, C.ink);
  g.outline(C.ink);
  return g;
}

function token(col: number): Grid {
  const g = new Grid(12, 12);
  g.rect(3, 1, 6, 10, col);
  g.rect(5, 0, 2, 1, C.red);
  g.rect(4, 3, 4, 1, C.darkRed);
  g.rect(5, 4, 2, 4, C.darkRed);
  g.outline(C.ink);
  return g;
}

function chest(col: number, band: number): Grid {
  const g = new Grid(12, 12);
  g.rect(1, 4, 10, 7, col);
  g.ellipse(6, 4.5, 5, 2.5, col, (_x, y) => y < 5);
  g.rect(1, 6, 10, 1, band);
  g.rect(5, 5, 2, 3, band);
  g.outline(C.ink);
  return g;
}

const GEM_COLORS: Record<string, [number, number]> = { zuanshi: [C.white, C.sky], lvbaoshi: [C.lime, C.green], hongbaoshi: [C.red, C.darkRed], lanbaoshi: [C.lightBlue, C.blue] };

function gemIcon(kind: string, level: number): Grid {
  const [a, b] = GEM_COLORS[kind] ?? [C.white, C.gray];
  const g = new Grid(12, 12);
  g.poly([[2, 4], [4, 1], [8, 1], [10, 4], [6, 10]], b);
  g.poly([[3, 4], [4.5, 2], [7.5, 2], [9, 4], [6, 8]], a);
  g.set(5, 3, C.white);
  for (let i = 0; i < level; i++) g.set(1 + i * 2, 11, C.gold);
  g.outline(C.ink);
  return g;
}

// 装备图标：形状看部位，颜色看档次（布木→铁→精钢→玄铁→龙鳞）
const TIER_COLORS: [number, number][] = [[C.tan, C.lightBrown], [C.gray, C.darkGray], [C.lightGray, C.gray], [C.darkGray, C.ink], [C.gold, C.darkRed]];

export function drawGearIcon(slot: string, tier: number, cls?: string): Grid {
  const [a, b] = TIER_COLORS[tier - 1] ?? TIER_COLORS[0];
  const g = new Grid(12, 12);
  switch (slot) {
    case 'head':
      g.ellipse(6, 7, 4.5, 4, a, (_x, y) => y < 8);
      g.rect(1, 7, 10, 2, b);
      g.rect(5, 1, 2, 2, tier >= 3 ? C.red : b);
      break;
    case 'neck':
      g.ellipse(6, 5, 4, 4, b, (x, y) => (x - 6) ** 2 + (y - 5) ** 2 > 7);
      g.ellipse(6, 9, 2, 2, tier >= 4 ? C.red : a);
      break;
    case 'weapon':
      if (cls === 'scholar') {
        g.poly([[1, 9], [6, 1], [11, 9]], a);
        g.line(6, 2, 6, 10, b);
        g.line(3, 7, 9, 7, b);
      } else if (cls === 'mystic') {
        g.line(9, 1, 3, 10, C.brown);
        g.ellipse(9, 2.5, 2, 2, tier >= 4 ? C.purple : a);
      } else {
        g.line(10, 1, 3, 8, a);
        g.line(11, 1, 4, 8, b);
        g.line(2, 7, 5, 10, C.gold);
        g.line(2, 9, 1, 10, C.brown);
      }
      break;
    case 'wrist':
      g.rect(3, 2, 6, 8, a);
      g.rect(3, 4, 6, 1, b);
      g.rect(3, 7, 6, 1, b);
      break;
    case 'armor':
      g.poly([[2, 2], [10, 2], [11, 5], [9, 5], [9, 11], [3, 11], [3, 5], [1, 5]], a);
      g.rect(6, 3, 1, 8, b);
      g.rect(3, 7, 6, 1, b);
      break;
    default:
      g.rect(3, 2, 4, 7, a);
      g.rect(3, 8, 8, 3, a);
      g.rect(3, 6, 4, 1, b);
      g.rect(3, 10, 8, 1, b);
  }
  g.outline(C.ink);
  return g;
}

// 坐骑：24×20 侧身小马，朝左
export function drawMount(body: number, mane: number): Grid {
  const g = new Grid(24, 20);
  g.ellipse(13, 10, 7, 4, body);
  g.poly([[6, 9], [9, 7], [5, 2], [2, 3]], body);
  g.ellipse(3.5, 3.5, 2.5, 2, body);
  g.rect(4, 1, 4, 2, mane);
  g.line(6, 3, 9, 7, mane);
  g.rect(20, 8, 2, 6, mane);
  for (const x of [8, 11, 15, 18]) g.rect(x, 13, 2, 6, body);
  for (const x of [8, 11, 15, 18]) g.rect(x, 18, 2, 1, C.ink);
  g.set(2, 3, C.ink);
  g.rect(10, 7, 6, 2, C.darkRed);
  g.shadeRight({ [body]: mane }, 1);
  g.outline(C.ink);
  return g;
}
