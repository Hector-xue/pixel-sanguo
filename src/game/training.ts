// 训练（随军操练）：挑一员不出战的副将跟着队伍走，每打赢一仗分到主角这一仗经验的一半。
// 单机不按真实时间算：关着游戏不涨，打得越多涨得越多。同一时间只操练一个。
import { balance } from '../data';
import { expToNext } from '../core/formulas';
import type { Save } from './state';
import { bump, findGeneral, grantGeneralExp, log, onFlag } from './state';

export const TRAIN_SHARE = 0.5;

export function trainee(s: Save): string | null {
  return s.p3.training?.who ?? null;
}

export function setTrainee(s: Save, uid: string | null): string {
  if (uid === null) {
    const old = trainee(s);
    s.p3.training = null;
    return old ? `${findGeneral(s, old)?.name ?? '副将'}不再随军操练` : '';
  }
  const g = findGeneral(s, uid);
  if (!g) return '';
  if (s.activeGeneral === uid) return '出战的副将本来就在拿经验，挑一个歇着的';
  s.p3.training = { who: uid };
  s.flags.trained = true;
  onFlag(s, 'trained');
  bump(s, 'trainings');
  log(s, `${g.name}开始随军操练`);
  return `${g.name}开始随军操练：之后每打赢一仗，分到你这一仗经验的一半`;
}

export function isTraining(s: Save, uid: string): boolean {
  return s.p3.training?.who === uid;
}

// 打赢一仗后调用：给操练的副将分经验
export function trainAfterBattle(s: Save, playerExp: number): { name: string; exp: number; lines: string[] } | null {
  const id = trainee(s);
  if (!id || playerExp <= 0) return null;
  const g = findGeneral(s, id);
  if (!g) {
    s.p3.training = null;
    return null;
  }
  const exp = Math.round(playerExp * TRAIN_SHARE);
  return { name: g.name, exp, lines: grantGeneralExp(g, exp) };
}

// 老存档：以前按小时挂着练的，按已练时长把经验一次给完，再改成随军操练
export function migrateTraining(s: Save, now = Date.now()): void {
  const t = s.p3.training as ({ who: string; start?: number; hours?: number } | null);
  if (!t || t.start === undefined) return;
  const hours = Math.min(t.hours ?? 0, Math.max(0, (now - t.start) / 3600000));
  const g = t.who === 'player' ? null : findGeneral(s, t.who);
  if (g) {
    const exp = Math.floor(hours * Math.round(expToNext(g.level) * balance.training.expRatioPerHour));
    if (exp > 0) grantGeneralExp(g, exp);
    s.p3.training = s.activeGeneral === g.uid ? null : { who: g.uid };
  } else s.p3.training = null;
}
