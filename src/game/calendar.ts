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

// 今天（天下历）：各种「每天几次」都按它换天
export function today(s: Save): string {
  return calDay(calTick(s));
}

// 天下历这一天里的钟点（0～23），抢宝按它开
export function dayHour(t: number): number {
  return Math.floor(((t % DAY_BATTLES) * 24) / DAY_BATTLES);
}

// 用完了的提示：「再打N仗就到明天」
export function tomorrowHint(s: Save): string {
  return `再打${battlesToNextDay(calTick(s))}仗就到明天`;
}

// 老存档：擂台、抢宝、银两环、文曲星、幸运王、问答、送礼这些「每天几次」原来按真实日期记，
// 今天（真实日期）用掉的次数挪到天下历的今天；恶人值、摊位按真实时间攒下的先折算掉；赤壁没开的局退回押注
export function migrateDaily(s: Save, now = Date.now()): void {
  const t = calTick(s);
  const realDay = dayKey(now);
  const day = calDay(t);
  const map = (old: string) => (old === realDay ? day : '');
  const p3 = s.p3;
  for (const k of ['arena', 'duel', 'pk', 'treasure', 'silverRing', 'wenqu', 'lucky'] as const) p3[k].day = map(p3[k].day);
  if (s.quiz) s.quiz.day = map(s.quiz.day);
  for (const k of Object.keys(s.life)) {
    if (!k.startsWith('gift_')) continue;
    if (k === `gift_${realDay}`) s.life[`gift_${day}`] = s.life[k];
    delete s.life[k];
  }
  if (s.flags[`salary_${realDay}`]) s.flags[`salary_${day}`] = true;
  for (const k of Object.keys(s.flags)) if (k.startsWith('salary_') && k !== `salary_${day}`) delete s.flags[k];
  for (const [id, v] of Object.entries(s.p5.gifts)) {
    const [d, n] = v.split(':');
    if (d === realDay) s.p5.gifts[id] = `${day}:${n}`;
    else delete s.p5.gifts[id];
  }
  for (const [id, d] of Object.entries(s.p5.chatDay)) {
    if (d === realDay) s.p5.chatDay[id] = day;
    else delete s.p5.chatDay[id];
  }
  // 恶人值原来每小时消一点
  if (p3.evil > 0 && p3.evilAt) p3.evil = Math.max(0, p3.evil - Math.floor(Math.max(0, now - p3.evilAt) / 3600000));
  p3.evilAt = t;
  // 摊位原来每 10 分钟卖一轮，攒下没结的轮数留着
  const st = p3.stall;
  st.last = t - (st.goods.length && st.last ? Math.min(systems.stall.maxRounds, Math.floor(Math.max(0, now - st.last) / 600000)) : 0);
  const c = s.casino;
  if (c.chibi) {
    s.player.silver += c.chibi.bets.reduce((a, b) => a + b, 0);
    c.chibi = null;
  }
  s.p4.calV = 2;
}
