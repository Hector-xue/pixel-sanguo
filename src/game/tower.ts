// 演武塔：80 级以后的长线目标。一层比一层难（第 1 层 80 级的怪，每层高 2 级，到 160 级以后按层数加强），
// 每 10 层名将把守；回满血开打、不耗药（和切磋一样），打赢上一层不耗次数，每天能输几次；每层第一次打赢给奖励。
import { createBattle } from '../core/battle';
import type { BUnit, Battle } from '../core/battle';
import { expToNext } from '../core/formulas';
import { PASSIVES } from '../core/passives';
import { Rng } from '../core/rng';
import { items, locations, monsters, systems } from '../data';
import type { Reward } from '../data';
import { calDay, calTick, tomorrowHint } from './calendar';
import { generalUnit, monsterUnit, playerUnit } from './encounter';
import { mirrorUnit } from './rivals';
import { deployedUids, grantPlayerExp, log } from './state';
import type { Save } from './state';
import { grantReward } from './welfare';

const T = systems.tower;
const CAP = 160;

export interface TowerState {
  best: number;
  day: string;
  losses: number;
}

export function towerDefaults(): TowerState {
  return { best: 0, day: '', losses: 0 };
}

function state(s: Save, t = calTick(s)): TowerState {
  s.p5.tower ??= towerDefaults();
  const tw = s.p5.tower;
  const d = calDay(t);
  if (tw.day !== d) Object.assign(tw, { day: d, losses: 0 });
  return tw;
}

export function towerBest(s: Save): number {
  return s.p5.tower?.best ?? 0;
}

export function towerLossesLeft(s: Save, t = calTick(s)): number {
  return Math.max(0, T.lossesPerDay - state(s, t).losses);
}

// 第 n 层：怪的等级和到顶以后的加成
export function floorLevel(n: number): number {
  return Math.min(CAP, T.baseLevel + T.levelPerFloor * n);
}

export function floorPower(n: number): number {
  return 1 + (n - 1) * T.powerPerFloor;
}

export const isBossFloor = (n: number) => n % T.bossEvery === 0;

// 守塔的兵：85 级以后地图上的普通怪
let POOL: string[] | null = null;
function pool(): string[] {
  if (POOL) return POOL;
  const ids = new Set<string>();
  for (const loc of Object.values(locations)) {
    for (const g of loc.groups) {
      const m = monsters[g.monster];
      if (g.level[0] >= 85 && !m.boss && !m.historic && !g.label) ids.add(g.monster);
    }
  }
  POOL = [...ids].sort();
  return POOL;
}

const HISTORIC = Object.keys(monsters).filter((k) => monsters[k].historic).sort();

// 名将守层：同级镜像，带名将自己的技能和专属被动（主线名将战也用它，见 story.ts）
export function bossUnit(gid: string, lv: number): BUnit {
  const m = monsters[gid];
  const u = mirrorUnit('e0', m.name, m.class, 'male', 0, lv, 'enemy', lv > 100);
  u.maxHp = Math.round(u.maxHp * (m.hpMul ?? 1) * 0.6);
  u.hp = u.maxHp;
  return {
    ...u, kind: 'monster', refId: gid, monsterId: gid, look: m.look,
    skills: m.skills.map((x) => ({ id: x.id, level: x.level, prof: x.level * 2500 })),
    aiSkills: m.skills.map((x) => ({ id: x.id, rate: x.rate })),
    expYield: 0, silverYield: 0,
    passive: PASSIVES[gid] ? gid : undefined,
  };
}

function strengthen(u: BUnit, mul: number): BUnit {
  if (mul === 1) return u;
  u.maxHp = Math.round(u.maxHp * mul);
  u.hp = u.maxHp;
  u.atk = Math.round(u.atk * mul);
  u.def = Math.round(u.def * mul);
  return u;
}

export function floorBoss(n: number): string | null {
  return isBossFloor(n) ? HISTORIC[(n / T.bossEvery - 1) % HISTORIC.length] : null;
}

export function towerReason(s: Save, t = calTick(s)): string {
  if (s.player.level < T.minLevel) return `${T.minLevel}级才能上演武塔`;
  if (towerLossesLeft(s, t) <= 0) return `今天输了${T.lossesPerDay}次，歇一歇吧，${tomorrowHint(s)}`;
  return '';
}

// 下一层（打的总是已过最高层的上面一层）
export function towerBattle(s: Save, seed: number, t = calTick(s)): Battle | string {
  const why = towerReason(s, t);
  if (why) return why;
  const n = towerBest(s) + 1;
  const lv = floorLevel(n);
  const mul = floorPower(n);
  // 同一层每次都是同一拨人（不能刷到一拨弱的）
  const rng = new Rng(n * 7919 + 13);
  const enemies: BUnit[] = [];
  const extra = Math.max(0, deployedUids(s).length - 1);
  const boss = floorBoss(n);
  if (boss) {
    enemies.push(strengthen(bossUnit(boss, lv), mul));
    for (let i = 1; i <= T.bossEscorts + extra && enemies.length < 6; i++) enemies.push(strengthen(monsterUnit(`e${i}`, rng.pick(pool()), lv, i < 3 ? 0 : 1), mul));
  } else {
    const k = Math.min(6, rng.int(T.count[0], T.count[1]) + extra);
    for (let i = 0; i < k; i++) enemies.push(strengthen(monsterUnit(`e${i}`, rng.pick(pool()), lv, i < 3 ? 0 : 1), mul));
  }
  for (const e of enemies) {
    e.capturable = false;
    e.expYield = 0;
    e.silverYield = 0;
  }
  // 回满血上阵，不带药（切磋的规矩）
  const allies = [playerUnit(s)];
  const reserve: BUnit[] = [];
  const dep = deployedUids(s);
  for (const g of s.generals) (dep.includes(g.uid) ? allies : reserve).push(generalUnit(g, s));
  for (const u of [...allies, ...reserve]) Object.assign(u, { hp: u.maxHp, mp: u.maxMp, alive: true });
  return createBattle({
    seed: (new Rng(seed).next() * 4294967296) >>> 0, allies, reserve, enemies, items: {},
    title: `演武塔第${n}层${boss ? `·${monsters[boss].name}` : ''}`, spar: true, canFlee: true, tag: `tower:${n}`,
  });
}

export function floorReward(n: number): Reward {
  const r: Reward = { silver: T.silverBase + T.silverPerFloor * n, items: {} };
  if (n % T.boxEvery === 0) r.items!.gaojibaoxiang = 1;
  if (n % T.lingEvery === 0) r.items![n % (T.lingEvery * 2) === 0 ? 'dajiangjunling' : 'jiangjunling'] = 1;
  if (n % (T.lingEvery * 3) === 0) r.items!.jinengshu = 1;
  return r;
}

export function floorExp(s: Save): number {
  return Math.round(expToNext(s.player.level) * T.expPerFloor);
}

export function rewardText(s: Save, n: number): string {
  const r = floorReward(n);
  const parts = [`银两${r.silver}`, `经验${floorExp(s)}`, ...Object.entries(r.items ?? {}).map(([id, k]) => `${items[id].name}×${k}`)];
  return parts.join('、');
}

// 打完由 finishBattle 调用
export function afterTower(s: Save, b: Battle, t = calTick(s)): string[] {
  const n = Number((b.tag ?? '').split(':')[1]);
  const tw = state(s, t);
  if (b.outcome !== 'win') {
    if (b.outcome === 'lose') tw.losses++;
    const left = towerLossesLeft(s, t);
    return [`演武塔第${n}层没能拿下${b.outcome === 'lose' ? `（今天还能输${left}次）` : ''}`];
  }
  if (n !== tw.best + 1) return [`演武塔第${n}层`];
  tw.best = n;
  s.life.towerBest = Math.max(s.life.towerBest ?? 0, n);
  const exp = floorExp(s);
  const lines = [`拿下演武塔第${n}层！`, ...grantReward(s, floorReward(n)), `经验+${exp}`, ...grantPlayerExp(s, exp)];
  log(s, `拿下演武塔第${n}层`);
  return lines;
}
