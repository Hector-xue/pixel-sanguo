// 娱乐场：赤壁（魏蜀吴三方押注，奖池分成，AI 玩家也在押，押完擂鼓开战）和猜猜看（三选一，猜中拿 2.5 倍，能翻倍再押）
import { systems } from '../data';
import { Rng } from '../core/rng';
import type { ChibiRound, Save } from './state';
import { bump, log, rollRng } from './state';

const K = systems.casino;

// 赤壁：魏蜀吴三方押注，押完自己擂鼓开战（单机不用等时钟）。局数从 0 起往上数
export function roundId(s: Save): number {
  return s.casino.round ?? 0;
}

// AI 玩家的押注：每局三方的热度不同；同一局任何时候算都一样
export function aiPools(s: Save, id: number): number[] {
  const rng = new Rng((s.seed ^ (id * 2654435761)) >>> 0);
  const heat = K.sides.map(() => rng.range(0.4, 1.6));
  const scale = rng.range(20000, 80000);
  return heat.map((h) => Math.round(h * scale));
}

export function chibiWinner(s: Save, id: number): number {
  return new Rng((s.seed ^ (id * 40503 + 7)) >>> 0).int(0, K.sides.length - 1);
}

export interface ChibiView {
  id: number;
  pools: number[];
  mine: number[];
  odds: number[];
}

export function chibiView(s: Save): ChibiView {
  const id = roundId(s);
  const mine = s.casino.chibi?.id === id ? s.casino.chibi.bets : [0, 0, 0];
  const ai = aiPools(s, id);
  const pools = ai.map((v, i) => v + mine[i]);
  const total = pools.reduce((a, b) => a + b, 0);
  const odds = pools.map((p) => (p > 0 ? Math.round(((total * (1 - K.houseCut)) / p) * 100) / 100 : 0));
  return { id, pools, mine, odds };
}

// 擂鼓开战：结算这一局，换下一局
export function fightChibi(s: Save): { winner: number; text: string } | null {
  const r = s.casino.chibi;
  const id = roundId(s);
  if (!r || r.id !== id) return null;
  s.casino.chibi = null;
  s.casino.round = id + 1;
  const w = chibiWinner(s, id);
  const pools = aiPools(s, id).map((v, i) => v + r.bets[i]);
  const total = pools.reduce((a, b) => a + b, 0);
  const staked = r.bets.reduce((a, b) => a + b, 0);
  const win = r.bets[w] > 0 ? Math.floor((r.bets[w] * total * (1 - K.houseCut)) / pools[w]) : 0;
  s.player.silver += win;
  s.casino.net += win - staked;
  bump(s, 'chibi');
  const text = `赤壁第${id + 1}局：${K.sides[w]}胜。你押了${staked}两，${win ? `赢回${win}两` : '血本无归'}`;
  log(s, text);
  return { winner: w, text };
}

export function betChibi(s: Save, side: number, amount: number): string {
  amount = Math.floor(amount);
  if (amount < K.minBet) return `最少押${K.minBet}两`;
  if (s.player.silver < amount) return '银两不足';
  const id = roundId(s);
  let r: ChibiRound | null = s.casino.chibi;
  if (!r || r.id !== id) r = { id, bets: [0, 0, 0] };
  if (r.bets.reduce((a, b) => a + b, 0) + amount > K.maxBet) return `一局最多押${K.maxBet}两`;
  r.bets[side] += amount;
  s.casino.chibi = r;
  s.player.silver -= amount;
  return `押${K.sides[side]}${amount}两`;
}

export function casinoTitle(net: number): string {
  return K.titles.find((t) => net >= t.net)?.name ?? '';
}

// ===== 猜猜看 =====
export function guessStart(s: Save, amount: number): string {
  amount = Math.floor(amount);
  if (s.casino.guess) return '还有一局没猜完';
  if (amount < K.minBet) return `最少押${K.minBet}两`;
  if (amount > K.maxBet) return `最多押${K.maxBet}两`;
  if (s.player.silver < amount) return '银两不足';
  s.player.silver -= amount;
  s.casino.guess = { pot: amount, base: amount };
  return `押了${amount}两，三个锦囊选一个`;
}

// 猜中奖池变 2.5 倍，可以收手也可以接着押；猜错奖池没了
export function guessPick(s: Save, pick: number): { win: boolean; answer: number; text: string } {
  const g = s.casino.guess;
  if (!g) return { win: false, answer: 0, text: '' };
  const answer = rollRng(s).int(0, 2);
  bump(s, 'guess');
  if (pick === answer) {
    g.pot = Math.floor(g.pot * K.guessMul);
    return { win: true, answer, text: `猜中了！奖池${g.pot}两，收手还是接着猜？` };
  }
  s.casino.net -= g.base;
  s.casino.guess = null;
  log(s, `猜猜看输了${g.base}两`);
  return { win: false, answer, text: `没猜中，锦囊在第${answer + 1}个。${g.base}两没了` };
}

export function guessCollect(s: Save): string {
  const g = s.casino.guess;
  if (!g) return '';
  s.player.silver += g.pot;
  s.casino.net += g.pot - g.base;
  s.casino.guess = null;
  log(s, `猜猜看赢了${g.pot - g.base}两`);
  return `收手，拿走${g.pot}两`;
}
