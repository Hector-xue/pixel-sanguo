// 主角成长：30 级性别专属招式、60 级心法二选一、100 级绝学，转职后心法升成「·极」。
// 招式在技能学校学（state.ts skillSchool），这里管心法：头一回选免费，以后改换要花银两。
import { classes } from '../data';
import { PASSIVES, XINFA } from '../core/passives';
import type { Save } from './state';
import { log } from './state';

export const XINFA_LEVEL = 60;

export function xinfaChoices(s: Save): [string, string] {
  return XINFA[s.player.classId];
}

// 战斗里挂在主角身上的被动键（没选、或者转职换了职业还没重选：没有）
export function xinfaKey(s: Save): string | undefined {
  const id = s.player.xinfa;
  if (!id || !xinfaChoices(s).includes(id)) return undefined;
  return s.p3.reborn ? `${id}_ji` : id;
}

export function xinfaCost(s: Save): number {
  return s.player.xinfa ? s.player.level * 300 : 0;
}

export function xinfaReason(s: Save, id: string): string {
  if (s.player.level < XINFA_LEVEL) return `${XINFA_LEVEL}级才能修心法`;
  if (!xinfaChoices(s).includes(id)) return `${classes[s.player.classId].name}修不了这门心法`;
  if (s.player.xinfa === id) return '正在修这一门';
  const cost = xinfaCost(s);
  if (s.player.silver < cost) return `改修要${cost}银两`;
  return '';
}

export function chooseXinfa(s: Save, id: string): string {
  const why = xinfaReason(s, id);
  if (why) return why;
  const cost = xinfaCost(s);
  s.player.silver -= cost;
  s.player.xinfa = id;
  const p = PASSIVES[xinfaKey(s)!];
  log(s, `修成心法【${p.name}】`);
  return `修成心法【${p.name}】：${p.desc}${cost ? `（花了${cost}银两）` : ''}`;
}

// 转职换了职业：心法按同一个位置换成新职业的那门（第一门换第一门）
export function rebirthXinfa(s: Save, from: keyof typeof XINFA): void {
  const id = s.player.xinfa;
  if (!id) return;
  const i = XINFA[from].indexOf(id);
  if (i >= 0) s.player.xinfa = xinfaChoices(s)[i];
}
