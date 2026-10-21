// 武器店（买卖1级装备）、穿脱装备、铁匠铺（打造、矿石合成、宝石镶嵌/拆卸/合成）
import { balance, equips, gemId, items } from '../data';
import { attrReq, gearName, gearValue, socketCount, tierLevel, weaponClassOk } from '../core/gear';
import type { ClassId, Gear, Slot } from '../core/types';
import type { Save } from './state';
import { addItem, bagCap, bagCount, bagUsed, bump, log, onFlag, playerAttrs, removeItem, rollRng } from './state';

function newGear(s: Save, slot: Slot, tier: number, cls: ClassId | undefined, q: number): Gear {
  return { uid: `q${s.nextUid++}`, slot, tier, cls: slot === 'weapon' ? cls : undefined, q, gems: Array(socketCount(tier)).fill(null) };
}

function hasRoom(s: Save, n = 1): boolean {
  return bagUsed(s) + n <= bagCap(s);
}

// ===== 武器店 =====
export function shopGear(s: Save): Gear[] {
  return equips.slots.map((slot) => ({ uid: `shop-${slot}`, slot, tier: 1, cls: slot === 'weapon' ? s.player.classId : undefined, q: 0, gems: [] }));
}

export function buyGear(s: Save, slot: Slot): string {
  const price = equips.shopPrice[slot];
  if (s.player.silver < price) return '银两不足';
  if (!hasRoom(s)) return '负重已满，放不下了';
  s.player.silver -= price;
  const g = newGear(s, slot, 1, s.player.classId, 0);
  s.gear.push(g);
  return `买了${gearName(g)}，花费${price}两。在「物品 → 装备」里穿上`;
}

export function sellGear(s: Save, uid: string): string {
  const g = s.gear.find((x) => x.uid === uid);
  if (!g) return '';
  const v = gearValue(g);
  s.gear = s.gear.filter((x) => x !== g);
  s.player.silver += v;
  return `卖出${gearName(g)}，得到${v}两`;
}

// ===== 穿脱 =====
export function canEquip(s: Save, g: Gear): string {
  if (!weaponClassOk(g, s.player.classId)) return '不是本职业的武器';
  if (s.player.level < tierLevel(g.tier)) return `${tierLevel(g.tier)}级才能穿`;
  const req = attrReq(g);
  if (req && playerAttrs(s)[req.key] < req.value) return `${req.key === 'str' ? '力量' : '智力'}要${req.value}`;
  return '';
}

export function equipGear(s: Save, uid: string): string {
  const g = s.gear.find((x) => x.uid === uid);
  if (!g) return '';
  const why = canEquip(s, g);
  if (why) return why;
  s.gear = s.gear.filter((x) => x !== g);
  const old = s.equip[g.slot];
  if (old) s.gear.push(old);
  s.equip[g.slot] = g;
  s.flags.equipped = true;
  onFlag(s, 'equipped');
  return `穿上了${gearName(g)}`;
}

export function unequip(s: Save, slot: Slot): string {
  const g = s.equip[slot];
  if (!g) return '';
  // 脱下来要占一格负重
  if (!hasRoom(s)) return '负重已满，脱不下来';
  delete s.equip[slot];
  s.gear.push(g);
  return `脱下了${gearName(g)}`;
}

// ===== 打造 =====
export interface ForgeRow {
  tier: number;
  name: string;
  level: number;
  ore: string;
  oreN: number;
  silver: number;
  reason: string;
}

export function forgeRows(s: Save, slot: Slot): ForgeRow[] {
  const out: ForgeRow[] = [];
  for (let tier = 2; tier <= equips.tiers.length; tier++) {
    const t = equips.tiers[tier - 1];
    const name = gearName({ uid: '', slot, tier, cls: s.player.classId, q: 0, gems: [] });
    let reason = '';
    if (s.player.level < t.level) reason = `${t.level}级可打`;
    else if (bagCount(s, t.ore!) < t.oreN!) reason = `${items[t.ore!].name}${bagCount(s, t.ore!)}/${t.oreN}`;
    else if (s.player.silver < t.silver!) reason = `银两不足`;
    else if (!hasRoom(s)) reason = '负重已满';
    out.push({ tier, name, level: t.level, ore: t.ore!, oreN: t.oreN!, silver: t.silver!, reason });
  }
  return out;
}

export function forge(s: Save, slot: Slot, tier: number): string {
  const row = forgeRows(s, slot).find((r) => r.tier === tier);
  if (!row || row.reason) return row?.reason ?? '';
  removeItem(s, row.ore, row.oreN);
  s.player.silver -= row.silver;
  const q = rollRng(s).chance(balance.equip.qualityChance) ? 1 : 0;
  const g = newGear(s, slot, tier, s.player.classId, q);
  s.gear.push(g);
  bump(s, 'forged');
  s.flags.forged = true;
  onFlag(s, 'forged');
  log(s, `打造了${gearName(g)}`);
  return `打造成功：${gearName(g)}${q ? '（精良，属性更高）' : ''}`;
}

// ===== 矿石合成 =====
// 矿石链：按装备档的顺序排，3 块低一档合 1 块高一档
export const ORE_CHAIN = equips.tiers.slice(1).map((t) => t.ore!);

export function oreCombineCost(to: string): { from: string; n: number; silver: number } | null {
  const i = ORE_CHAIN.indexOf(to);
  if (i <= 0) return null;
  return { from: ORE_CHAIN[i - 1], n: balance.ore.combineN, silver: balance.ore.combineSilver[i - 1] };
}

export function combineOre(s: Save, to: string): string {
  const c = oreCombineCost(to);
  if (!c) return '';
  if (bagCount(s, c.from) < c.n) return `需要${c.n}块${items[c.from].name}`;
  if (s.player.silver < c.silver) return `需要${c.silver}两银子`;
  removeItem(s, c.from, c.n);
  s.player.silver -= c.silver;
  addItem(s, to, 1);
  return `合成了1块${items[to].name}`;
}

// ===== 宝石 =====
export type GearRef = { slot: Slot } | { uid: string };

export function gearAt(s: Save, ref: GearRef): Gear | undefined {
  return 'slot' in ref ? s.equip[ref.slot] : s.gear.find((g) => g.uid === ref.uid);
}

export function socketGem(s: Save, ref: GearRef, idx: number, gem: string): string {
  const g = gearAt(s, ref);
  if (!g || !items[gem]?.gem) return '';
  if (idx < 0 || idx >= g.gems.length) return '这件装备没有孔（2级以上的装备才有）';
  if (g.gems[idx]) return '这个孔已经有宝石了';
  if (!removeItem(s, gem, 1)) return '没有这颗宝石';
  g.gems[idx] = gem;
  s.flags.gemmed = true;
  onFlag(s, 'gemmed');
  return `${items[gem].name}镶到了${gearName(g)}上`;
}

export function removeGem(s: Save, ref: GearRef, idx: number): string {
  const g = gearAt(s, ref);
  const gem = g?.gems[idx];
  if (!g || !gem) return '';
  const cost = balance.equip.gemRemoveCost;
  if (s.player.silver < cost) return `拆宝石需要${cost}两`;
  if (!hasRoom(s)) return '负重已满';
  s.player.silver -= cost;
  g.gems[idx] = null;
  addItem(s, gem, 1);
  return `拆下了${items[gem].name}，花费${cost}两`;
}

export function gemCombineCost(level: number): number {
  return balance.gem.combineSilver[level - 1] ?? 0;
}

export function combineGem(s: Save, kind: string, level: number): string {
  if (level >= balance.gem.maxLevel) return '已经是最高级了';
  const from = gemId(kind, level);
  const to = gemId(kind, level + 1);
  const n = balance.gem.combineN;
  const cost = gemCombineCost(level);
  if (bagCount(s, from) < n) return `需要${n}颗${items[from].name}`;
  if (s.player.silver < cost) return `需要${cost}两银子`;
  removeItem(s, from, n);
  s.player.silver -= cost;
  addItem(s, to, 1);
  return `合成了1颗${items[to].name}`;
}
