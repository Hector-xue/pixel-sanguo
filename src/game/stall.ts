// 摆摊（许昌跳蚤市场）：起个摊名，把东西标好价摆上去，你每打一仗来一轮 NPC 买家。
// 价钱低于行情好卖，高了就慢；收摊或者随时来收钱。市场收一点摊位费。
import { items, systems } from '../data';
import { Rng } from '../core/rng';
import type { Save } from './state';
import { addItem, bagCount, bump, log, removeItem } from './state';
import { calTick } from './calendar';

const ST = systems.stall;

// 行情价：药、矿石、宝石按卖价，宝箱、令牌这类按表里给的价
export function fairPrice(id: string): number {
  return ST.fairOf[id] ?? Math.max(10, items[id]?.price ?? 0);
}

export function canSell(id: string): boolean {
  const d = items[id];
  return !!d && !d.quest && fairPrice(id) > 0;
}

export function setStallName(s: Save, name: string): string {
  const n = name.trim().slice(0, 8);
  if (!n) return '摊名不能空着';
  s.p3.stall.name = n;
  return `摊位改名叫「${n}」`;
}

export function putOnStall(s: Save, id: string, n: number, price: number, t = calTick(s)): string {
  settleStall(s, t);
  if (!canSell(id)) return '这个不能摆摊卖';
  const g = s.p3.stall.goods;
  if (!g.some((x) => x.item === id) && g.length >= ST.slots) return `最多摆${ST.slots}样东西`;
  n = Math.min(n, bagCount(s, id));
  if (n <= 0 || price <= 0) return '';
  removeItem(s, id, n);
  const row = g.find((x) => x.item === id);
  if (row) {
    row.n += n;
    row.price = price;
  } else g.push({ item: id, price, n });
  return `摆上了${n}个${items[id].name}，每个${price}两`;
}

export function takeOffStall(s: Save, id: string, t = calTick(s)): string {
  settleStall(s, t);
  const g = s.p3.stall.goods;
  const row = g.find((x) => x.item === id);
  if (!row) return '';
  const left = addItem(s, id, row.n);
  if (left) {
    row.n = left;
    return '负重不够，没收完';
  }
  s.p3.stall.goods = g.filter((x) => x !== row);
  return `收回了${items[id].name}`;
}

// 结算：上次结算以后打了几仗就来几轮买家（最多攒 maxRounds 轮），每样东西卖出的概率看价钱比行情高多少
export function settleStall(s: Save, t = calTick(s)): string[] {
  const st = s.p3.stall;
  if (!st.goods.length) {
    st.last = t;
    return [];
  }
  const rounds = Math.min(ST.maxRounds, t - st.last);
  if (rounds <= 0) return [];
  const rng = new Rng((s.seed ^ (t * 2654435761)) >>> 0);
  const sold: Record<string, number> = {};
  for (let r = 0; r < rounds; r++) {
    for (const row of st.goods) {
      if (row.n <= 0) continue;
      const ratio = row.price / fairPrice(row.item);
      const p = Math.max(0.03, Math.min(0.85, 1.25 - ratio * 0.75));
      if (rng.chance(p)) {
        row.n--;
        const got = Math.floor(row.price * (1 - ST.fee));
        st.income += got;
        st.sold++;
        sold[row.item] = (sold[row.item] ?? 0) + 1;
        bump(s, 'stallSold');
      }
    }
  }
  st.goods = st.goods.filter((x) => x.n > 0);
  st.last = t;
  const lines = Object.entries(sold).map(([id, n]) => `卖出${items[id].name}×${n}`);
  if (lines.length) log(s, `摊位「${st.name || '无名小摊'}」${lines.join('、')}`);
  return lines;
}

export function collectStall(s: Save, t = calTick(s)): string {
  settleStall(s, t);
  const n = s.p3.stall.income;
  if (!n) return '还没有进账';
  s.player.silver += n;
  s.p3.stall.income = 0;
  return `收了${n}两货款`;
}
