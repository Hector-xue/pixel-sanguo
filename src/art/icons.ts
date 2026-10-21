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
    default:
      return pouch(C.tan, C.brown);
  }
}
