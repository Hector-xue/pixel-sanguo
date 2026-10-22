// 生活技能：钓鱼、采矿、采药三种采集（场景里的采集点，小游戏打出好坏决定收成），加上烹饪（城镇里做菜）。
// 四项各有等级，越练越容易出好东西；采集点挖几次就空，多走几个地方慢慢恢复；药膳的加成管几场战斗
import { items, locations } from '../data';
import { oreFor } from './welfare';
import type { Save } from './state';
import { addItem, bagCount, log, removeItem, rollRng } from './state';

export type GatherKind = 'fish' | 'mine' | 'herb';
export type LifeKind = GatherKind | 'cook';

export const LIFE_NAMES: Record<LifeKind, string> = { fish: '钓鱼', mine: '采矿', herb: '采药', cook: '烹饪' };
export const LIFE_MAX = 10;

export interface LifeState {
  lv: Record<LifeKind, number>;
  exp: Record<LifeKind, number>;
  // 每个采集点：剩几次、上次挖空时走过的步数
  spots: Record<string, { left: number; at: number }>;
  // 换地点的总步数（采集点按步数恢复）
  steps: number;
  // 药膳加成：哪道菜、还剩几场
  feast: { id: string; left: number } | null;
}

export function lifeDefaults(): LifeState {
  return { lv: { fish: 1, mine: 1, herb: 1, cook: 1 }, exp: { fish: 0, mine: 0, herb: 0, cook: 0 }, spots: {}, steps: 0, feast: null };
}

// 哪种地形能做哪种采集
const SPOT_ART: Record<string, GatherKind> = {
  river: 'fish', marsh: 'fish', farm: 'fish',
  cave: 'mine', hill: 'mine', pass: 'mine', ruins: 'mine',
  forest: 'herb', bamboo: 'herb', valley: 'herb', grass: 'herb', tomb: 'herb', road: 'herb',
};
export const SPOT_SIZE = 4;
// 走几步恢复一次
const REGEN_STEPS = 3;

export function spotKind(locId: string): GatherKind | null {
  const loc = locations[locId];
  if (!loc || loc.town) return null;
  return SPOT_ART[loc.art] ?? null;
}

// 地点的等级：怪物最低等级，没有怪的按 1
export function spotLevel(locId: string): number {
  const gs = locations[locId].groups;
  return gs.length ? Math.min(...gs.map((g) => g.level[0])) : 1;
}

export function spotLeft(s: Save, locId: string): number {
  const L = s.p5.life;
  const sp = L.spots[locId];
  if (!sp) return SPOT_SIZE;
  return Math.min(SPOT_SIZE, sp.left + Math.floor((L.steps - sp.at) / REGEN_STEPS));
}

// 换地点时调用
export function lifeStep(s: Save): void {
  s.p5.life.steps++;
}

// 经验到下一级：越往后越慢
export function lifeNeed(lv: number): number {
  return 20 + lv * lv * 12;
}

function gainExp(s: Save, k: LifeKind, n: number): string | null {
  const L = s.p5.life;
  if (L.lv[k] >= LIFE_MAX) return null;
  L.exp[k] += n;
  let up = false;
  while (L.lv[k] < LIFE_MAX && L.exp[k] >= lifeNeed(L.lv[k])) {
    L.exp[k] -= lifeNeed(L.lv[k]);
    L.lv[k]++;
    up = true;
  }
  if (L.lv[k] >= LIFE_MAX) L.exp[k] = 0;
  if (!up) return null;
  const line = `${LIFE_NAMES[k]}升到${L.lv[k]}级`;
  log(s, line);
  return line;
}

// 小游戏的判定区：等级越高越宽（0～1 的比例）
export function zoneWidth(s: Save, k: GatherKind): { good: number; perfect: number } {
  const lv = s.p5.life.lv[k];
  return { good: 0.2 + lv * 0.02, perfect: 0.06 + lv * 0.006 };
}

// 小游戏的速度（一个来回的毫秒数）：地点等级越高越快
export function zoneSpeed(locId: string): number {
  return Math.max(700, 1500 - spotLevel(locId) * 6);
}

// 0=没打中 1=打中 2=正中
export type Quality = 0 | 1 | 2;

export interface GatherResult {
  ok: boolean;
  lines: string[];
  got: { id: string; n: number }[];
}

function fishFor(level: number): string {
  if (level >= 90) return 'yu_huang';
  if (level >= 50) return 'yu_gui';
  if (level >= 20) return 'yu_li';
  return 'yu_ji';
}

// 打完小游戏：按好坏给东西。quality 是每一下的结果（采矿三下，其余一下）
export function gather(s: Save, kind: GatherKind, qs: Quality[]): GatherResult {
  const loc = s.location;
  if (spotKind(loc) !== kind) return { ok: false, lines: ['这里没法这么做'], got: [] };
  if (spotLeft(s, loc) <= 0) return { ok: false, lines: ['这一处已经空了，多走几个地方再回来'], got: [] };
  const L = s.p5.life;
  const rng = rollRng(s);
  const lv = L.lv[kind];
  const lvl = spotLevel(loc);
  const score = qs.reduce((a: number, q) => a + q, 0);
  const perfect = qs.every((q) => q === 2);
  const got: { id: string; n: number }[] = [];
  const lines: string[] = [];
  // 用掉一次
  L.spots[loc] = { left: spotLeft(s, loc) - 1, at: L.steps };
  if (kind === 'fish') {
    if (!score) lines.push('鱼脱钩跑了……');
    else {
      const rare = rng.chance((perfect ? 0.04 : 0.005) + lv * 0.004);
      got.push({ id: rare ? 'yu_jin' : fishFor(lvl + (perfect && rng.chance(0.3) ? 30 : 0)), n: 1 });
      if (perfect && rng.chance(0.3 + lv * 0.03)) got.push({ id: fishFor(lvl), n: 1 });
    }
  } else if (kind === 'mine') {
    if (!score) lines.push('一锤下去火星四溅，石头纹丝不动。');
    else {
      const ore = oreFor(Math.max(lvl, 1), score >= 5 ? 2 : 1);
      got.push({ id: ore, n: score >= 4 ? 2 : 1 });
      if (rng.chance((perfect ? 0.06 : 0.01) + lv * 0.004)) got.push({ id: 'zhenkuang', n: 1 });
    }
  } else {
    if (!score) lines.push('一铲下去，根断了。');
    else {
      got.push({ id: 'yao_cao', n: perfect ? 3 : 2 });
      if (rng.chance((perfect ? 0.12 : 0.03) + lv * 0.01)) got.push({ id: 'yao_lingzhi', n: 1 });
      if (lvl >= 40 && rng.chance((perfect ? 0.05 : 0.01) + lv * 0.004)) got.push({ id: 'yao_shen', n: 1 });
    }
  }
  const real: { id: string; n: number }[] = [];
  for (const g of got) {
    const lost = addItem(s, g.id, g.n);
    if (g.n - lost > 0) real.push({ id: g.id, n: g.n - lost });
    if (lost) lines.push(`负重满了，${items[g.id].name}少拿了${lost}个`);
  }
  if (real.length) lines.unshift(`得到${real.map((g) => `${items[g.id].name}×${g.n}`).join('、')}${perfect ? '（漂亮！）' : ''}`);
  const up = gainExp(s, kind, 2 + score * 3);
  if (up) lines.push(up);
  if (real.some((g) => g.id === 'yu_jin' || g.id === 'yao_shen' || g.id === 'zhenkuang')) log(s, `${LIFE_NAMES[kind]}得到了${real.map((g) => items[g.id].name).join('、')}`);
  return { ok: true, lines, got: real };
}

// ===== 烹饪 =====
export interface Recipe {
  id: string;
  lv: number;
  need: Record<string, number>;
}

export const RECIPES: Recipe[] = [
  { id: 'cai_kaoyu', lv: 1, need: { yu_ji: 1 } },
  { id: 'cai_yutang', lv: 2, need: { yu_li: 1, yao_cao: 1 } },
  { id: 'cai_yaoshan', lv: 3, need: { yu_ji: 1, yao_cao: 3 } },
  { id: 'cai_guiyu', lv: 4, need: { yu_gui: 1, yao_cao: 1 } },
  { id: 'cai_shentang', lv: 5, need: { yao_shen: 1, yu_li: 1 } },
  { id: 'cai_ligeng', lv: 6, need: { yu_huang: 1, yao_lingzhi: 1 } },
  { id: 'cai_jinlin', lv: 7, need: { yu_jin: 1, yao_lingzhi: 1 } },
];

export function canCook(s: Save, r: Recipe): boolean {
  return s.p5.life.lv.cook >= r.lv && Object.entries(r.need).every(([id, n]) => bagCount(s, id) >= n);
}

export function cookHere(s: Save): boolean {
  return !!locations[s.location]?.town;
}

export function cook(s: Save, rid: string): string {
  const r = RECIPES.find((x) => x.id === rid);
  if (!r) return '';
  if (!cookHere(s)) return '城镇里才有灶台';
  if (s.p5.life.lv.cook < r.lv) return `烹饪${r.lv}级才会做`;
  if (!canCook(s, r)) return '材料不够';
  for (const [id, n] of Object.entries(r.need)) removeItem(s, id, n);
  const rng = rollRng(s);
  // 手艺好的时候多出一份
  const n = rng.chance(0.08 + s.p5.life.lv.cook * 0.03) ? 2 : 1;
  const lost = addItem(s, rid, n);
  const lines = [`做好了${items[rid].name}×${n - lost}${n > 1 ? '（多出一份！）' : ''}`];
  if (lost) lines.push('负重满了，有一份放不下');
  const up = gainExp(s, 'cook', 6 + r.lv * 4);
  if (up) lines.push(up);
  return lines.join('\n');
}

// 药膳：吃下去管几场战斗
export const FEASTS: Record<string, { atk: number; def: number; battles: number }> = {
  cai_yaoshan: { atk: 0.08, def: 0, battles: 5 },
  cai_shentang: { atk: 0, def: 0.12, battles: 5 },
  cai_jinlin: { atk: 0.12, def: 0.12, battles: 10 },
};

export function eatFeast(s: Save, id: string): string {
  const f = FEASTS[id];
  if (!f) return '';
  if (!removeItem(s, id, 1)) return `没有${items[id].name}`;
  const old = s.p5.life.feast;
  s.p5.life.feast = { id, left: f.battles };
  return `吃下${items[id].name}，接下来${f.battles}场战斗${feastText(id)}${old && old.left > 0 ? `（顶掉了还剩${old.left}场的${items[old.id].name}）` : ''}`;
}

export function feastText(id: string): string {
  const f = FEASTS[id];
  return [f.atk ? `攻击+${Math.round(f.atk * 100)}%` : '', f.def ? `防御+${Math.round(f.def * 100)}%` : ''].filter(Boolean).join('、');
}

// 开战时给主角加成
export function feastBonus(s: Save): { atk: number; def: number } {
  const fe = s.p5.life?.feast;
  if (!fe || fe.left <= 0) return { atk: 0, def: 0 };
  return { atk: FEASTS[fe.id]?.atk ?? 0, def: FEASTS[fe.id]?.def ?? 0 };
}

// 打完一场（不算切磋）用掉一场
export function feastTick(s: Save): string | null {
  const fe = s.p5.life.feast;
  if (!fe || fe.left <= 0) return null;
  fe.left--;
  if (fe.left > 0) return null;
  s.p5.life.feast = null;
  return `${items[fe.id].name}的劲头过去了`;
}
