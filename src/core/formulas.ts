import { balance, classes, monsters } from '../data';
import type { Attrs, ClassId, Resists, Stats } from './types';
import { RESIST_KEYS } from './types';

const D = balance.derived;

export function emptyResists(): Resists {
  const r = {} as Resists;
  for (const k of RESIST_KEYS) r[k] = 0;
  return r;
}

export function deriveStats(attrs: Attrs, level: number, classId: ClassId): Stats {
  const resist = emptyResists();
  for (const [k, v] of Object.entries(classes[classId].resist)) resist[k as keyof Resists] += v ?? 0;
  const R = balance.rates;
  return {
    maxHp: Math.round(D.hp.base + attrs.con * D.hp.con + level * D.hp.level),
    maxMp: Math.round(D.mp.base + attrs.int * D.mp.int + level * D.mp.level),
    atk: Math.round(D.atk.base + attrs.str * D.atk.str + level * D.atk.level),
    def: Math.round(D.def.base + attrs.con * D.def.con + level * D.def.level),
    spd: Math.round(D.spd.base + attrs.agi * D.spd.agi + level * D.spd.level),
    carry: Math.round(D.carry.base + attrs.str * D.carry.str),
    resist,
    rates: {
      crit: R.crit,
      counter: R.counter,
      fatal: R.fatal,
      dodge: Math.min(R.dodgeCap, R.dodge + attrs.agi * R.dodgePerAgi),
    },
  };
}

// 升到下一级所需经验
export function expToNext(level: number): number {
  return balance.exp.a * level * level + balance.exp.b;
}

// 抗性点数换算成减免比例
export function resistReduce(points: number): number {
  if (points <= 0) return 0;
  return points / (points + balance.damage.resistK);
}

export function playerAttrsAt(classId: ClassId, level: number, free: Partial<Attrs> = {}): Attrs {
  const base = classes[classId].baseAttrs;
  const auto = (level - 1) * balance.autoAttrPerLevel;
  return {
    con: base.con + auto + (free.con ?? 0),
    str: base.str + auto + (free.str ?? 0),
    int: base.int + auto + (free.int ?? 0),
    agi: base.agi + auto + (free.agi ?? 0),
  };
}

// 怪物按等级和属性权重分配属性
export function monsterAttrs(monsterId: string, level: number): Attrs {
  const m = monsters[monsterId];
  const total = balance.monster.baseAttr + balance.monster.attrPerLevel * level;
  const w = m.weights;
  const sum = w.con + w.str + w.int + w.agi;
  return {
    con: Math.round((total * w.con) / sum),
    str: Math.round((total * w.str) / sum),
    int: Math.round((total * w.int) / sum),
    agi: Math.round((total * w.agi) / sum),
  };
}

export function monsterStats(monsterId: string, level: number): Stats {
  const m = monsters[monsterId];
  const s = deriveStats(monsterAttrs(monsterId, level), level, m.class);
  const B = balance.monster;
  s.maxHp = Math.round(s.maxHp * (m.hpMul ?? B.hpMul));
  s.atk = Math.round(s.atk * (m.atkMul ?? B.atkMul));
  return s;
}

export function monsterExp(monsterId: string, level: number): number {
  const m = monsters[monsterId];
  return Math.round((balance.monster.expBase + balance.monster.expPerLevel * level) * (m.expMul ?? 1));
}

export function monsterSilver(monsterId: string, level: number): number {
  const m = monsters[monsterId];
  return Math.round((balance.monster.silverBase + balance.monster.silverPerLevel * level) * (m.silverMul ?? 1));
}

// 等级差太大时经验打折
export function expLevelMul(unitLevel: number, enemyLevel: number): number {
  const over = unitLevel - enemyLevel;
  for (const step of balance.expLevelDiff) if (over >= step.over) return step.mul;
  return 1;
}

export function skillMp(cost: [number, number], level: number): number {
  return cost[0] + cost[1] * (level - 1);
}

export function lerpLevel(pair: [number, number] | undefined, level: number): number {
  if (!pair) return 0;
  return pair[0] + pair[1] * (level - 1);
}
