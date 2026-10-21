// 跑环：跑环使者用对话派任务，一环 10 个，断了从头跑。进度记在「任务」里，做完回去找跑环使者交。
import { items, locations, monsters, systems } from '../data';
import { expToNext } from '../core/formulas';
import type { Rng } from '../core/rng';
import type { RingTask, RingType, Save } from './state';
import { bagCount, bump, grantPlayerExp, log, npcLocation, onFlag, removeItem, rollRng } from './state';
import { grantReward, oreFor, randomGem, spendStamina, staminaNow } from './welfare';
import { visited } from './town';

const R = systems.ring;

export function ringOpen(s: Save): boolean {
  return s.player.level >= R.minLevel;
}

// 一环/二环/三环：第 1–10、11–20、21–30 环
export function ringTier(index: number): number {
  return Math.max(1, Math.min(R.tiers.length, Math.ceil(index / R.rounds)));
}

export function tierName(index: number): string {
  return R.tiers[ringTier(index) - 1].name;
}

// 能接哪几档（等级够的）
export function openTiers(s: Save): number[] {
  return R.tiers.map((t, i) => (s.player.level >= t.minLevel ? i + 1 : 0)).filter(Boolean);
}

// 当前等级能打的怪：分布在去过的野外，等级区间和自己差不多
function huntable(s: Save, capture: boolean): { monster: string; at: string }[] {
  const lv = s.player.level;
  const out: { monster: string; at: string }[] = [];
  for (const [id, loc] of Object.entries(locations)) {
    if (!visited(s, id)) continue;
    for (const g of loc.groups) {
      const m = monsters[g.monster];
      if (m.boss || g.label) continue;
      if (capture && m.capturable === false) continue;
      if (g.level[1] < lv - 8 || g.level[0] > lv + 1) continue;
      out.push({ monster: g.monster, at: id });
    }
  }
  return out;
}

function pickType(rng: Rng, s: Save): RingType {
  const w = { ...R.types } as Record<RingType, number>;
  if (!huntable(s, false).length) w.kill = 0;
  if (!huntable(s, true).length) w.capture = 0;
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let x = rng.next() * total;
  for (const [k, v] of Object.entries(w) as [RingType, number][]) if ((x -= v) < 0) return k;
  return 'goto';
}

export function makeTask(s: Save, rng: Rng): RingTask {
  const type = pickType(rng, s);
  switch (type) {
    case 'kill': {
      const t = rng.pick(huntable(s, false));
      const extra = (ringTier(s.ring.index || 1) - 1) * R.killPerTier;
      return { type, monster: t.monster, at: t.at, count: rng.int(R.killCount[0], R.killCount[1]) + extra, have: 0 };
    }
    case 'capture': {
      const t = rng.pick(huntable(s, true));
      return { type, monster: t.monster, at: t.at, count: 1, have: 0 };
    }
    case 'buy':
      return { type, item: rng.pick(R.buyDrugs), count: rng.int(R.buyCount[0], R.buyCount[1]), have: 0 };
    case 'deliver': {
      const pool = R.deliverItems.filter((id) => items[id].cat !== 'ore' || id === oreFor(s.player.level, 1) || id === 'tiekuang');
      const item = rng.pick(pool);
      return { type, item, count: items[item].cat === 'ore' ? 2 : 1, have: 0 };
    }
    default: {
      const places = Object.keys(locations).filter((id) => id !== s.location && id !== 'baodong' && visited(s, id) && !locations[id].town);
      return { type: 'goto', at: rng.pick(places.length ? places : ['xinshoucun']), count: 1, have: 0, arrived: false };
    }
  }
}

export function taskText(t: RingTask): string {
  switch (t.type) {
    case 'kill':
      return `去${locations[t.at!].name}打败${t.count}个${monsters[t.monster!].name}（${Math.min(t.have, t.count)}/${t.count}）`;
    case 'capture':
      return `去${locations[t.at!].name}招降1个${monsters[t.monster!].name}（${Math.min(t.have, t.count)}/1）`;
    case 'buy':
      return `买${t.count}个${items[t.item!].name}交给跑环使者`;
    case 'deliver':
      return `找${t.count}个${items[t.item!].name}交给跑环使者`;
    default:
      return `去${locations[t.at!].name}走一趟，替跑环使者送封信${t.arrived ? '（已送到）' : ''}`;
  }
}

export function taskDone(s: Save, t: RingTask): boolean {
  if (t.type === 'buy' || t.type === 'deliver') return bagCount(s, t.item!) >= t.count;
  if (t.type === 'goto') return !!t.arrived;
  return t.have >= t.count;
}

export function ringDestination(s: Save): string | null {
  const t = s.ring.task;
  if (!t) return null;
  if (taskDone(s, t) || !t.at) return npcLocation('paohuan');
  return t.at;
}

export function ringStatusText(s: Save): string {
  const t = s.ring.task;
  if (!s.ring.index || !t) return ringOpen(s) ? '没有在跑环。去许昌找跑环使者接。' : `${R.minLevel}级开放跑环。`;
  return `${tierName(s.ring.index)}第${s.ring.index}环：${taskText(t)}${taskDone(s, t) ? '。已完成，回去找跑环使者' : ''}`;
}

// 接下一环（没在跑时从 tier 那一档的第一环开始）。每接一环扣体力
export function nextRing(s: Save, now = Date.now(), tier = 1): string {
  if (!ringOpen(s)) return `${R.minLevel}级以后再来`;
  if (s.ring.task) return '你手上还有没做完的环';
  const T = R.tiers[tier - 1];
  if (!s.ring.index && (!T || s.player.level < T.minLevel)) return `${T?.name ?? ''}要${T?.minLevel}级`;
  if (staminaNow(s, now) < R.stamina) return `体力不够（要${R.stamina}点，现在${s.stamina}点）。体力会慢慢恢复，也可以吃体力丹`;
  spendStamina(s, R.stamina, now);
  if (!s.ring.index) s.ring.index = T.from;
  s.ring.task = makeTask(s, rollRng(s));
  if (s.ring.task.type === 'goto' && s.ring.task.at === s.location) s.ring.task.arrived = true;
  return `${tierName(s.ring.index)}第${s.ring.index}环：${taskText(s.ring.task)}`;
}

export function turnInRing(s: Save): { ok: boolean; lines: string[] } {
  const t = s.ring.task;
  if (!t) return { ok: false, lines: ['你还没接跑环任务'] };
  if (!taskDone(s, t)) return { ok: false, lines: [`还没做完：${taskText(t)}`] };
  if (t.type === 'buy' || t.type === 'deliver') removeItem(s, t.item!, t.count);
  const n = s.ring.index;
  const lv = s.player.level;
  const exp = Math.round(expToNext(lv) * R.expRatio * (1 + R.expStep * (n - 1)));
  const silver = Math.round(lv * R.silverPerLevel * (1 + R.expStep * (n - 1)));
  const lines = [`第${n}环完成，经验+${exp}、银两+${silver}`];
  s.player.silver += silver;
  lines.push(...grantPlayerExp(s, exp));
  const rng = rollRng(s);
  for (const d of R.drops) {
    if (!rng.chance(d.chance)) continue;
    const items2: Record<string, number> = { ...(d.items ?? {}) };
    if (d.ore) items2[oreFor(lv, d.ore)] = 1;
    if (d.gem) items2[randomGem(rng, d.gem)] = 1;
    lines.push(...grantReward(s, { items: items2 }));
  }
  s.ring.task = null;
  bump(s, 'rings');
  // 二环、三环的引导：跑完那一档的第一环就算
  for (const [flag, at] of [['ring2', 11], ['ring3', 21]] as const) {
    if (n >= at && ringTier(n) === ringTier(at) && !s.flags[flag]) {
      s.flags[flag] = true;
      onFlag(s, flag);
    }
  }
  if (n % R.rounds === 0) {
    const T = R.tiers[ringTier(n) - 1];
    const bonus: Record<string, number> = { ...T.final };
    if (rng.chance(R.final.chance)) for (const [k, v] of Object.entries(R.final.bonus)) bonus[k] = (bonus[k] ?? 0) + v;
    lines.push(`${T.name}跑完了！`, ...grantReward(s, { items: bonus }));
    s.ring.index = 0;
    bump(s, 'ringRounds');
    bump(s, `ringRounds${ringTier(n)}`);
    s.flags.ringRound = true;
    onFlag(s, 'ringRound');
    log(s, `跑完${T.name}`);
  } else {
    s.ring.index = n + 1;
  }
  for (const l of lines.slice(1)) log(s, l);
  return { ok: true, lines };
}

export function abandonRing(s: Save): string {
  s.ring = { index: 0, task: null };
  return '跑环中断了，下次要从这一档的第一环开始';
}

export function onRingKills(s: Save, kills: Record<string, number>): string | null {
  const t = s.ring.task;
  if (!t || t.type !== 'kill' || !kills[t.monster!] || t.have >= t.count) return null;
  t.have = Math.min(t.count, t.have + kills[t.monster!]);
  return t.have >= t.count ? '跑环任务完成，回许昌找跑环使者' : `跑环：${monsters[t.monster!].name}${t.have}/${t.count}`;
}

export function onRingCapture(s: Save, monsterId: string): string | null {
  const t = s.ring.task;
  if (!t || t.type !== 'capture' || t.monster !== monsterId || t.have >= t.count) return null;
  t.have = t.count;
  return '跑环任务完成，回许昌找跑环使者';
}

export const RING_ROUNDS = R.rounds;
export const RING_STAMINA = R.stamina;
