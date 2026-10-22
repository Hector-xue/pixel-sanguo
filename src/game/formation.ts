// 阵法：战前选一个阵，全队吃加成；五个阵首尾相克（锋矢克鹤翼、鹤翼克长蛇、长蛇克八卦、八卦克鱼鳞、鱼鳞克锋矢），
// 克住对面的一方攻击再加一成、被克的攻击少一点。敌人 12 级以上的怪群有的会列阵，名将、首领一定列阵。
// 只在野外和剧情战斗里生效（开战时直接改双方的数值，战斗规则本身不变，所以录像照样能复现）
import { monsters } from '../data';
import type { MonsterGroup } from '../data';
import type { BUnit } from '../core/battle';
import type { Save } from './state';
import { onFlag } from './state';

export type FormId = 'changshe' | 'fengshi' | 'yulin' | 'heyi' | 'bagua';

export interface FormDef {
  name: string;
  lv: number;
  desc: string;
  atk?: number;
  def?: number;
  spd?: number;
  crit?: number;
  dodge?: number;
  counter?: number;
  resist?: number;
}

export const FORMS: Record<FormId, FormDef> = {
  changshe: { name: '长蛇阵', lv: 1, desc: '速度+10%', spd: 0.1 },
  fengshi: { name: '锋矢阵', lv: 10, desc: '攻击+12%，防御-5%', atk: 0.12, def: -0.05 },
  yulin: { name: '鱼鳞阵', lv: 20, desc: '防御+15%，速度-5%', def: 0.15, spd: -0.05 },
  heyi: { name: '鹤翼阵', lv: 35, desc: '暴击+6、闪避+3', crit: 6, dodge: 3 },
  bagua: { name: '八卦阵', lv: 50, desc: '各项抗性+10、反击+5', resist: 10, counter: 5 },
};
export const FORM_ORDER: FormId[] = ['changshe', 'fengshi', 'yulin', 'heyi', 'bagua'];

// a 克 BEATS[a]
export const BEATS: Record<FormId, FormId> = { fengshi: 'heyi', heyi: 'changshe', changshe: 'bagua', bagua: 'yulin', yulin: 'fengshi' };
const WIN_ATK = 0.1;
const LOSE_ATK = -0.08;

export function formUnlocked(s: Save, id: FormId): boolean {
  return s.player.level >= FORMS[id].lv;
}

export function myFormation(s: Save): FormId {
  const id = (s.p5.formation ?? 'changshe') as FormId;
  return FORMS[id] && formUnlocked(s, id) ? id : 'changshe';
}

export function setFormation(s: Save, id: FormId): string {
  if (!FORMS[id]) return '';
  if (!formUnlocked(s, id)) return `${FORMS[id].lv}级才能布${FORMS[id].name}`;
  s.p5.formation = id;
  s.flags.formationSet = true;
  onFlag(s, 'formationSet');
  return `改布${FORMS[id].name}（${FORMS[id].desc}）`;
}

// 谁克谁：1 = a 克 b，-1 = b 克 a，0 = 互不相克
export function clash(a: FormId | null, b: FormId | null): 1 | -1 | 0 {
  if (!a || !b) return 0;
  if (BEATS[a] === b) return 1;
  if (BEATS[b] === a) return -1;
  return 0;
}

function hash(str: string): number {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

// 敌人列什么阵（同一群怪每次都一样，好让玩家记住、提前换阵）
export function enemyFormation(group: MonsterGroup): FormId | null {
  const lv = group.level[0];
  const all = [group.monster, group.escort?.monster].filter(Boolean) as string[];
  const leader = all.some((m) => monsters[m].boss || monsters[m].historic);
  if (lv < 12 && !leader) return null;
  const h = hash(group.monster + (group.label ?? ''));
  if (!leader && h % 10 < 4) return null;
  const pool = FORM_ORDER.filter((id) => FORMS[id].lv <= Math.max(lv, 10));
  return pool[(h >>> 4) % pool.length];
}

// 给一方所有人套上阵法和克制的加成
export function applyFormation(units: BUnit[], id: FormId | null, won: 1 | -1 | 0): void {
  if (!id && !won) return;
  const f = id ? FORMS[id] : null;
  const atkMul = 1 + (f?.atk ?? 0) + (won === 1 ? WIN_ATK : won === -1 ? LOSE_ATK : 0);
  for (const u of units) {
    u.atk = Math.max(1, Math.round(u.atk * atkMul));
    if (!f) continue;
    if (f.def) u.def = Math.max(1, Math.round(u.def * (1 + f.def)));
    if (f.spd) u.spd = Math.max(1, Math.round(u.spd * (1 + f.spd)));
    if (f.crit) u.rates.crit += f.crit;
    if (f.dodge) u.rates.dodge += f.dodge;
    if (f.counter) u.rates.counter += f.counter;
    if (f.resist) for (const k of Object.keys(u.resist) as (keyof BUnit['resist'])[]) u.resist[k] += f.resist;
  }
}

// 对上这一群最好用哪个阵：能克它就用克它的，否则用解锁了的里面最靠后的（锋矢以上）
export function bestFormation(s: Save, enemy: FormId | null): FormId {
  const open = FORM_ORDER.filter((id) => formUnlocked(s, id));
  const beat = open.find((id) => BEATS[id] === enemy);
  if (beat) return beat;
  const safe = open.filter((id) => clash(id, enemy) !== -1);
  return safe.includes('fengshi') ? 'fengshi' : safe[safe.length - 1] ?? 'changshe';
}

export function clashText(mine: FormId, enemy: FormId | null): string {
  if (!enemy) return `我方${FORMS[mine].name}，对面没有列阵`;
  const c = clash(mine, enemy);
  return `我方${FORMS[mine].name}${c === 1 ? '克制' : c === -1 ? '被' : '对'}${c === -1 ? '' : '敌方'}${FORMS[enemy].name}${c === -1 ? '克制' : c === 0 ? '，互不相克' : ''}`;
}
