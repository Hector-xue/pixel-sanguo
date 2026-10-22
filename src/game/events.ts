// 限时和每日活动：抢宝（真实时钟 9 点、11 点开）、银两环（庐江）、文曲星答题、幸运王抽奖、节日礼包。
import { locations, systems } from '../data';
import { createBattle } from '../core/battle';
import type { BUnit, Battle } from '../core/battle';
import { expToNext } from '../core/formulas';
import { Rng } from '../core/rng';
import { generalUnit, monsterUnit, playerUnit } from './encounter';
import type { Save } from './state';
import { arrive, bagCount, bump, dayKey, grantPlayerExp, log, removeItem, rollRng } from './state';
import { visited } from './town';
import { grantReward, rollLoot } from './welfare';

// ===== 抢宝 =====
const TR = systems.treasure;

function hash(str: string): number {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// 现在开着的那一场：哪个整点开的、宝藏埋在哪
export function treasureNow(s: Save, now = Date.now()): { open: boolean; hour: number; at: string | null; next: string } {
  const d = new Date(now);
  const hour = TR.hours.find((h) => d.getHours() === h && d.getMinutes() < TR.minutes);
  const next = TR.hours.find((h) => d.getHours() < h || (d.getHours() === h && d.getMinutes() < TR.minutes));
  const nextText = next !== undefined ? `今天${next}:00` : `明天${TR.hours[0]}:00`;
  if (hour === undefined) return { open: false, hour: -1, at: null, next: nextText };
  // 宝藏点：去过的野外里随机一处（同一场所有人看到的一样）
  const places = Object.keys(locations).filter((id) => !locations[id].town && locations[id].groups.length && visited(s, id));
  const rng = new Rng(hash(`${dayKey(now)}-${hour}-${s.seed}`));
  return { open: true, hour, at: places.length ? rng.pick(places) : 'cunbei', next: nextText };
}

export function treasureLeft(s: Save, now = Date.now()): number {
  const d = dayKey(now);
  if (s.p3.treasure.day !== d) s.p3.treasure = { day: d, used: 0, found: null, at: null };
  return Math.max(0, TR.perDay - s.p3.treasure.used);
}

// 直接传送到宝藏点
export function treasureTeleport(s: Save, now = Date.now()): string {
  const t = treasureNow(s, now);
  if (!t.open || !t.at) return `抢宝还没开始，下一场${t.next}`;
  arrive(s, t.at);
  return `传送到了${locations[t.at].name}，宝藏就在这里`;
}

export function treasureBattle(s: Save, seed: number, now = Date.now()): Battle | string {
  const t = treasureNow(s, now);
  if (!t.open) return `抢宝还没开始，下一场${t.next}`;
  if (s.location !== t.at) return `宝藏在${locations[t.at!].name}`;
  if (treasureLeft(s, now) <= 0) return '今天的抢宝次数用完了';
  const rng = new Rng(seed);
  const n = rng.int(TR.guardCount[0], TR.guardCount[1]);
  const enemies: BUnit[] = Array.from({ length: n }, (_, i) => monsterUnit(`e${i}`, 'hubaoshouwei', s.player.level, i < 3 ? 0 : 1));
  enemies.forEach((e) => (e.name = '宝藏守卫'));
  const allies = [playerUnit(s)];
  const reserve: BUnit[] = [];
  for (const g of s.generals) {
    const u = generalUnit(g, s);
    if (g.uid === s.activeGeneral && u.alive) allies.push(u);
    else reserve.push(u);
  }
  return createBattle({ seed: (rng.next() * 4294967296) >>> 0, allies, reserve, enemies, items: { ...s.bag }, title: '宝藏守卫', canFlee: false, tag: 'treasure' });
}

export function afterTreasure(s: Save, won: boolean, now = Date.now()): string[] {
  treasureLeft(s, now);
  s.p3.treasure.used++;
  if (!won) return ['没打过宝藏守卫，宝藏被别人抢走了'];
  const silver = s.player.level * TR.silverPerLevel;
  const r = rollLoot(s, TR.loot, rollRng(s)) ?? {};
  r.silver = (r.silver ?? 0) + silver;
  bump(s, 'treasures');
  const lines = ['抢到宝藏了！', ...grantReward(s, r)];
  log(s, `抢宝成功：${lines.slice(1).join('，')}`);
  return lines;
}

// ===== 银两环（庐江都尉） =====
const SR = systems.silverRing;

export function silverRingLeft(s: Save, now = Date.now()): number {
  const d = dayKey(now);
  if (s.p3.silverRing.day !== d) s.p3.silverRing = { day: d, earned: 0, task: s.p3.silverRing.task };
  return Math.max(0, SR.perDay - Math.round(s.p3.silverRing.earned));
}

export function takeSilverRing(s: Save, now = Date.now()): string {
  if (s.player.level < SR.minLevel) return `${SR.minLevel}级才能接`;
  if (s.p3.silverRing.task) return `手上还有：收${SR.need}份军资（有${bagCount(s, 'junzi')}份）`;
  if (silverRingLeft(s, now) <= 0) return '今天的军资已经够了，明天再来';
  s.p3.silverRing.task = { need: SR.need, have: 0 };
  return `去庐江郊外打庐江逃兵，追回${SR.need}份军资`;
}

export function silverRingReward(s: Save): number {
  return SR.need * (SR.silverBase + s.player.level * SR.silverPerLevel);
}

export function turnInSilverRing(s: Save): string {
  const t = s.p3.silverRing.task;
  if (!t) return '你还没接军资的差事';
  if (bagCount(s, 'junzi') < t.need) return `军资还差${t.need - bagCount(s, 'junzi')}份`;
  removeItem(s, 'junzi', t.need);
  const silver = silverRingReward(s);
  s.player.silver += silver;
  s.p3.silverRing.task = null;
  s.p3.silverRing.earned++;
  bump(s, 'silverRings');
  log(s, `交上军资，领到${silver}两`);
  return `交上${t.need}份军资，赏银${silver}两`;
}

// ===== 文曲星 =====
const WQ = systems.wenqu;

export function wenquToday(s: Save, now = Date.now()): { left: number; qi: number | null } {
  const d = dayKey(now);
  if (s.p3.wenqu.day !== d) s.p3.wenqu = { day: d, answered: [], right: s.p3.wenqu.right };
  const left = WQ.perDay - s.p3.wenqu.answered.length;
  if (left <= 0) return { left: 0, qi: null };
  // 每天的题按日期洗，答过的不再出
  const rng = new Rng(hash(`${d}-${s.seed}`));
  const order = WQ.questions.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { left, qi: order[s.p3.wenqu.answered.length] };
}

export function answerWenqu(s: Save, qi: number, pick: number): { ok: boolean; lines: string[] } {
  const q = WQ.questions[qi];
  s.p3.wenqu.answered.push(qi);
  if (pick !== q.ok) return { ok: false, lines: [`答错了，正确答案是「${q.a[q.ok]}」`] };
  s.p3.wenqu.right++;
  bump(s, 'wenquRight');
  const exp = Math.round(expToNext(s.player.level) * WQ.expRatio);
  const silver = s.player.level * WQ.silverPerLevel;
  s.player.silver += silver;
  return { ok: true, lines: [`答对了！经验+${exp}、银两+${silver}`, ...grantPlayerExp(s, exp)] };
}

// ===== 幸运王 =====
const LK = systems.lucky;

export function luckyDraws(s: Save, now = Date.now()): number {
  const d = dayKey(now);
  if (s.p3.lucky.day !== d) s.p3.lucky = { day: d, luck: s.p3.lucky.luck, draws: 0 };
  return s.p3.lucky.draws;
}

export function luckyCost(s: Save, now = Date.now()): number {
  return luckyDraws(s, now) < LK.free ? 0 : LK.goldPerDraw;
}

export function luckyDraw(s: Save, now = Date.now()): string {
  if (luckyDraws(s, now) >= LK.maxDraws) return '今天抽够了，明天再来';
  const cost = luckyCost(s, now);
  if (s.player.gold < cost) return `要${cost}金砖`;
  s.player.gold -= cost;
  s.p3.lucky.draws++;
  const rng = rollRng(s);
  const luck = rng.int(LK.luck[0], LK.luck[1]);
  s.p3.lucky.luck += luck;
  const pool = LK.prizes;
  const total = pool.reduce((a, b) => a + b.w, 0);
  let x = rng.next() * total;
  const e = pool.find((p) => (x -= p.w) < 0) ?? pool[0];
  const lines = [`幸运值+${luck}`];
  if (e.gold) {
    const g = rng.int(e.gold[0], e.gold[1]);
    s.player.gold += g;
    lines.push(`抽中金砖${g}`);
  } else {
    const r = rollLoot(s, [e], rng);
    if (r) lines.push(...grantReward(s, r));
  }
  bump(s, 'luckyDraws');
  return lines.join('，');
}

// ===== 节日 =====
const FE = systems.festivals;

export function festivalToday(now = Date.now()): { id: string; name: string } | null {
  const d = new Date(now);
  const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ymd = `${d.getFullYear()}-${md}`;
  const f = FE.days.find((x) => x.dates.includes(md) || x.dates.includes(ymd));
  return f ? { id: f.id, name: f.name } : null;
}

// 节日当天打怪经验加成
export function festivalExpMul(now = Date.now()): number {
  return festivalToday(now) ? FE.expMul : 1;
}

export function festivalKey(now = Date.now()): string | null {
  const f = festivalToday(now);
  return f ? `${new Date(now).getFullYear()}-${f.id}` : null;
}

export function claimFestival(s: Save, now = Date.now()): string {
  const f = festivalToday(now);
  const key = festivalKey(now);
  if (!f || !key) return '今天不是节日';
  if (s.p3.festival.includes(key)) return `${f.name}礼包已经领过了`;
  s.p3.festival.push(key);
  const lines = grantReward(s, FE.gift);
  log(s, `领取${f.name}礼包`);
  return [`${f.name}快乐！`, ...lines].join('\n');
}
