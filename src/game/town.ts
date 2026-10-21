// 城镇设施：钱庄（存取、兑换金砖、商城）、馆驿（寄存、传送）、孔庙（拜师）、军马场（坐骑）、战场（进宝洞）
import { balance, innTowns, items, locations, mounts, systems } from '../data';
import type { Save } from './state';
import { addItem, bagCap, bagCount, bagUsed, bump, log, onFlag, removeItem } from './state';

// ===== 钱庄 =====
export function deposit(s: Save, n: number): string {
  n = Math.floor(Math.min(n, s.player.silver));
  if (n <= 0) return '没有银两可存';
  s.player.silver -= n;
  s.bank += n;
  return `存入${n}两`;
}

export function withdraw(s: Save, n: number): string {
  n = Math.floor(Math.min(n, s.bank));
  if (n <= 0) return '钱庄里没有存款';
  s.bank -= n;
  s.player.silver += n;
  return `取出${n}两`;
}

export function buyGold(s: Save, n: number): string {
  const cost = n * balance.bank.goldBuy;
  if (n <= 0 || s.player.silver < cost) return `银两不足，${n}块金砖要${cost}两`;
  s.player.silver -= cost;
  s.player.gold += n;
  return `用${cost}两换了${n}块金砖`;
}

export function sellGold(s: Save, n: number): string {
  if (n <= 0 || s.player.gold < n) return '金砖不足';
  s.player.gold -= n;
  s.player.silver += n * balance.bank.goldSell;
  return `${n}块金砖换了${n * balance.bank.goldSell}两`;
}

export function shopBuy(s: Save, item: string, n: number): string {
  const g = systems.shop.goods.find((x) => x.item === item);
  if (!g || n <= 0) return '';
  const cost = g.gold * n;
  if (s.player.gold < cost) return `金砖不足，要${cost}块`;
  if (!items[item].quest && bagUsed(s) + n > bagCap(s)) return '负重已满';
  s.player.gold -= cost;
  addItem(s, item, n);
  return `买了${n}个${items[item].name}，花费${cost}块金砖`;
}

// ===== 馆驿 =====
export function storeItem(s: Save, id: string, n: number): string {
  if (items[id]?.quest) return '任务物品不能寄存';
  if (!removeItem(s, id, n)) return '数量不足';
  s.storage[id] = (s.storage[id] ?? 0) + n;
  return `寄存了${n}个${items[id].name}`;
}

export function takeItem(s: Save, id: string, n: number): string {
  n = Math.min(n, s.storage[id] ?? 0);
  if (n <= 0) return '';
  const room = bagCap(s) - bagUsed(s);
  if (room < n) return '负重不够';
  s.storage[id] -= n;
  if (!s.storage[id]) delete s.storage[id];
  addItem(s, id, n);
  return `取出了${n}个${items[id].name}`;
}

export function visited(s: Save, loc: string): boolean {
  return loc === 'xinshoucun' || !!s.flags[`v_${loc}`];
}

// 传送：只能去到过的、有馆驿的城镇
export function teleportTargets(s: Save): { id: string; name: string; ok: boolean }[] {
  return innTowns().filter((id) => id !== s.location).map((id) => ({ id, name: locations[id].name, ok: visited(s, id) }));
}

export function teleport(s: Save, to: string): string {
  const t = teleportTargets(s).find((x) => x.id === to);
  if (!t) return '';
  if (!t.ok) return `还没去过${t.name}`;
  const cost = balance.inn.teleportCost;
  if (s.player.silver < cost) return `传送要${cost}两`;
  s.player.silver -= cost;
  s.location = to;
  return `花费${cost}两，传送到了${t.name}`;
}

// ===== 孔庙 =====
export function templeJoin(s: Save): string {
  if (s.mentor.joined) return '你已经拜过师了';
  const cost = balance.temple.cost;
  if (s.player.silver < cost) return `拜师礼要${cost}两`;
  s.player.silver -= cost;
  s.mentor.joined = true;
  log(s, '在孔庙拜了夫子为师');
  return `拜师成功！以后打仗经验多${Math.round(balance.temple.expBonus * 100)}%，${balance.temple.graduateLevel}级可以出师`;
}

export function templeGraduate(s: Save): string {
  if (!s.mentor.joined || s.mentor.graduated) return '';
  if (s.player.level < balance.temple.graduateLevel) return `${balance.temple.graduateLevel}级才能出师`;
  s.mentor.graduated = true;
  addItem(s, 'gaojibaoxiang', 1);
  s.player.silver += 20000;
  log(s, '从孔庙出师');
  return '出师了！夫子送你一个高级宝箱和20000两盘缠';
}

export function mentorExpMul(s: Save): number {
  return s.mentor.joined && !s.mentor.graduated ? 1 + balance.temple.expBonus : 1;
}

// ===== 军马场 =====
export function buyMount(s: Save, id: string): string {
  const m = mounts[id];
  if (!m) return '';
  if (s.mounts[id]) return `已经有${m.name}了`;
  if (s.player.level < m.level) return `${m.level}级才能骑`;
  if (m.gold) {
    if (s.player.gold < m.gold) return `要${m.gold}块金砖`;
    s.player.gold -= m.gold;
  } else {
    if (s.player.silver < (m.silver ?? 0)) return `要${m.silver}两`;
    s.player.silver -= m.silver ?? 0;
  }
  s.mounts[id] = { level: 1, exp: 0 };
  log(s, `在军马场买了${m.name}`);
  return `买下了${m.name}，点「骑乘」骑上它`;
}

export function ride(s: Save, id: string): string {
  if (!s.mounts[id]) return '';
  s.riding = id;
  s.flags.mounted = true;
  onFlag(s, 'mounted');
  return `骑上了${mounts[id].name}`;
}

export function restMount(s: Save): string {
  if (!s.riding) return '';
  const n = mounts[s.riding].name;
  s.riding = null;
  return `${n}去休息了`;
}

export function mountExpNeed(level: number): number {
  return level * balance.mount.expPerLevel;
}

// 骑着打仗涨坐骑经验
export function mountGain(s: Save, n: number): string[] {
  const id = s.riding;
  const m = id ? s.mounts[id] : undefined;
  if (!id || !m || m.level >= balance.mount.maxLevel) return [];
  m.exp += n;
  const out: string[] = [];
  while (m.level < balance.mount.maxLevel && m.exp >= mountExpNeed(m.level)) {
    m.exp -= mountExpNeed(m.level);
    m.level++;
    out.push(`${mounts[id].name}升到了${m.level}级`);
  }
  return out;
}

// ===== 战场：进宝洞 =====
export function enterCave(s: Save): string {
  s.location = 'baodong';
  bump(s, 'caves');
  return bagCount(s, 'chanzi') ? '进了宝洞，找宝洞老人挖宝' : '进了宝洞。挖宝要铲子，宝洞老人那里有卖';
}
