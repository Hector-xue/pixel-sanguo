// 装备、宝石、坐骑的加成计算（纯函数）。存档里只记"穿了什么、骑了什么"，面板属性每次现算。
import { balance, equips, gemKinds, items, mounts } from '../data';
import type { Bonus, ClassId, Gear, Rates, Resists, Slot, Stats } from './types';

export function emptyBonus(): Bonus {
  return { hp: 0, mp: 0, atk: 0, def: 0, spd: 0, con: 0, resist: {}, rates: {}, mul: 0 };
}

export function addBonus(a: Bonus, b: Bonus): Bonus {
  const out: Bonus = { hp: a.hp + b.hp, mp: a.mp + b.mp, atk: a.atk + b.atk, def: a.def + b.def, spd: a.spd + b.spd, con: a.con + b.con, resist: { ...a.resist }, rates: { ...a.rates }, mul: a.mul + b.mul };
  for (const [k, v] of Object.entries(b.resist)) out.resist[k as keyof Resists] = (out.resist[k as keyof Resists] ?? 0) + (v ?? 0);
  for (const [k, v] of Object.entries(b.rates)) out.rates[k as keyof Rates] = (out.rates[k as keyof Rates] ?? 0) + (v ?? 0);
  return out;
}

// 加成落到面板上。体质加成要在算面板之前加进属性，这里不处理（调用方先加 con）
export function applyBonus(st: Stats, b: Bonus): Stats {
  const m = 1 + b.mul;
  const out: Stats = {
    ...st,
    maxHp: Math.round((st.maxHp + b.hp) * m),
    maxMp: Math.round(st.maxMp + b.mp),
    atk: Math.round((st.atk + b.atk) * m),
    def: Math.round((st.def + b.def) * m),
    spd: Math.round((st.spd + b.spd) * m),
    resist: { ...st.resist },
    rates: { ...st.rates },
  };
  for (const [k, v] of Object.entries(b.resist)) out.resist[k as keyof Resists] += v ?? 0;
  for (const [k, v] of Object.entries(b.rates)) out.rates[k as keyof Rates] = Math.round((out.rates[k as keyof Rates] + (v ?? 0)) * 10) / 10;
  out.rates.dodge = Math.min(balance.rates.dodgeCap, out.rates.dodge);
  return out;
}

// ===== 装备 =====

export function gearName(g: Gear): string {
  const n = g.slot === 'weapon' ? equips.names.weapon[g.cls ?? 'warrior'][g.tier - 1] : equips.names[g.slot][g.tier - 1];
  return g.q ? `精良${n}` : n;
}

export function tierLevel(tier: number): number {
  return equips.tiers[tier - 1].level;
}

export function socketCount(tier: number): number {
  return equips.sockets[tier - 1] ?? 0;
}

// 武器的属性门槛：武士看力量，其余看智力
export function attrReq(g: Pick<Gear, 'slot' | 'tier' | 'cls'>): { key: 'str' | 'int'; value: number } | null {
  const v = equips.attrReq[g.slot]?.[g.tier - 1] ?? 0;
  if (!v) return null;
  return { key: g.cls === 'warrior' ? 'str' : 'int', value: v };
}

export function gemBonus(gemItem: string): Bonus {
  const b = emptyBonus();
  const def = items[gemItem]?.gem;
  if (!def) return b;
  const per = gemKinds[def.kind].per;
  for (const [k, v] of Object.entries(per.resist ?? {})) b.resist[k as keyof Resists] = (v ?? 0) * def.level;
  for (const [k, v] of Object.entries(per.rates ?? {})) b.rates[k as keyof Rates] = v * def.level;
  b.spd += (per.spd ?? 0) * def.level;
  b.con += (per.con ?? 0) * def.level;
  return b;
}

export function gearBonus(g: Gear): Bonus {
  const b = emptyBonus();
  const q = g.q ? balance.equip.qualityMul : 1;
  const st = equips.stats[g.slot];
  const v = (k: string) => Math.round((st[k]?.[g.tier - 1] ?? 0) * q);
  b.hp += v('hp');
  b.mp += v('mp');
  b.atk += v('atk');
  b.def += v('def');
  b.spd += v('spd');
  if (st.phys) b.resist.phys = v('phys');
  for (const r of ['crit', 'counter', 'dodge'] as const) if (st[r]) b.rates[r] = st[r][g.tier - 1] ?? 0;
  let out = b;
  for (const gem of g.gems) if (gem) out = addBonus(out, gemBonus(gem));
  return out;
}

export function gearsBonus(list: (Gear | undefined | null)[]): Bonus {
  let b = emptyBonus();
  for (const g of list) if (g) b = addBonus(b, gearBonus(g));
  return b;
}

// 卖给系统的价钱：1级按商店价，打造的按打造花费
export function gearValue(g: Gear): number {
  const t = equips.tiers[g.tier - 1];
  const base = g.tier === 1 ? equips.shopPrice[g.slot] : (t.silver ?? 0) + (t.oreN ?? 0) * (items[t.ore ?? '']?.price ?? 0);
  const gems = g.gems.reduce((n, x) => n + (x ? items[x].price : 0), 0);
  return Math.floor(base * (g.q ? 1.3 : 1) * balance.equip.sellRatio) + Math.floor(gems * balance.hospital.sellRatio);
}

export function gearLines(g: Gear): string[] {
  const b = gearBonus({ ...g, gems: [] });
  const out: string[] = [];
  if (b.atk) out.push(`攻击+${b.atk}`);
  if (b.def) out.push(`防御+${b.def}`);
  if (b.hp) out.push(`气血+${b.hp}`);
  if (b.mp) out.push(`精力+${b.mp}`);
  if (b.spd) out.push(`速度+${b.spd}`);
  if (b.resist.phys) out.push(`抗物理+${b.resist.phys}`);
  if (b.rates.crit) out.push(`暴击+${b.rates.crit}%`);
  if (b.rates.counter) out.push(`反击+${b.rates.counter}%`);
  if (b.rates.dodge) out.push(`躲避+${b.rates.dodge}%`);
  return out;
}

export function weaponClassOk(g: Gear, cls: ClassId): boolean {
  return g.slot !== 'weapon' || g.cls === cls;
}

export const SLOTS: Slot[] = ['head', 'neck', 'weapon', 'wrist', 'armor', 'boots'];

// ===== 坐骑 =====

export function mountBonus(id: string | null, level: number): Bonus {
  const b = emptyBonus();
  const m = id ? mounts[id] : undefined;
  if (!m) return b;
  const up = Math.max(0, level - 1);
  b.spd = Math.round(m.base.spd + m.per.spd * up);
  b.resist.chaos = Math.round(m.base.chaos + m.per.res * up);
  b.resist.seal = Math.round(m.base.seal + m.per.res * up);
  b.resist.trap = Math.round(m.base.trap + m.per.res * up);
  return b;
}

// 坐骑战力值：加成折算成一个数，排序和展示用
export function mountPower(id: string, level: number): number {
  const b = mountBonus(id, level);
  return b.spd * 10 + ((b.resist.chaos ?? 0) + (b.resist.seal ?? 0) + (b.resist.trap ?? 0)) * 4;
}
