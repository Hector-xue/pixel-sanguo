// 今日事务：把每天有次数、有得领的事收成一张清单（还没解锁的不列），点一下去办。
import { systems } from '../data';
import { fightsLeft } from './arena';
import { calDay, calTick } from './calendar';
import { contestPending, kuaquLeft, kuaquOpen, leagueLeft } from './contest';
import { festivalKey, luckyDraws, silverRingLeft, treasureLeft, treasureNow, wenquToday } from './events';
import { ordersLeft, salary, salaryClaimed } from './guozhan';
import type { Save } from './state';
import { milestoneReady, suppliesReady } from './welfare';

export type DailyGo = 'welfare' | 'festival' | 'arena' | 'duel' | 'treasure' | 'wenqu' | 'lucky' | 'silverRing' | 'guozhan' | 'league' | 'kuaqu' | 'claims';

export interface DailyItem {
  go: DailyGo;
  name: string;
  detail: string;
  // 还有事可做（排在前面、计进红点）
  todo: boolean;
}

export function dailyItems(s: Save, t = calTick(s)): DailyItem[] {
  const out: DailyItem[] = [];
  const add = (go: DailyGo, name: string, detail: string, todo: boolean) => out.push({ go, name, detail, todo });
  const lv = s.player.level;

  const sup = suppliesReady(s);
  if (milestoneReady(s) || sup) add('welfare', '福利', [milestoneReady(s) ? '江湖行记可领' : '', sup ? `战备补给${sup}份` : ''].filter(Boolean).join('，'), true);
  const fk = festivalKey();
  if (fk && !s.p3.festival.includes(fk)) add('festival', '节日礼包', '今天过节，礼包还没领', true);

  const wq = wenquToday(s, t).left;
  add('wenqu', '文曲星答题', wq ? `还剩${wq}题` : '答完了', wq > 0);
  const lucky = Math.max(0, systems.lucky.free - luckyDraws(s, t));
  add('lucky', '幸运王', lucky ? `免费抽${lucky}次` : '免费的抽过了', lucky > 0);

  const ar = fightsLeft(s, 'arena', t);
  add('arena', '擂台', ar ? `还能挑战${ar}次` : '次数用完了', ar > 0);
  if (s.p3.arena.rank && !s.flags[`salary_${calDay(t)}`]) add('arena', '擂台俸禄', `第${s.p3.arena.rank}名的俸禄没领`, true);
  if (s.generals.length) {
    const du = fightsLeft(s, 'duel', t);
    add('duel', '斗将台', du ? `还能挑战${du}次` : '次数用完了', du > 0);
  }

  const tl = treasureLeft(s, t);
  if (tl) {
    const tr = treasureNow(s, t);
    add('treasure', '抢宝', tr.open ? `开着！还有${tr.left}仗的工夫（今天还能抢${tl}次）` : `下一场${tr.next}`, tr.open);
  } else add('treasure', '抢宝', '今天抢够了', false);

  if (lv >= systems.silverRing.minLevel) {
    const sr = silverRingLeft(s, t);
    const task = s.p3.silverRing.task;
    add('silverRing', '银两环', task ? '军资还没交' : sr ? `还能接${sr}次` : '今天够了', !!task || sr > 0);
  }

  if (lv >= systems.guozhan.minLevel) {
    if (!s.p4.nation) add('guozhan', '国战', '还没投奔哪一国', true);
    else {
      const od = ordersLeft(s, t);
      add('guozhan', '国战军令', od ? `还有${od}道` : '用完了', od > 0);
      if (salary(s) && !salaryClaimed(s, t)) add('guozhan', '国战俸禄', '今天的还没领', true);
    }
  }
  if (s.p3.sect.id && lv >= systems.guozhan.minLevel) {
    const lg = leagueLeft(s, t);
    add('league', '军团争霸', lg ? `今天还有${lg}阵` : '今天打完了', lg > 0);
  }
  if (lv >= systems.kuaqu.minLevel && kuaquOpen(t)) {
    const kl = kuaquLeft(s, t);
    add('kuaqu', '诸州会武', kl ? `还有${kl}个对手` : '今天打完了', kl > 0);
  }
  if (contestPending(s, t) || s.p4.seasonClaim) add('claims', '赛季奖励', '国战、争霸或会武有奖励可领', true);

  // 有事的排前面，同类按原来的顺序
  return [...out.filter((x) => x.todo), ...out.filter((x) => !x.todo)];
}

export function dailyCount(s: Save): number {
  return dailyItems(s).filter((x) => x.todo).length;
}
