// 婚姻（洛阳月老，和 NPC 成亲）、结拜（和默契够高的副将）、组队（雇 AI 队友跟着打）。
import { classes, CLASS_IDS, systems } from '../data';
import type { BUnit } from '../core/battle';
import type { ClassId } from '../core/types';
import { mirrorUnit } from './rivals';
import type { Save } from './state';
import { bump, dayKey, findGeneral, log, playerStats, rollRng } from './state';

const M = systems.marriage;

export function candidates(s: Save) {
  return s.player.gender === 'male' ? M.female : M.male;
}

export function candidateName(id: string): string {
  return [...M.female, ...M.male].find((c) => c.id === id)?.name ?? '';
}

export function giftCost(s: Save): number {
  return s.player.level * M.giftSilverPerLevel;
}

export function giftsLeft(s: Save, now = Date.now()): number {
  const key = `gift_${dayKey(now)}`;
  return Math.max(0, M.giftsPerDay - (s.life[key] ?? 0));
}

export function giveGift(s: Save, id: string, now = Date.now()): string {
  if (s.p3.marriage.spouse) return '你已经成亲了';
  if (!candidates(s).some((c) => c.id === id)) return '';
  if (giftsLeft(s, now) <= 0) return '今天送得够多了，明天再来';
  const cost = giftCost(s);
  if (s.player.silver < cost) return `礼物要${cost}两银子`;
  s.player.silver -= cost;
  // 旧的每日计数清掉，只留今天的
  for (const k of Object.keys(s.life)) if (k.startsWith('gift_') && k !== `gift_${dayKey(now)}`) delete s.life[k];
  bump(s, `gift_${dayKey(now)}`);
  const rng = rollRng(s);
  const add = rng.int(M.favorPerGift[0], M.favorPerGift[1]);
  const f = s.p3.marriage.favor;
  f[id] = Math.min(100, (f[id] ?? 0) + add);
  s.p3.charm += M.charmPerGift;
  return `${candidateName(id)}收下了礼物，好感+${add}（${f[id]}/100），魅力+${M.charmPerGift}`;
}

export function marry(s: Save, id: string): string {
  if (s.p3.marriage.spouse) return '你已经成亲了';
  if ((s.p3.marriage.favor[id] ?? 0) < 100) return '好感还不够100';
  if (s.player.silver < M.weddingSilver) return `办喜事要${M.weddingSilver}两`;
  s.player.silver -= M.weddingSilver;
  s.p3.marriage.spouse = id;
  bump(s, 'married');
  log(s, `${s.player.name}和${candidateName(id)}成亲了`);
  return `恭喜！${s.player.name}和${candidateName(id)}结为夫妻。配偶会让你气血更足`;
}

export function divorce(s: Save): string {
  const id = s.p3.marriage.spouse;
  if (!id) return '';
  s.p3.marriage.spouse = null;
  s.p3.marriage.favor[id] = 0;
  return `和${candidateName(id)}和离了`;
}

// ===== 结拜：默契够高的副将最多两个，结拜后忠诚不掉、属性 +10% =====
export function swornReason(s: Save, uid: string): string {
  const g = findGeneral(s, uid);
  if (!g) return '';
  if (s.p3.marriage.sworn.includes(uid)) return '已经结拜了';
  if (s.p3.marriage.sworn.length >= M.swornMax) return `最多和${M.swornMax}个副将结拜`;
  if (g.grade === '常人') return '常人副将不能结拜';
  if (g.rapport < M.swornRapport) return `默契要到${M.swornRapport}`;
  return '';
}

export function swear(s: Save, uid: string): string {
  const why = swornReason(s, uid);
  if (why) return why;
  const g = findGeneral(s, uid)!;
  s.p3.marriage.sworn.push(uid);
  g.sworn = true;
  g.loyalty = 100;
  log(s, `和${g.name}结为异姓兄弟`);
  return `和${g.name}结拜了！${g.name}忠诚不再下降，属性+${Math.round(M.swornMul * 100)}%`;
}

export function isSworn(s: Save, uid: string): boolean {
  return !!s.p3?.marriage.sworn.includes(uid);
}

// ===== 组队：雇一个 AI 队友 N 场 =====
const MC = systems.merc;

export function mercCost(s: Save): number {
  return s.player.level * MC.silverPerLevel;
}

export function hireMerc(s: Save, cls: ClassId): string {
  if (s.p3.merc) return `已经雇了一个，还能打${s.p3.merc.battles}场`;
  const cost = mercCost(s);
  if (s.player.silver < cost) return `雇一个要${cost}两`;
  s.player.silver -= cost;
  s.p3.merc = { id: cls, battles: MC.battles };
  return `雇到一个${classes[cls].name}队友，跟你打${MC.battles}场`;
}

export function dismissMerc(s: Save): string {
  s.p3.merc = null;
  return '队友走了';
}

export function mercUnit(s: Save): BUnit | null {
  const m = s.p3.merc;
  if (!m || m.battles <= 0) return null;
  const cls = (CLASS_IDS as string[]).includes(m.id) ? (m.id as ClassId) : 'warrior';
  const lv = Math.max(1, s.player.level + MC.levelOffset);
  const u = mirrorUnit('merc', `${classes[cls].name}队友`, cls, 'male', 1, lv, 'ally');
  // 队友比主角弱一截
  const st = playerStats(s);
  u.maxHp = Math.min(u.maxHp, st.maxHp);
  u.hp = u.maxHp;
  u.row = 1;
  return u;
}

export function mercUsed(s: Save): string | null {
  const m = s.p3.merc;
  if (!m) return null;
  m.battles--;
  if (m.battles <= 0) {
    s.p3.merc = null;
    return '雇的队友合同到期，走了';
  }
  return null;
}
