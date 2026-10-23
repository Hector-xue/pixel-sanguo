// 限时和每日活动：抢宝（天下历每天 9 时、15 时开）、银两环（庐江）、文曲星答题、幸运王抽奖、节日礼包。
// 「每天」都是天下历的天（打 18 仗一天，见 calendar.ts）；节日还按真实日期
import { locations, systems } from '../data';
import { createBattle } from '../core/battle';
import type { BUnit, Battle } from '../core/battle';
import { expToNext } from '../core/formulas';
import { Rng } from '../core/rng';
import { generalUnit, monsterUnit, playerUnit } from './encounter';
import type { Save } from './state';
import { arrive, bagCount, bump, grantPlayerExp, log, removeItem, rollRng } from './state';
import { DAY_BATTLES, calDay, calTick, dayHour, tomorrowHint } from './calendar';
import { visited } from './town';
import { grantReward, rollLoot } from './welfare';

// ===== 抢宝 =====
const TR = systems.treasure;

function hash(str: string): number {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// 天下历第 t 格开着哪一场（开场的钟点），没开返回 undefined
function openAt(t: number): number | undefined {
  const hr = dayHour(t);
  return TR.hours.find((h) => hr >= h && hr < h + TR.spanHours);
}

// 现在开着的那一场：哪个钟点开的、宝藏埋在哪；没开就说再打几仗开
export function treasureNow(s: Save, t = calTick(s)): { open: boolean; hour: number; at: string | null; next: string; left: number } {
  const hour = openAt(t);
  let wait = 1;
  while (wait <= DAY_BATTLES && openAt(t + wait) === undefined) wait++;
  const nextText = `再打${wait}仗（${dayHour(t + wait) < dayHour(t) ? '明天' : '今天'}${openAt(t + wait)}时）`;
  if (hour === undefined) return { open: false, hour: -1, at: null, next: nextText, left: 0 };
  // 这一场还能开打几仗（算上眼下这一仗）
  let left = 1;
  while (openAt(t + left) === hour) left++;
  // 宝藏点：去过的野外里随机一处（这一场里一直在同一处）
  const places = Object.keys(locations).filter((id) => !locations[id].town && locations[id].groups.length && visited(s, id));
  const rng = new Rng(hash(`${calDay(t)}-${hour}-${s.seed}`));
  return { open: true, hour, at: places.length ? rng.pick(places) : 'cunbei', next: nextText, left };
}

export function treasureLeft(s: Save, t = calTick(s)): number {
  const d = calDay(t);
  if (s.p3.treasure.day !== d) s.p3.treasure = { day: d, used: 0, found: null, at: null };
  return Math.max(0, TR.perDay - s.p3.treasure.used);
}

// 直接传送到宝藏点
export function treasureTeleport(s: Save): string {
  const t = treasureNow(s);
  if (!t.open || !t.at) return `抢宝还没开始，下一场${t.next}`;
  arrive(s, t.at);
  return `传送到了${locations[t.at].name}，宝藏就在这里`;
}

export function treasureBattle(s: Save, seed: number): Battle | string {
  const t = treasureNow(s);
  if (!t.open) return `抢宝还没开始，下一场${t.next}`;
  if (s.location !== t.at) return `宝藏在${locations[t.at!].name}`;
  if (treasureLeft(s) <= 0) return `今天的抢宝次数用完了，${tomorrowHint(s)}`;
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

// t 是开打那一格，次数记在开打那天
export function afterTreasure(s: Save, won: boolean, t = calTick(s)): string[] {
  treasureLeft(s, t);
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

export function silverRingLeft(s: Save, t = calTick(s)): number {
  const d = calDay(t);
  if (s.p3.silverRing.day !== d) s.p3.silverRing = { day: d, earned: 0, task: s.p3.silverRing.task };
  return Math.max(0, SR.perDay - Math.round(s.p3.silverRing.earned));
}

export function takeSilverRing(s: Save): string {
  if (s.player.level < SR.minLevel) return `${SR.minLevel}级才能接`;
  if (s.p3.silverRing.task) return `手上还有：收${SR.need}份军资（有${bagCount(s, 'junzi')}份）`;
  if (silverRingLeft(s) <= 0) return `今天的军资已经够了，${tomorrowHint(s)}`;
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

export function wenquToday(s: Save, t = calTick(s)): { left: number; qi: number | null } {
  const d = calDay(t);
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

export function luckyDraws(s: Save, t = calTick(s)): number {
  const d = calDay(t);
  if (s.p3.lucky.day !== d) s.p3.lucky = { day: d, luck: s.p3.lucky.luck, draws: 0 };
  return s.p3.lucky.draws;
}

export function luckyCost(s: Save): number {
  return luckyDraws(s) < LK.free ? 0 : LK.goldPerDraw;
}

export function luckyDraw(s: Save): string {
  if (luckyDraws(s) >= LK.maxDraws) return `今天抽够了，${tomorrowHint(s)}`;
  const cost = luckyCost(s);
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
