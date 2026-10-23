// 转职（洛阳左慈）：100 级以后重选性别、职业、头像。等级不变，加过的属性点全部退回重加，再多给一些；
// 技能按顺序（性别专属、通用一、通用二、30 级专属、100 级绝学）把等级和熟练度带到新职业，心法换成新职业同位置的那门。职业不对的武器自动卸下。
// 副将 100 级以后也能转一次（花大将军令），转了才能继续升级。
import { balance, classes, playerSkillIds } from '../data';
import { rebirthXinfa } from './growth';
import { weaponClassOk } from '../core/gear';
import type { ClassId, Gender } from '../core/types';
import { ATTR_KEYS } from '../core/types';
import type { Save } from './state';
import { bagCount, bump, findGeneral, generalStats, log, onFlag, playerStats, removeItem } from './state';

const RB = balance.rebirth;

export function canRebirth(s: Save): string {
  if (s.player.level < RB.level) return `${RB.level}级才能转职`;
  if (s.p3.reborn >= 1) return '已经转过职了';
  return '';
}

export function rebirth(s: Save, classId: ClassId, gender: Gender, avatar: number): string {
  const why = canRebirth(s);
  if (why) return why;
  const p = s.player;
  // 进阶招式（30 级专属、100 级绝学）也按位置带过去
  const old = playerSkillIds(p.classId, p.gender).map((id) => p.skills.find((x) => x.id === id));
  const fresh = playerSkillIds(classId, gender);
  p.skills = fresh.map((id, i) => (old[i] ? { id, level: old[i]!.level, prof: old[i]!.prof } : null)).filter(Boolean) as typeof p.skills;
  const fromClass = p.classId;
  // 退回加过的点
  const back = ATTR_KEYS.reduce((n, k) => n + p.added[k], 0);
  p.added = { con: 0, str: 0, int: 0, agi: 0 };
  p.free += back + RB.bonusPoints;
  const was = classes[p.classId].name;
  p.classId = classId;
  p.gender = gender;
  p.avatar = avatar;
  s.p3.reborn++;
  rebirthXinfa(s, fromClass);
  // 职业不合的武器卸进背包
  const w = s.equip.weapon;
  if (w && !weaponClassOk(w, classId)) {
    // 负重满了也硬塞进背包，免得穿着别的职业的武器
    delete s.equip.weapon;
    s.gear.push(w);
  }
  const st = playerStats(s);
  p.hp = st.maxHp;
  p.mp = st.maxMp;
  s.flags.reborn = true;
  s.flags.capNotice = false;
  onFlag(s, 'reborn');
  bump(s, 'rebirths');
  log(s, `${p.name}转职了：${was} → ${classes[classId].name}（${s.p3.reborn}转）`);
  return `脱胎换骨！现在是${classes[classId].name}（${s.p3.reborn}转），等级上限提到${balance.levelCap}级，有${p.free}个属性点可以重新分配`;
}

export function generalRebirthReason(s: Save, uid: string): string {
  const g = findGeneral(s, uid);
  if (!g) return '';
  if (g.reborn) return '已经转过了';
  if (g.level < RB.level) return `副将${RB.level}级才能转`;
  if (!s.p3.reborn) return '主角先转职';
  if (bagCount(s, 'dajiangjunling') < 1) return '要1个大将军令';
  return '';
}

export function generalRebirth(s: Save, uid: string): string {
  const why = generalRebirthReason(s, uid);
  if (why) return why;
  const g = findGeneral(s, uid)!;
  removeItem(s, 'dajiangjunling', 1);
  g.reborn = 1;
  g.apt.growth = Math.round((g.apt.growth + 0.1) * 100) / 100;
  const st = generalStats(g);
  g.hp = st.maxHp;
  g.mp = st.maxMp;
  log(s, `副将${g.name}转生了`);
  return `${g.name}转生了：成长+0.1，可以继续升到${balance.levelCap}级`;
}
