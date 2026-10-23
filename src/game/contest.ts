// 军团争霸（教派一个赛季的循环赛）和跨区大战（赛季最后两天和两个 AI 区比积分）。两样都是切磋：满血上、不用药、不掉经验。
// 日子按天下历走（见 calendar.ts），和国战同一个赛季
import { CLASS_IDS, classes, systems } from '../data';
import { createBattle } from '../core/battle';
import type { BUnit, Battle } from '../core/battle';
import { Rng } from '../core/rng';
import { aiName } from './chatter';
import { generalUnit, playerUnit } from './encounter';
import { DAY_BATTLES, battlesToNextDay, calDay, calTick, weekIndex, weekday } from './calendar';
import { hashStr } from './guozhan';
import { mirrorUnit, rivalGeneralUnit, rivals } from './rivals';
import type { Rival } from './rivals';
import type { Save } from './state';
import { bump, levelCap, log, deployedUids } from './state';
import { grantReward } from './welfare';

const L = systems.league;
const K = systems.kuaqu;
const SECTS = systems.sect.sects;

function sparTeam(s: Save): { allies: BUnit[]; reserve: BUnit[] } {
  const allies = [playerUnit(s)];
  const reserve: BUnit[] = [];
  const dep = deployedUids(s);
  for (const g of s.generals) {
    const u = generalUnit(g, s);
    if (dep.includes(g.uid)) allies.push(u);
    else reserve.push(u);
  }
  for (const u of [...allies, ...reserve]) {
    u.hp = u.maxHp;
    u.mp = u.maxMp;
    u.alive = true;
  }
  return { allies, reserve };
}

const clampLv = (s: Save, lv: number) => Math.max(1, Math.min(levelCap(s), lv));

// ===== 军团争霸 =====
// 四个教派一个赛季七轮：每天两场，三种配对轮着来
const ROT = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];

export function pairsOn(day: number): [number, number][] {
  return ROT[day % 3] as [number, number][];
}

function sectIndex(id: string | null): number {
  return SECTS.findIndex((x) => x.id === id);
}

// 同一赛季换了教派：之前替别家打的不算
function syncLeague(s: Save, t: number): void {
  const lg = s.p4.league;
  const week = weekIndex(t);
  if (lg.week !== week) {
    if (lg.sect && lg.fought.some((x) => x > 0)) {
      const rank = leagueTable(s, lg.week, 7, lg.sect, lg.wins).findIndex((r) => r.id === lg.sect) + 1;
      lg.claim = { week: lg.week, sect: lg.sect, rank };
    }
    Object.assign(lg, { week, sect: s.p3.sect.id, fought: [0, 0, 0, 0, 0, 0, 0], wins: [0, 0, 0, 0, 0, 0, 0] });
  }
  if (lg.sect !== s.p3.sect.id) Object.assign(lg, { sect: s.p3.sect.id, fought: [0, 0, 0, 0, 0, 0, 0], wins: [0, 0, 0, 0, 0, 0, 0] });
}

// 某天某场谁赢：自己教派那场看你当天赢了几阵，别家按教派底子
export function matchWinner(s: Save, week: number, day: number, a: number, b: number, mySect: number, myWins: number): number {
  const r = new Rng(hashStr(`${s.seed}-L-${week}-${day}-${a}-${b}`)).next();
  if (a === mySect || b === mySect) {
    const p = Math.min(0.95, L.baseP + L.perWin * myWins);
    const other = a === mySect ? b : a;
    return r < p ? mySect : other;
  }
  const ra = systems.sect.aiRep[a];
  const rb = systems.sect.aiRep[b];
  return r < ra / (ra + rb) ? a : b;
}

export interface LeagueRow {
  id: string;
  name: string;
  points: number;
  won: number;
  mine: boolean;
}

// 积分表：只算已经打完的天（days 天）
export function leagueTable(s: Save, week: number, days: number, sect: string | null, wins: number[]): LeagueRow[] {
  const my = sectIndex(sect);
  const rows = SECTS.map((x, i) => ({ id: x.id, name: x.name, points: 0, won: 0, mine: i === my }));
  for (let d = 0; d < days; d++) {
    for (const [a, b] of pairsOn(d)) {
      const w = matchWinner(s, week, d, a, b, my, wins[d] ?? 0);
      rows[w].points += L.winPoints;
      rows[w].won++;
    }
  }
  return rows.sort((x, y) => y.points - x.points || systems.sect.aiRep[sectIndex(y.id)] - systems.sect.aiRep[sectIndex(x.id)]);
}

export function leagueView(s: Save, t = calTick(s)) {
  syncLeague(s, t);
  const lg = s.p4.league;
  const d = weekday(t);
  const my = sectIndex(s.p3.sect.id);
  const pair = my < 0 ? null : pairsOn(d).find((p) => p.includes(my))!;
  const foe = pair ? (pair[0] === my ? pair[1] : pair[0]) : -1;
  return {
    day: d,
    table: leagueTable(s, lg.week, d, lg.sect, lg.wins),
    foe: foe >= 0 ? SECTS[foe] : null,
    fought: lg.fought[d],
    wins: lg.wins[d],
    left: Math.max(0, L.fightsPerDay - lg.fought[d]),
    // 再打几仗到明天
    next: battlesToNextDay(t),
    // 已打完的几天里自己教派那场的结果
    history: Array.from({ length: d }, (_, k) => {
      if (my < 0) return null;
      const p = pairsOn(k).find((x) => x.includes(my))!;
      const o = p[0] === my ? p[1] : p[0];
      return { day: k, foe: SECTS[o].name, won: matchWinner(s, lg.week, k, p[0], p[1], my, lg.wins[k]) === my, wins: lg.wins[k] };
    }).filter((x) => x !== null),
  };
}

function sectRivals(s: Save, idx: number): Rival[] {
  return rivals(s).filter((_, k) => k % SECTS.length === idx);
}

export function leagueBattle(s: Save, seed: number, t = calTick(s)): Battle | string {
  if (!s.p3.sect.id) return '先入一个教派才能参加军团争霸';
  const v = leagueView(s, t);
  if (!v.foe || v.left <= 0) return `今天的三阵都打完了，去别处再打${v.next}仗就到明天`;
  const stage = v.fought;
  const rng = new Rng(seed);
  const pool = sectRivals(s, sectIndex(v.foe.id));
  const r1 = pool[(stage * 2 + v.day * 7) % pool.length];
  const r2 = pool[(stage * 2 + 1 + v.day * 7) % pool.length];
  const lv = clampLv(s, s.player.level + L.stageLevel[stage]);
  const enemies = [
    mirrorUnit('e0', r1.name, r1.classId, r1.gender, r1.variant, lv, 'enemy', lv > 100),
    mirrorUnit('e1', r2.name, r2.classId, r2.gender, r2.variant, clampLv(s, lv - 2), 'enemy', lv > 100),
  ];
  // 第三阵对方掌门带着副将压阵
  if (stage === 2) {
    const g = rivalGeneralUnit(s, r1, 'e2', 'enemy');
    g.row = 1;
    enemies.push(g);
  }
  // 我方多带一个副将，对面也多一个副将压阵（同门带来的副将，和你的副将一个分量）
  const extra = Math.max(0, deployedUids(s).length - 1);
  for (let k = 0; k < extra; k++) {
    const r = pool[(stage * 2 + 1 + k + v.day * 7) % pool.length];
    const g = rivalGeneralUnit(s, r, `e${enemies.length}`, 'enemy');
    for (const key of ['maxHp', 'atk', 'def', 'spd'] as const) g[key] = Math.round(g[key] * 0.85);
    g.hp = g.maxHp;
    g.row = 1;
    enemies.push(g);
  }
  const { allies, reserve } = sparTeam(s);
  return createBattle({
    seed: (rng.next() * 4294967296) >>> 0, allies, reserve, enemies, items: {},
    title: `军团争霸·${v.foe.name}第${stage + 1}阵`, spar: true, canFlee: false, tag: `league:${stage}`,
  });
}

export function claimLeague(s: Save, t = calTick(s)): string[] {
  syncLeague(s, t);
  const c = s.p4.league.claim;
  if (!c) return ['没有能领的争霸奖励'];
  s.p4.league.claim = null;
  const r = L.rewards[c.rank - 1];
  const name = SECTS[sectIndex(c.sect)]?.name ?? '';
  const lines = [`上赛季军团争霸${name}排第${c.rank}`, ...grantReward(s, { ...r, silver: r.silverPerLevel * s.player.level })];
  if (s.p3.sect.id === c.sect) {
    s.p3.sect.rep += r.rep;
    lines.push(`教派声望+${r.rep}`);
  }
  if (c.rank === 1) bump(s, 'leagueChamps');
  for (const l of lines) log(s, l);
  return lines;
}

// ===== 跨区大战（赛季第六、七天） =====
export function kuaquOpen(t: number): boolean {
  return weekday(t) >= 5;
}

function syncKuaqu(s: Save, t: number): void {
  const k = s.p4.kuaqu;
  const week = weekIndex(t);
  if (k.week !== week) {
    if (k.points > 0) k.claim = { week: k.week, rank: kuaquScores(s, k.week, 1, k.points).findIndex((x) => x.mine) + 1, points: k.points };
    Object.assign(k, { week, day: '', foughtIds: [], points: 0, wins: 0 });
  }
  const d = calDay(t);
  if (k.day !== d) Object.assign(k, { day: d, foughtIds: [] });
}

// 会武两天过去了多少（0～1）：AI 区的分数跟着天下历涨
export function weekendProgress(t: number): number {
  if (!kuaquOpen(t)) return 0;
  return Math.min(1, ((weekday(t) - 5) * DAY_BATTLES + (t % DAY_BATTLES)) / (2 * DAY_BATTLES));
}

export function kuaquScores(s: Save, week: number, progress: number, points: number): { name: string; score: number; mine: boolean }[] {
  const names = [s.server, ...K.servers];
  return names
    .map((name, i) => {
      const r = new Rng(hashStr(`${s.seed}-K-${week}-${i}`)).next();
      const base = K.base * (1 + K.spread * (r * 2 - 1)) * progress;
      const score = Math.round(base + (i === 0 ? points * K.playerWeight : 0));
      return { name, score, mine: i === 0 };
    })
    .sort((a, b) => b.score - a.score);
}

export interface KuaquFoe {
  idx: number;
  name: string;
  server: string;
  classId: (typeof CLASS_IDS)[number];
  gender: 'male' | 'female';
  variant: number;
  level: number;
}

// 今天的五个对手（别区的高手，比你高 3～9 级）
export function kuaquFoes(s: Save, t = calTick(s)): KuaquFoe[] {
  const rng = new Rng(hashStr(`${s.seed}-Kf-${calDay(t)}`));
  return Array.from({ length: K.fightsPerDay }, (_, idx) => {
    const server = rng.pick(K.servers);
    return {
      idx, server, name: aiName(rng), classId: rng.pick(CLASS_IDS), gender: rng.chance(0.4) ? 'female' : 'male', variant: rng.int(0, 2),
      level: clampLv(s, s.player.level + rng.int(K.oppLevel[0], K.oppLevel[1])),
    } as KuaquFoe;
  });
}

export function kuaquView(s: Save, t = calTick(s)) {
  syncKuaqu(s, t);
  const k = s.p4.kuaqu;
  return {
    open: kuaquOpen(t),
    day: weekday(t),
    next: battlesToNextDay(t),
    foes: kuaquFoes(s, t),
    fought: k.foughtIds,
    points: k.points,
    wins: k.wins,
    scores: kuaquScores(s, k.week, weekendProgress(t), k.points),
  };
}

export function kuaquReason(s: Save, t = calTick(s)): string {
  if (s.player.level < K.minLevel) return `${K.minLevel}级才能参加诸州会武`;
  if (!kuaquOpen(t)) return `诸州会武在每个赛季第六、七天开（还要打${(5 - weekday(t)) * DAY_BATTLES - (t % DAY_BATTLES)}仗）`;
  return '';
}

export function kuaquBattle(s: Save, idx: number, seed: number, t = calTick(s)): Battle | string {
  const why = kuaquReason(s, t);
  if (why) return why;
  const v = kuaquView(s, t);
  const f = v.foes[idx];
  if (!f || v.fought.includes(idx)) return '这个对手今天已经打过了';
  const rng = new Rng(seed);
  const m = mirrorUnit('e0', f.name, f.classId, f.gender, f.variant, f.level, 'enemy', f.level > 100);
  const gen = rivals(s)[(idx * 13 + v.day) % rivals(s).length];
  const g = mirrorUnit('e1', gen.general.name, gen.general.classId, gen.general.gender, 0, Math.max(1, f.level - 5), 'enemy');
  g.look = gen.general.look;
  for (const key of ['maxHp', 'atk', 'def', 'spd'] as const) g[key] = Math.round(g[key] * 0.8);
  g.hp = g.maxHp;
  g.row = 1;
  const enemies = [m, g];
  // 我方多带一个副将，对面多一个副将压阵
  const extra = Math.max(0, deployedUids(s).length - 1);
  for (let k = 0; k < extra; k++) {
    const o = rivals(s)[(idx * 13 + v.day + 7 * (k + 1)) % rivals(s).length];
    const e = mirrorUnit(`e${enemies.length}`, o.general.name, o.general.classId, o.general.gender, 0, Math.max(1, f.level - 5), 'enemy');
    e.look = o.general.look;
    for (const key of ['maxHp', 'atk', 'def', 'spd'] as const) e[key] = Math.round(e[key] * 0.8);
    e.hp = e.maxHp;
    e.row = 1;
    enemies.push(e);
  }
  const { allies, reserve } = sparTeam(s);
  return createBattle({
    seed: (rng.next() * 4294967296) >>> 0, allies, reserve, enemies, items: {},
    title: `诸州会武·${f.server} ${f.name}`, spar: true, canFlee: false, tag: `kuaqu:${idx}`,
  });
}

export function claimKuaqu(s: Save, t = calTick(s)): string[] {
  syncKuaqu(s, t);
  const c = s.p4.kuaqu.claim;
  if (!c) return ['没有能领的会武奖励'];
  s.p4.kuaqu.claim = null;
  const r = K.rewards[c.rank - 1];
  const lines = [`上赛季诸州会武${s.server}排第${c.rank}（你拿了${c.points}分）`, ...grantReward(s, { ...r, silver: r.silverPerLevel * s.player.level })];
  if (c.rank === 1) bump(s, 'kuaquChamps');
  for (const l of lines) log(s, l);
  return lines;
}

// 今天还剩几阵 / 几个对手（今日事务每次刷新都要看，不算整张积分表）
export function leagueLeft(s: Save, t = calTick(s)): number {
  syncLeague(s, t);
  return Math.max(0, L.fightsPerDay - s.p4.league.fought[weekday(t)]);
}

export function kuaquLeft(s: Save, t = calTick(s)): number {
  syncKuaqu(s, t);
  return Math.max(0, K.fightsPerDay - s.p4.kuaqu.foughtIds.length);
}

export function contestPending(s: Save, t = calTick(s)): boolean {
  syncLeague(s, t);
  syncKuaqu(s, t);
  return !!(s.p4.league.claim || s.p4.kuaqu.claim || s.p4.seasonClaim);
}

// 切磋打完由 finishBattle 调用（t 是开打那一格，记在开打那天）
export function afterContest(s: Save, b: Battle, t = calTick(s)): string[] {
  const [kind, arg] = (b.tag ?? '').split(':');
  const win = b.outcome === 'win';
  const lines: string[] = [];
  if (kind === 'league') {
    syncLeague(s, t);
    const d = weekday(t);
    s.p4.league.fought[d]++;
    if (win) s.p4.league.wins[d]++;
    const v = leagueView(s, t);
    lines.push(win ? `军团争霸第${Number(arg) + 1}阵获胜（今天${v.wins}胜）` : `军团争霸第${Number(arg) + 1}阵落败`);
    if (v.left === 0) lines.push(`今天三阵打完了，${v.foe?.name ?? ''}那场的胜负明天揭晓：你赢的阵越多，本教派越可能赢`);
    if (win) bump(s, 'leagueWins');
  } else if (kind === 'kuaqu') {
    syncKuaqu(s, t);
    const idx = Number(arg);
    const k = s.p4.kuaqu;
    if (!k.foughtIds.includes(idx)) k.foughtIds.push(idx);
    if (win) {
      const f = kuaquFoes(s, t)[idx];
      const pts = K.winPoints + K.levelDiffPoints * Math.max(0, (f?.level ?? s.player.level) - s.player.level);
      k.points += pts;
      k.wins++;
      bump(s, 'kuaquWins');
      lines.push(`会武获胜，为${s.server}拿下${pts}分（共${k.points}分）`);
    } else lines.push('会武落败，没拿到分');
  }
  return lines;
}

export const className = (id: (typeof CLASS_IDS)[number]) => classes[id].name;
