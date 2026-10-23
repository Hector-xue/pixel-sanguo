// 挖宝：在宝洞用铲子挖，一把挖 10 铲；第 3、6、9 铲会惊动护宝守卫，打赢必得经验和宝箱
import { items, systems } from '../data';
import { createBattle } from '../core/battle';
import type { Battle } from '../core/battle';
import { Rng } from '../core/rng';
import { generalUnit, monsterUnit, playerUnit } from './encounter';
import type { BUnit } from '../core/battle';
import type { Save } from './state';
import { addItem, bagCap, bagUsed, bump, log, removeItem, rollRng, deployedUids } from './state';
import { grantReward, rollLoot } from './welfare';

const D = systems.dig;

export function buyShovel(s: Save): string {
  const price = items.chanzi.price;
  if (s.player.silver < price) return `铲子要${price}两`;
  if (bagUsed(s) >= bagCap(s)) return '负重已满';
  s.player.silver -= price;
  addItem(s, 'chanzi', 1);
  return `买了一把铲子，花费${price}两`;
}

export function startDig(s: Save): string {
  if (s.location !== 'baodong') return '要在宝洞里才能挖';
  if (s.dig) return `这把铲子还能挖${s.dig.left}铲`;
  if (!removeItem(s, 'chanzi', 1)) return '没有铲子';
  s.dig = { left: D.digs, n: 0 };
  bump(s, 'shovels');
  return `拿起铲子，能挖${D.digs}铲`;
}

export type DigResult = { kind: 'loot'; text: string } | { kind: 'guard' } | { kind: 'none'; text: string };

// 下一铲是不是会惊动守卫
export function nextIsGuard(s: Save): boolean {
  return !!s.dig && D.guardAt.includes(s.dig.n + 1);
}

export function digOnce(s: Save): DigResult {
  if (!s.dig) return { kind: 'none', text: '先拿起铲子' };
  if (nextIsGuard(s)) return { kind: 'guard' };
  s.dig.n++;
  s.dig.left--;
  bump(s, 'digs');
  const r = rollLoot(s, D.loot, rollRng(s));
  const lines = r ? grantReward(s, r) : ['什么也没挖到'];
  const text = `第${s.dig.n}铲：${lines.join('，')}`;
  endIfDone(s, text);
  return { kind: 'loot', text: s.dig ? text : `${text}\n铲子挖坏了` };
}

function endIfDone(s: Save, text: string): void {
  log(s, text);
  if (s.dig && s.dig.left <= 0) s.dig = null;
}

export function guardBattle(s: Save, seed: number): Battle {
  const rng = new Rng(seed);
  const n = rng.int(D.guardCount[0], D.guardCount[1]);
  const lv = s.player.level;
  const enemies: BUnit[] = Array.from({ length: n }, (_, i) => monsterUnit(`e${i}`, 'hubaoshouwei', lv, i < 3 ? 0 : 1));
  const allies = [playerUnit(s)];
  const reserve: BUnit[] = [];
  const dep = deployedUids(s);
  for (const g of s.generals) {
    const u = generalUnit(g, s);
    if (dep.includes(g.uid) && u.alive) allies.push(u);
    else reserve.push(u);
  }
  return createBattle({ seed: (rng.next() * 4294967296) >>> 0, allies, reserve, enemies, items: { ...s.bag }, title: '护宝守卫', canFlee: false, tag: 'dig' });
}

// 守卫战打完：赢了这一铲算数，再给一个宝箱；输了铲子就丢了
export function afterGuard(s: Save, won: boolean): string[] {
  if (!s.dig) return [];
  if (!won) {
    s.dig = null;
    return ['没打过护宝守卫，铲子丢在洞里了'];
  }
  s.dig.n++;
  s.dig.left--;
  bump(s, 'digs');
  const lines = ['打退了护宝守卫！', ...grantReward(s, { items: { baoxiang: 1 } })];
  if (s.dig.left <= 0) {
    s.dig = null;
    lines.push('铲子挖坏了');
  }
  for (const l of lines) log(s, l);
  return lines;
}
