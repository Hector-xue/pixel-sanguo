// 天下历：国战、军团争霸、诸州会武共用的日子。打一仗走一格（切磋也算），DAY_BATTLES 仗一天，七天一个赛季，
// 国战 AI 一天走 24 回合。原来这几样按真实的小时、星期走，不玩就干等，现在只跟着你打的仗走
import { systems } from '../data';
import type { Save } from './state';
import { dayKey, dayNum } from './state';

const G = systems.guozhan;
const DAY = 86400000;
export const DAY_BATTLES: number = G.dayBattles;
export const SEASON_DAYS: number = G.seasonDays;
export const SEASON_BATTLES = DAY_BATTLES * SEASON_DAYS;
export const TURNS = SEASON_DAYS * 24;

// 天下历走了几格：总战斗场数减去老存档换算时记下的底数
export function calTick(s: Save): number {
  return Math.max(0, s.battles - (s.p4.calBase ?? 0));
}

// 第几个赛季（从 0 起）
export function weekIndex(t: number): number {
  return Math.floor(t / SEASON_BATTLES);
}

// 赛季里的第几天：0 = 第一天 … 6 = 第七天
export function weekday(t: number): number {
  return Math.floor(t / DAY_BATTLES) % SEASON_DAYS;
}

// 「哪一天」的键：军令、俸禄、会武对手按它换
export function calDay(t: number): string {
  return `${weekIndex(t)}-${weekday(t)}`;
}

// 赛季里走到第几回合（一天 24 回合）
export function turnOf(t: number): number {
  return Math.floor(((t % SEASON_BATTLES) * TURNS) / SEASON_BATTLES);
}

// 再打几仗进下一天
export function battlesToNextDay(t: number): number {
  return DAY_BATTLES - (t % DAY_BATTLES);
}

// 老存档：原来按真实时间算的赛季、回合、哪天用了几道军令，换算到天下历上，当天的进度不丢
export function migrateCalendar(s: Save, now = Date.now()): void {
  const p = s.p4;
  const realWeek = Math.floor((dayNum(now) + 3) / 7);
  const local = now - new Date(now).getTimezoneOffset() * 60000;
  const hours = Math.max(0, Math.min(TURNS - 1, Math.floor((local - (realWeek * 7 - 3) * DAY) / 3600000)));
  const t = Math.min(SEASON_BATTLES - 1, Math.floor((hours * SEASON_BATTLES) / TURNS));
  p.calBase = s.battles - t;
  const wk = (old: number) => (old === realWeek ? 0 : -1);
  if (p.world) p.world.season = wk(p.world.season);
  p.league.week = wk(p.league.week);
  p.kuaqu.week = wk(p.kuaqu.week);
  const today = dayKey(now);
  const day = (old: string) => (old === today ? calDay(t) : '');
  p.orders.day = day(p.orders.day);
  p.salaryDay = day(p.salaryDay);
  p.kuaqu.day = day(p.kuaqu.day);
  // 入国时间：真实天数折成天下历的格数
  if (p.joinedAt > 0) p.joinedAt = t - Math.round(((now - p.joinedAt) / DAY) * DAY_BATTLES);
}
