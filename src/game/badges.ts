// 徽章：每个地方的地上都藏着一枚印（偶尔反一下光），点到就收下，给点盘缠；
// 收满 10 / 25 / 45 / 全部 各有一份大礼。舆图上去过的地方会标出这里的印找没找到
import { items, locations } from '../data';
import { grantReward } from './welfare';
import type { Reward } from '../data';
import type { Save } from './state';
import { addItem, log, rollRng } from './state';

function hash(str: string): number {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

// 藏在舞台地面上的哪里：u 横向 0～1、v 纵向（地平线以下）0～1；同一个地方永远在同一处
export function badgeSpot(locId: string): { u: number; v: number } {
  const h = hash(`badge:${locId}`);
  const u = 0.08 + ((h & 0xffff) / 0xffff) * 0.84;
  const v = 0.15 + (((h >>> 16) & 0xffff) / 0xffff) * 0.8;
  return { u, v };
}

export function badgeTotal(): number {
  return Object.keys(locations).length;
}

export function badgeCount(s: Save): number {
  return Object.keys(s.p5.badges).filter((k) => locations[k]).length;
}

export function hasBadge(s: Save, locId: string): boolean {
  return !!s.p5.badges[locId];
}

export const BADGE_GOALS: { n: number; reward: Reward; name: string }[] = [
  { n: 10, name: '游历四方', reward: { items: { jiangjunling: 1, baoxiang: 2 } } },
  { n: 25, name: '足迹遍野', reward: { gold: 30, items: { gaojibaoxiang: 1 } } },
  { n: 45, name: '踏遍州郡', reward: { gold: 60, items: { dajiangjunling: 1 } } },
  { n: Object.keys(locations).length, name: '天下行者', reward: { gold: 150, items: { dajiangjunling: 2, gaojibaoxiang: 2 } } },
];

function locLevel(locId: string): number {
  const gs = locations[locId].groups;
  return gs.length ? Math.min(...gs.map((g) => g.level[0])) : 1;
}

export function findBadge(s: Save, locId: string): string[] {
  if (hasBadge(s, locId) || !locations[locId]) return [];
  s.p5.badges[locId] = 1;
  const rng = rollRng(s);
  const lv = Math.max(s.player.level, locLevel(locId));
  const silver = rng.int(lv * 20, lv * 40) + 100;
  s.player.silver += silver;
  const n = badgeCount(s);
  const lines = [`在地上摸到一枚「${locations[locId].name}印」！（徽章 ${n}/${badgeTotal()}）`, `印下压着一包盘缠，银两+${silver}`];
  if (rng.chance(0.3)) {
    const lost = addItem(s, 'baoxiang', 1);
    if (!lost) lines.push(`还有一只${items.baoxiang.name}`);
  }
  const goal = BADGE_GOALS.find((g) => g.n === n);
  if (goal) lines.push(`集齐${goal.n}枚 ·「${goal.name}」：${grantReward(s, goal.reward).join('，')}`);
  log(s, `找到「${locations[locId].name}印」（徽章 ${n}/${badgeTotal()}）`);
  return lines;
}
