// 擂台（主角排位）、斗将台（副将排位）、决斗场（找 AI 玩家切磋抢银两，打弱的涨恶人值）。
// 都是切磋：不掉经验、不回新手村、不用药。排位只记自己的名次，对手名单由 AI 名册按强弱排好。
import { createBattle } from '../core/battle';
import type { BUnit, Battle } from '../core/battle';
import { Rng } from '../core/rng';
import { balance } from '../data';
import { generalUnit, playerUnit } from './encounter';
import { mirrorUnit, rivalGeneralUnit, rivalLevel, rivals } from './rivals';
import type { Rival } from './rivals';
import type { Save } from './state';
import { bump, dayKey, findGeneral, onFlag } from './state';

const A = balance.arena;
export type Ladder = 'arena' | 'duel';

function resetDay(s: Save, now: number): void {
  const d = dayKey(now);
  if (s.p3.arena.day !== d) Object.assign(s.p3.arena, { day: d, fights: 0 });
  if (s.p3.duel.day !== d) Object.assign(s.p3.duel, { day: d, fights: 0 });
  if (s.p3.pk.day !== d) Object.assign(s.p3.pk, { day: d, fights: 0 });
}

export function fightsLeft(s: Save, kind: Ladder | 'pk', now = Date.now()): number {
  resetDay(s, now);
  const used = kind === 'arena' ? s.p3.arena.fights : kind === 'duel' ? s.p3.duel.fights : s.p3.pk.fights;
  return Math.max(0, A.perDay - used);
}

// 名次表：前 A.ranks 名由 AI 按强弱排，自己插在自己的名次上（0 = 没上榜）
export function ladder(s: Save, kind: Ladder): { rank: number; rival: Rival | null }[] {
  const mine = kind === 'arena' ? s.p3.arena.rank : s.p3.duel.rank;
  const rs = rivals(s).slice(0, A.ranks);
  const out: { rank: number; rival: Rival | null }[] = [];
  let k = 0;
  for (let rank = 1; rank <= A.ranks; rank++) {
    if (rank === mine) out.push({ rank, rival: null });
    else out.push({ rank, rival: rs[k++] });
  }
  return out;
}

export function myRank(s: Save, kind: Ladder): number {
  return kind === 'arena' ? s.p3.arena.rank : s.p3.duel.rank;
}

// 能挑战的：比自己名次高的 5 个（没上榜就挑最后 5 名）
export function challengers(s: Save, kind: Ladder): { rank: number; rival: Rival }[] {
  const mine = myRank(s, kind) || A.ranks + 1;
  return ladder(s, kind).filter((x) => x.rival && x.rank < mine && x.rank >= mine - A.reach).map((x) => ({ rank: x.rank, rival: x.rival! }));
}

function sides(s: Save): { allies: BUnit[]; reserve: BUnit[] } {
  const allies = [playerUnit(s)];
  const reserve: BUnit[] = [];
  for (const g of s.generals) {
    const u = generalUnit(g, s);
    if (g.uid === s.activeGeneral && u.alive) allies.push(u);
    else reserve.push(u);
  }
  // 切磋满血满精力上
  for (const u of [...allies, ...reserve]) {
    u.hp = u.maxHp;
    u.mp = u.maxMp;
    u.alive = true;
  }
  return { allies, reserve };
}

export function arenaBattle(s: Save, kind: Ladder, rank: number, seed: number): Battle | string {
  if (fightsLeft(s, kind) <= 0) return '今天的挑战次数用完了';
  const c = challengers(s, kind).find((x) => x.rank === rank);
  if (!c) return '只能挑战名次比你高 5 名以内的人';
  const lv = rivalLevel(s, c.rival);
  const r = c.rival;
  if (kind === 'arena') {
    const { allies, reserve } = sides(s);
    const enemies = [mirrorUnit('e0', r.name, r.classId, r.gender, r.variant, lv, 'enemy', lv > 100), rivalGeneralUnit(s, r, 'e1', 'enemy')];
    enemies[1].row = 1;
    return createBattle({ seed, allies, reserve, enemies, items: {}, title: `擂台·第${rank}名 ${r.name}`, spar: true, canFlee: false, tag: `arena:${rank}` });
  }
  const g = s.generals.find((x) => x.uid === s.activeGeneral);
  if (!g) return '先设一个出战副将';
  const u = generalUnit(g, s);
  u.hp = u.maxHp;
  u.mp = u.maxMp;
  u.alive = true;
  return createBattle({ seed, allies: [u], enemies: [rivalGeneralUnit(s, r, 'e0', 'enemy')], items: {}, title: `斗将台·第${rank}名 ${r.name}的${r.general.name}`, spar: true, canFlee: false, tag: `duel:${rank}` });
}

// ===== 决斗场：今天在场的 6 个人 =====
export function pkList(s: Save, now = Date.now()): Rival[] {
  const rng = new Rng((s.seed ^ Math.floor(now / 3600000)) >>> 0);
  const all = rivals(s).filter((r) => Math.abs(rivalLevel(s, r) - s.player.level) <= 12);
  const out: Rival[] = [];
  while (out.length < Math.min(6, all.length)) {
    const r = rng.pick(all);
    if (!out.includes(r)) out.push(r);
  }
  return out.sort((a, b) => rivalLevel(s, b) - rivalLevel(s, a));
}

export function pkBattle(s: Save, rivalId: string, seed: number): Battle | string {
  if (fightsLeft(s, 'pk') <= 0) return '今天的决斗次数用完了';
  const r = rivals(s).find((x) => x.id === rivalId);
  if (!r) return '';
  const lv = rivalLevel(s, r);
  const { allies, reserve } = sides(s);
  return createBattle({ seed, allies, reserve, enemies: [mirrorUnit('e0', r.name, r.classId, r.gender, r.variant, lv, 'enemy', lv > 100)], items: {}, title: `决斗·${r.name}`, spar: true, canFlee: true, tag: `pk:${r.id}` });
}

// 恶人值：每小时消 1 点
export function evilNow(s: Save, now = Date.now()): number {
  const at = s.p3.evilAt ?? now;
  const decay = Math.floor((now - at) / 3600000);
  if (decay > 0) {
    s.p3.evil = Math.max(0, s.p3.evil - decay);
    s.p3.evilAt = at + decay * 3600000;
  }
  if (!s.p3.evil) s.p3.evilAt = now;
  return s.p3.evil;
}

// 战斗结束后由 finishBattle 调用
export function afterArena(s: Save, b: Battle, now = Date.now()): string[] {
  const [kind, arg] = (b.tag ?? '').split(':');
  const win = b.outcome === 'win';
  const lines: string[] = [];
  resetDay(s, now);
  if (kind === 'arena' || kind === 'duel') {
    const L = kind === 'arena' ? s.p3.arena : s.p3.duel;
    L.fights++;
    const rank = Number(arg);
    if (kind === 'arena') {
      s.flags.arena = true;
      onFlag(s, 'arena');
    }
    if (win) {
      L.rank = rank;
      L.best = L.best ? Math.min(L.best, rank) : rank;
      const silver = s.player.level * A.winSilver;
      s.player.silver += silver;
      if (kind === 'arena') s.p3.arena.wins++;
      bump(s, kind === 'arena' ? 'arenaWins' : 'duelWins');
      lines.push(`${kind === 'arena' ? '擂台' : '斗将台'}获胜！名次升到第${rank}名，银两+${silver}`);
    } else {
      lines.push(`${kind === 'arena' ? '擂台' : '斗将台'}落败，名次不变`);
    }
  } else if (kind === 'pk') {
    s.p3.pk.fights++;
    const r = rivals(s).find((x) => x.id === arg);
    const lv = r ? rivalLevel(s, r) : s.player.level;
    if (win) {
      const silver = lv * A.pkSilver;
      s.player.silver += silver;
      evilNow(s, now);
      const add = s.player.level - lv >= 5 ? A.evilBully : A.evilWin;
      s.p3.evil += add;
      bump(s, 'pkWins');
      lines.push(`决斗获胜，抢到${silver}两银子，恶人值+${add}`);
    } else if (b.outcome === 'lose') {
      const lost = Math.floor(s.player.silver * A.pkLossPct);
      s.player.silver -= lost;
      lines.push(`决斗落败，被抢走${lost}两银子`);
    } else lines.push('逃离了决斗场');
  }
  return lines;
}

// 每天领一次擂台俸禄：名次越高越多
export function arenaSalary(s: Save, now = Date.now()): string {
  const d = dayKey(now);
  if (!s.p3.arena.rank) return '上了擂台的榜才有俸禄';
  if (s.flags[`salary_${d}`]) return '今天的俸禄已经领过了';
  for (const k of Object.keys(s.flags)) if (k.startsWith('salary_')) delete s.flags[k];
  s.flags[`salary_${d}`] = true;
  const silver = (A.ranks + 1 - s.p3.arena.rank) * s.player.level * A.salaryPerRank;
  s.player.silver += silver;
  return `领到擂台俸禄${silver}两（第${s.p3.arena.rank}名）`;
}

export function generalOf(s: Save): string | null {
  const g = s.activeGeneral ? findGeneral(s, s.activeGeneral) : null;
  return g ? g.name : null;
}
