// 副将养成：招贤（将军令/大将军令/令牌）、心法书迅速升级、奖赏忠诚、洗资质、升星、学技能（学什么变什么职业）
import { balance, classSkills, classes, items, recruits, skills, CLASS_IDS } from '../data';
import type { RecruitDef } from '../data';
import { Rng } from '../core/rng';
import type { ClassId } from '../core/types';
import { ATTR_KEYS } from '../core/types';
import type { General, Grade, Save } from './state';
import {
  addGeneral, bagCount, bump, findGeneral, generalStats, grantGeneralExp, huajingReason, log, onFlag, profCap, removeItem, rollApt, rollRng,
} from './state';

const G = balance.general;
const PER = (balance.autoAttrPerLevel * 4 + balance.freePointsPerLevel) / 4;

export function recruitDef(id: string): { def: RecruitDef; grade: Grade } | null {
  const y = recruits.yingcai.find((d) => d.id === id);
  if (y) return { def: y, grade: '英才' };
  const j = recruits.jiangcai.find((d) => d.id === id);
  if (j) return { def: j, grade: '将才' };
  return null;
}

export function makeRecruit(s: Save, def: RecruitDef, grade: Grade, level: number, rng: Rng): General {
  const A = balance.generalAptitude[grade];
  const cb = classes[def.class].baseAttrs;
  const base = { con: 0, str: 0, int: 0, agi: 0 };
  for (const k of ATTR_KEYS) base[k] = Math.round(cb[k] * A.baseMul + (level - 1) * PER * A.baseMul);
  const g: General = {
    uid: `g${s.nextUid++}`,
    monsterId: '',
    recruitId: def.id,
    name: def.name,
    classId: def.class,
    gender: def.gender,
    look: def.look,
    baseLook: def.look,
    grade,
    level,
    exp: 0,
    apt: rollApt(grade, rng),
    base,
    baseLevel: level,
    hp: 0,
    mp: 0,
    loyalty: 100,
    rapport: 0,
    star: 0,
    skills: [],
  };
  const st = generalStats(g);
  g.hp = st.maxHp;
  g.mp = st.maxMp;
  return g;
}

export function ownsRecruit(s: Save, id: string): boolean {
  return [...s.generals, ...s.inn].some((g) => g.recruitId === id);
}

export function recruitLevel(s: Save): number {
  return Math.max(1, s.player.level - G.recruitLevelBelowPlayer);
}

// 招一个指定的名将（签到、令牌、宝箱都走这里）
export function giveRecruit(s: Save, id: string): string {
  const r = recruitDef(id);
  if (!r) return '';
  const g = makeRecruit(s, r.def, r.grade, recruitLevel(s), rollRng(s));
  const line = addGeneral(s, g);
  bump(s, 'recruits');
  s.flags.recruited = true;
  onFlag(s, 'recruited');
  log(s, `招募了${r.grade}${g.name}`);
  return line;
}

// 从某个品级里随机招一个，优先招还没有的
export function giveRandomRecruit(s: Save, grade: Grade): string {
  const pool = grade === '将才' ? recruits.jiangcai : recruits.yingcai;
  const rng = rollRng(s);
  const fresh = pool.filter((d) => !ownsRecruit(s, d.id));
  const def = rng.pick(fresh.length ? fresh : pool);
  return giveRecruit(s, def.id);
}

export interface RecruitOption {
  item: string;
  label: string;
  have: number;
}

export function recruitOptions(s: Save): RecruitOption[] {
  const out: RecruitOption[] = [
    { item: 'jiangjunling', label: '用将军令招募英才', have: bagCount(s, 'jiangjunling') },
    { item: 'dajiangjunling', label: '用大将军令招募将才', have: bagCount(s, 'dajiangjunling') },
  ];
  for (const [tok, id] of Object.entries(recruits.tokens)) {
    const r = recruitDef(id);
    if (r) out.push({ item: tok, label: `用${items[tok].name}招募${r.def.name}`, have: bagCount(s, tok) });
  }
  return out;
}

export function recruitWith(s: Save, item: string): string {
  if (!removeItem(s, item, 1)) return `没有${items[item]?.name ?? '令'}`;
  if (item === 'jiangjunling') return giveRandomRecruit(s, '英才');
  if (item === 'dajiangjunling') return giveRandomRecruit(s, '将才');
  const id = recruits.tokens[item];
  if (id) return giveRecruit(s, id);
  return '';
}

// ===== 心法书：迅速升级 =====
export function readXinfa(s: Save, uid: string, item: string): string {
  const g = findGeneral(s, uid);
  const def = items[item];
  if (!g || def?.use !== 'xinfa') return '';
  if (g.level >= s.player.level + 5) return `副将等级不能比主角高5级以上`;
  if (!removeItem(s, item, 1)) return `没有${def.name}`;
  const lines = grantGeneralExp(g, def.amount ?? 0);
  return [`${g.name}读了${def.name}，经验+${def.amount}`, ...lines].join('\n');
}

// ===== 奖赏：加忠诚 =====
export function rewardCost(g: General): number {
  return g.level * G.rewardCostPerLevel;
}

export function rewardGeneral(s: Save, uid: string): string {
  const g = findGeneral(s, uid);
  if (!g) return '';
  if (g.loyalty >= 100) return `${g.name}的忠诚已经满了`;
  const cost = rewardCost(g);
  if (s.player.silver < cost) return `银两不足，奖赏需要${cost}两`;
  s.player.silver -= cost;
  g.loyalty = Math.min(100, g.loyalty + G.rewardLoyalty);
  return `奖赏${g.name}${cost}两，忠诚+${G.rewardLoyalty}（${g.loyalty}/100）`;
}

// 随行的副将每打 LOYALTY_EVERY 场忠诚掉一点（客栈里歇着的不掉；结拜过的不掉）
export const LOYALTY_EVERY = 30;
export function decayLoyalty(s: Save, times = 1): boolean {
  let any = false;
  for (const g of s.generals) {
    if (g.sworn || g.loyalty <= 0) continue;
    g.loyalty = Math.max(0, g.loyalty - G.loyaltyDecayDaily * times);
    any = true;
  }
  return any;
}

// ===== 洗资质 =====
export function rerollApt(s: Save, uid: string): string {
  const g = findGeneral(s, uid);
  if (!g) return '';
  if (!removeItem(s, 'jiangjunling', 1)) return '洗资质需要1个将军令';
  const before = g.apt.growth;
  g.apt = rollApt(g.grade, rollRng(s));
  const st = generalStats(g);
  g.hp = Math.min(g.hp, st.maxHp);
  g.mp = Math.min(g.mp, st.maxMp);
  return `${g.name}的资质重洗了：成长 ${before.toFixed(2)} → ${g.apt.growth.toFixed(2)}`;
}

// ===== 升星 =====
export function starCost(g: General): { level: number; tokens: number; silver: number } {
  const n = g.star + 1;
  return { level: n * G.starLevelPer, tokens: n, silver: n * G.starSilverPer };
}

export function starUp(s: Save, uid: string): string {
  const g = findGeneral(s, uid);
  if (!g) return '';
  if (g.star >= G.starMax) return `已经${G.starMax}星了`;
  const c = starCost(g);
  if (g.level < c.level) return `${c.level}级才能升到${g.star + 1}星`;
  if (bagCount(s, 'jiangjunling') < c.tokens) return `需要${c.tokens}个将军令`;
  if (s.player.silver < c.silver) return `需要${c.silver}两银子`;
  removeItem(s, 'jiangjunling', c.tokens);
  s.player.silver -= c.silver;
  g.star++;
  return `${g.name}升到了${g.star}星，气血、攻击、防御、速度提高`;
}

// ===== 学技能：学了什么技能就变成什么职业，外形跟着变 =====

// 换职业后的外形：保留脸和发型，换成那个职业的服饰和兵器
export function classLook(base: string, cls: ClassId): string {
  return `cls:${base}:${cls}`;
}

export interface GenSkillRow {
  id: string;
  cls: ClassId;
  level: number | null;
  prof: number;
  action: 'learn' | 'upgrade' | null;
  reason: string;
  changesClass: boolean;
}

export function generalSkillRows(g: General): GenSkillRow[] {
  const out: GenSkillRow[] = [];
  for (const cls of CLASS_IDS) {
    for (const id of classSkills(cls, g.gender)) {
      const def = skills[id];
      const st = g.skills.find((x) => x.id === id);
      const row: GenSkillRow = { id, cls, level: st?.level ?? null, prof: st?.prof ?? 0, action: null, reason: '', changesClass: cls !== g.classId };
      if (g.grade === '常人') row.reason = '常人不能学技能';
      else if (st) {
        if (st.level > balance.skill.maxLevel) row.reason = '已入化境';
        else if (st.level === balance.skill.maxLevel) {
          row.reason = huajingReason(g.level, st);
          if (!row.reason) row.action = 'upgrade';
        } else if (st.prof < profCap(st.level)) row.reason = `熟练度${st.prof}/${profCap(st.level)}`;
        else if (g.level < st.level * balance.skill.roleLevelPerSkillLevel) row.reason = `副将${st.level * balance.skill.roleLevelPerSkillLevel}级可升`;
        else row.action = 'upgrade';
      } else if (g.level < Math.max(G.skillMinLevel, def.learnLevel)) row.reason = `副将${Math.max(G.skillMinLevel, def.learnLevel)}级可学`;
      else if (!row.changesClass && g.skills.length >= G.maxSkills) row.reason = `最多学${G.maxSkills}个`;
      else row.action = 'learn';
      out.push(row);
    }
  }
  return out;
}

export function generalLearn(s: Save, uid: string, skillId: string): string {
  const g = findGeneral(s, uid);
  if (!g) return '';
  const row = generalSkillRows(g).find((r) => r.id === skillId);
  if (!row || row.action !== 'learn') return row?.reason || '不能学';
  if (s.activeGeneral === uid) return '先把这个副将设成「休息」再学技能';
  if (row.changesClass) {
    g.classId = row.cls;
    g.skills = [];
    g.look = classLook(g.baseLook ?? g.look, row.cls);
  }
  g.skills.push({ id: skillId, level: 1, prof: 0 });
  const st = generalStats(g);
  g.hp = Math.min(g.hp, st.maxHp);
  g.mp = Math.min(g.mp, st.maxMp);
  return `${g.name}学会了${skills[skillId].name}${row.changesClass ? `，职业变成了${classes[row.cls].name}` : ''}`;
}

export function generalUpgrade(s: Save, uid: string, skillId: string): string {
  const g = findGeneral(s, uid);
  if (!g) return '';
  const row = generalSkillRows(g).find((r) => r.id === skillId);
  const st = g.skills.find((x) => x.id === skillId);
  if (!row || row.action !== 'upgrade' || !st) return row?.reason || '不能升级';
  st.level++;
  return `${g.name}的${skills[skillId].name}${st.level > balance.skill.maxLevel ? '进入化境' : `升到了${st.level}级`}`;
}

// 招贤使者能用的副将（技能书、心法书的对象选择也用它）
export function allGenerals(s: Save): General[] {
  return [...s.generals, ...s.inn];
}
