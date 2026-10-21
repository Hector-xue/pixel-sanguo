// AI 玩家名册：擂台、决斗场、排行榜里的"其他玩家"。由存档种子生成，每个人的等级跟着主角走（有高有低），
// 这样排行榜和擂台始终有对手。打的时候按他的职业、等级、同级装备做成战斗单位（镜像）。
import { CLASS_IDS, classSkills, equips, recruits } from '../data';
import { emptyStatus } from '../core/battle';
import type { BUnit } from '../core/battle';
import { deriveStats, playerAttrsAt } from '../core/formulas';
import { applyBonus, gearsBonus } from '../core/gear';
import { Rng } from '../core/rng';
import type { Attrs, ClassId, Gear, Gender, Slot } from '../core/types';
import { aiName } from './chatter';
import type { Save } from './state';
import { levelCap } from './state';

export interface Rival {
  id: string;
  name: string;
  classId: ClassId;
  gender: Gender;
  variant: number;
  // 等级 = 主角等级 × lvMul + lvAdd（再夹在 1～上限）
  lvMul: number;
  lvAdd: number;
  wealth: number;
  luck: number;
  charm: number;
  evil: number;
  general: { name: string; classId: ClassId; gender: Gender; look: string };
}

const N = 120;
let cache: { seed: number; list: Rival[] } | null = null;

export function rivals(s: Save): Rival[] {
  if (cache && cache.seed === s.seed) return cache.list;
  const rng = new Rng((s.seed * 7919) ^ 0x51ed);
  const gens = [...recruits.yingcai, ...recruits.jiangcai];
  const used = new Set<string>([s.player.name]);
  const list: Rival[] = [];
  for (let i = 0; i < N; i++) {
    let name = aiName(rng);
    while (used.has(name)) name = aiName(rng);
    used.add(name);
    const g = rng.pick(gens);
    list.push({
      id: `r${i}`,
      name,
      classId: rng.pick(CLASS_IDS),
      gender: rng.chance(0.4) ? 'female' : 'male',
      variant: rng.int(0, 2),
      // 前面的人强：排名靠前的对手等级高
      lvMul: 1.12 - (i / N) * 0.55 + rng.range(-0.03, 0.03),
      lvAdd: rng.int(-3, 3),
      wealth: rng.range(0.3, 3),
      luck: rng.int(0, 400),
      charm: rng.int(0, 300),
      evil: rng.chance(0.25) ? rng.int(1, 300) : 0,
      general: { name: g.name, classId: g.class, gender: g.gender, look: g.look },
    });
  }
  cache = { seed: s.seed, list };
  return list;
}

export function rivalLevel(s: Save, r: Rival): number {
  return Math.max(1, Math.min(levelCap(s), Math.round(s.player.level * r.lvMul + r.lvAdd)));
}

export function rivalById(s: Save, id: string): Rival | undefined {
  return rivals(s).find((r) => r.id === id);
}

// 同级能穿的最好的一档装备
function gearFor(level: number, cls: ClassId): Gear[] {
  let tier = 1;
  equips.tiers.forEach((t, i) => {
    if (t.level <= level) tier = i + 1;
  });
  return (equips.slots as Slot[]).map((slot, i) => ({ uid: `x${i}`, slot, tier, cls, q: 0, gems: [] }));
}

// 镜像的加点：武士体力各半；文人、异人一半体质、其余智力和敏捷
function mirrorAttrs(cls: ClassId, level: number, reborn: boolean): Attrs {
  const free = (level - 1) * 4 + (reborn ? 40 : 0);
  const add = cls === 'warrior' ? { con: free / 2, str: free / 2, int: 0, agi: 0 } : { con: free / 2, str: 0, int: free / 4, agi: free / 4 };
  return playerAttrsAt(cls, level, add);
}

export function mirrorUnit(id: string, name: string, cls: ClassId, gender: Gender, variant: number, level: number, side: 'ally' | 'enemy', reborn = false): BUnit {
  const st = applyBonus(deriveStats(mirrorAttrs(cls, level, reborn), level, cls), gearsBonus(gearFor(level, cls)));
  const skLevel = Math.max(1, Math.min(5, Math.floor(level / 25) + 1));
  const sk = classSkills(cls, gender).filter((_, i) => level >= [1, 10, 20][i]);
  return {
    id, name, side, kind: 'mirror', refId: id, classId: cls, gender, look: `hero_${cls}_${gender}`, variant, level, row: 0,
    maxHp: st.maxHp, hp: st.maxHp, maxMp: st.maxMp, mp: st.maxMp, atk: st.atk, def: st.def, spd: st.spd,
    resist: { ...st.resist }, rates: { ...st.rates },
    skills: sk.map((k) => ({ id: k, level: skLevel, prof: skLevel * 2500 })),
    aiSkills: sk.map((k) => ({ id: k, rate: 0.22 })),
    status: emptyStatus(), defending: false, alive: true, captured: false, historic: true, capturable: false,
    expYield: 0, silverYield: 0, profGain: {},
  };
}

// 对手的副将（斗将台）：按他招的名将，等级比他低一点
// 副将没有自由属性点、装备也差一截：按镜像打七折
export function rivalGeneralUnit(s: Save, r: Rival, id: string, side: 'ally' | 'enemy'): BUnit {
  const lv = Math.max(1, rivalLevel(s, r) - 5);
  const u = mirrorUnit(id, r.general.name, r.general.classId, r.general.gender, 0, lv, side);
  u.look = r.general.look;
  for (const k of ['maxHp', 'atk', 'def', 'spd'] as const) u[k] = Math.round(u[k] * 0.7);
  u.hp = u.maxHp;
  u.skills = u.skills.map((x) => ({ ...x, level: Math.max(1, x.level - 1) }));
  return u;
}
