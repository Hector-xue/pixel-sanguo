// 功能逐级开放：前期界面只留用得上的几样，到了等级再一样样亮出来，亮的时候演一下「新功能开启」。
// 只管界面上的入口（各系统自己的等级门槛照旧）。老存档第一次进来：已经够级的直接算开过，不补演。
import type { Save } from './state';

export interface Unlock {
  key: string;
  name: string;
  lv: number;
  desc: string;
}

// 每样都排在主线第一次用到它之前（阵法 m15a、帮派 m38、擂台 m43、训练 m56）
export const UNLOCKS: Unlock[] = [
  { key: '阵法', name: '阵法', lv: 8, desc: '布阵给全队加攻防速，阵与阵首尾相克。开打前看一眼对面的阵，能克就换。' },
  { key: '排行', name: '排行', lv: 10, desc: '高手、富豪、战力、副将……十张榜，看看自己排第几。' },
  { key: '宝库', name: '宝库', lv: 10, desc: '商城、武将、仓库、名将羁绊都在这里。' },
  { key: '组队', name: '组队', lv: 20, desc: '雇一位江湖侠客同行，多一个人打仗。' },
  { key: '擂台', name: '擂台', lv: 30, desc: '和各路高手切磋，不掉血不掉药，赢了有奖。' },
  { key: '帮派', name: '帮派', lv: 34, desc: '去陈留找教派使者入教，做教派任务攒声望，职位越高加成越大。' },
  { key: '训练', name: '训练', lv: 40, desc: '挑一员不出战的副将随军操练，你打一仗，他也长一分本事。' },
  { key: '国战', name: '国战', lv: 60, desc: '投奔魏、蜀、吴其中一国，出征夺城、驻守前线，赛季按城数排名发奖。' },
];

const BY_KEY = new Map(UNLOCKS.map((u) => [u.key, u]));

export function isUnlocked(s: Save, key: string): boolean {
  const u = BY_KEY.get(key);
  return !u || s.player.level >= u.lv;
}

// 刚够级、还没演过的；第一次调用时把已经够级的全记成演过（老存档不补演）
export function pendingUnlocks(s: Save): Unlock[] {
  if (!s.flags.ulInit) {
    for (const u of UNLOCKS) if (s.player.level >= u.lv) s.flags[`ul_${u.key}`] = true;
    s.flags.ulInit = true;
    return [];
  }
  return UNLOCKS.filter((u) => s.player.level >= u.lv && !s.flags[`ul_${u.key}`]);
}

export function markUnlocked(s: Save, key: string): void {
  s.flags[`ul_${key}`] = true;
}

// 下一样要开的（功能菜单底下预告一行）
export function nextUnlock(s: Save): Unlock | null {
  return UNLOCKS.find((u) => s.player.level < u.lv) ?? null;
}
