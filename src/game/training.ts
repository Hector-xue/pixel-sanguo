// 训练：交银两让主角或某个副将挂着练，按真实时间涨经验（关了游戏也算）。周末半价（原版 VIP3 周末半价，单机版人人都有）。
// 训练中的副将不能出战；主角训练时照常行动，只是同一时间只能训练一个对象。
import { balance } from '../data';
import { expToNext } from '../core/formulas';
import type { Save } from './state';
import { bump, findGeneral, grantGeneralExp, grantPlayerExp, log, onFlag } from './state';

const T = balance.training;

export function trainCost(s: Save, who: string, hours: number, now = Date.now()): number {
  const lv = who === 'player' ? s.player.level : findGeneral(s, who)?.level ?? 1;
  const day = new Date(now).getDay();
  const weekend = day === 0 || day === 6;
  return Math.round(lv * T.silverPerLevelHour * hours * (weekend ? 0.5 : 1));
}

export function trainExpPerHour(s: Save, who: string): number {
  const lv = who === 'player' ? s.player.level : findGeneral(s, who)?.level ?? 1;
  return Math.round(expToNext(lv) * T.expRatioPerHour);
}

export function startTraining(s: Save, who: string, hours: number, now = Date.now()): string {
  if (s.p3.training) return '已经有人在训练了，先结束那一个';
  if (!T.hours.includes(hours)) return '';
  if (who !== 'player') {
    const g = findGeneral(s, who);
    if (!g) return '';
    if (s.activeGeneral === who) return '出战的副将不能训练，先设成休息';
  }
  const cost = trainCost(s, who, hours, now);
  if (s.player.silver < cost) return `银两不够，要${cost}两`;
  s.player.silver -= cost;
  s.p3.training = { who, start: now, hours };
  s.flags.trained = true;
  onFlag(s, 'trained');
  bump(s, 'trainings');
  const name = who === 'player' ? s.player.name : findGeneral(s, who)!.name;
  log(s, `${name}开始训练${hours}小时，花了${cost}两`);
  return `${name}开始训练${hours}小时（花费${cost}两）`;
}

export function trainingProgress(s: Save, now = Date.now()): { hours: number; done: boolean; exp: number } | null {
  const t = s.p3.training;
  if (!t) return null;
  const h = Math.min(t.hours, (now - t.start) / 3600000);
  return { hours: h, done: h >= t.hours, exp: Math.floor(h * trainExpPerHour(s, t.who)) };
}

// 结束训练（没到时间也可以提前结束，按已练的时长给经验，银两不退）
export function endTraining(s: Save, now = Date.now()): string[] {
  const p = trainingProgress(s, now);
  const t = s.p3.training;
  if (!p || !t) return ['没有在训练'];
  s.p3.training = null;
  if (t.who === 'player') return [`训练结束，经验+${p.exp}`, ...grantPlayerExp(s, p.exp)];
  const g = findGeneral(s, t.who);
  if (!g) return ['那个副将已经不在了'];
  return [`${g.name}训练结束，经验+${p.exp}`, ...grantGeneralExp(g, p.exp)];
}

export function isTraining(s: Save, uid: string): boolean {
  return s.p3.training?.who === uid;
}
