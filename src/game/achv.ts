// 成就、称号、排行榜。成就达成自动发奖并给称号；称号在角色面板里换。排行榜把主角和 AI 名册放在一起排。
import { systems } from '../data';
import { generalStats, sectRank } from './state';
import type { Save } from './state';
import { log } from './state';
import { casinoTitle } from './casino';
import { evilNow, ladder } from './arena';
import { rivalLevel, rivals } from './rivals';
import { sectBoard } from './sect';
import { grantReward } from './welfare';

export type AchvDef = (typeof systems.achv)[number];

function metric(s: Save, key: string): number {
  switch (key) {
    case 'level':
      return s.player.level;
    case 'reborn':
      return s.p3.reborn;
    case 'kills':
      return Object.values(s.kills).reduce((a, b) => a + b, 0);
    case 'generals':
      return s.generals.length + s.inn.length;
    case 'jiangcai':
      return [...s.generals, ...s.inn].filter((g) => g.grade === '将才').length;
    case 'arenaTop':
      return s.p3.arena.best ? -s.p3.arena.best : -999;
    case 'duelTop':
      return s.p3.duel.best ? -s.p3.duel.best : -999;
    case 'sectRank':
      return s.p3.sect.id ? sectRank(s.p3.sect.rep) : -1;
    case 'wealth':
      return s.player.silver + s.bank;
    case 'evil':
      return s.p3.evil;
    case 'married':
      return s.p3.marriage.spouse ? 1 : 0;
    case 'luck':
      return s.p3.lucky.luck;
    case 'mainDone':
      return s.main.state === 'done' ? 1 : 0;
    default:
      return s.life[key] ?? 0;
  }
}

// 名次类的成就（越小越好）用负数比较
function reached(s: Save, a: AchvDef): boolean {
  const v = metric(s, a.key);
  return a.key.endsWith('Top') ? v >= -a.need : v >= a.need;
}

export function achvProgress(s: Save, a: AchvDef): string {
  const v = metric(s, a.key);
  if (a.key.endsWith('Top')) return v === -999 ? '未上榜' : `第${-v}名`;
  return `${Math.min(v, a.need)}/${a.need}`;
}

// 检查新达成的成就：发奖、加称号，返回提示
export function checkAchievements(s: Save, now = Date.now()): string[] {
  const out: string[] = [];
  for (const a of systems.achv) {
    if (s.p3.achv[a.id] || !reached(s, a)) continue;
    s.p3.achv[a.id] = now;
    const lines = grantReward(s, a.reward);
    if (a.title && !s.p3.titles.includes(a.title)) {
      s.p3.titles.push(a.title);
      lines.push(`获得称号「${a.title}」`);
    }
    out.push(`达成成就【${a.name}】${lines.length ? '：' + lines.join('，') : ''}`);
    log(s, `达成成就【${a.name}】`);
  }
  return out;
}

// 能用的称号：成就给的 + 娱乐场称号
export function allTitles(s: Save): string[] {
  const t = [...s.p3.titles];
  const c = casinoTitle(s.casino.net);
  if (c && c !== '无' && !t.includes(c)) t.push(c);
  return t;
}

export function setTitle(s: Save, t: string | null): string {
  if (t && !allTitles(s).includes(t)) return '';
  s.p3.title = t;
  return t ? `称号换成了「${t}」` : '不戴称号';
}

export function titleText(s: Save): string {
  return s.p3.title ?? '无';
}

// ===== 排行榜 =====
export type BoardKind = 'gaoshou' | 'fuhao' | 'paiwei' | 'xingyun' | 'meinv' | 'zhanli' | 'eren' | 'bangpai' | 'fujiang' | 'kangxing';
export const BOARDS: [BoardKind, string][] = [
  ['gaoshou', '高手'], ['fuhao', '富豪'], ['paiwei', '排位'], ['xingyun', '幸运'], ['meinv', '美女'], ['zhanli', '战力'], ['eren', '恶人'],
  ['bangpai', '帮派'], ['fujiang', '副将'], ['kangxing', '抗性'],
];

export interface BoardRow {
  name: string;
  value: number;
  text: string;
  mine: boolean;
}

export function board(s: Save, kind: BoardKind, power: (lv: number) => number, myPower: number, myResist: number): BoardRow[] {
  const rs = rivals(s);
  const me = (value: number, text: string): BoardRow => ({ name: s.player.name, value, text, mine: true });
  let rows: BoardRow[] = [];
  switch (kind) {
    case 'gaoshou':
      rows = rs.map((r) => ({ name: r.name, value: rivalLevel(s, r), text: `${rivalLevel(s, r)}级`, mine: false }));
      rows.push(me(s.player.level + s.p3.reborn * 0.5, `${s.player.level}级${s.p3.reborn ? `(${s.p3.reborn}转)` : ''}`));
      break;
    case 'fuhao': {
      rows = rs.map((r) => {
        const v = Math.round(rivalLevel(s, r) ** 2 * 40 * r.wealth);
        return { name: r.name, value: v, text: `${v}两`, mine: false };
      });
      const w = s.player.silver + s.bank;
      rows.push(me(w, `${w}两`));
      break;
    }
    case 'paiwei':
      return ladder(s, 'arena').slice(0, 50).map((x) => (x.rival ? { name: x.rival.name, value: -x.rank, text: `第${x.rank}名`, mine: false } : me(-x.rank, `第${x.rank}名`)));
    case 'xingyun':
      rows = rs.map((r) => ({ name: r.name, value: r.luck, text: `${r.luck}`, mine: false }));
      rows.push(me(s.p3.lucky.luck, `${s.p3.lucky.luck}`));
      break;
    case 'meinv':
      rows = rs.filter((r) => r.gender === 'female').map((r) => ({ name: r.name, value: r.charm + rivalLevel(s, r) * 2, text: `魅力${r.charm + rivalLevel(s, r) * 2}`, mine: false }));
      if (s.player.gender === 'female') rows.push(me(charmOf(s), `魅力${charmOf(s)}`));
      break;
    case 'zhanli':
      rows = rs.map((r) => {
        const v = power(rivalLevel(s, r));
        return { name: r.name, value: v, text: `${v}`, mine: false };
      });
      rows.push(me(myPower, `${myPower}`));
      break;
    case 'eren':
      rows = rs.filter((r) => r.evil > 0).map((r) => ({ name: r.name, value: r.evil, text: `恶人值${r.evil}`, mine: false }));
      if (evilNow(s) > 0) rows.push(me(s.p3.evil, `恶人值${s.p3.evil}`));
      break;
    case 'bangpai':
      return sectBoard(s).map((x) => ({ name: x.name, value: x.rep, text: `声望${x.rep}`, mine: x.mine }));
    case 'fujiang': {
      rows = rs.map((r) => {
        const v = power(Math.max(1, rivalLevel(s, r) - 3));
        return { name: `${r.general.name}（${r.name}）`, value: v, text: `${v}`, mine: false };
      });
      for (const g of [...s.generals, ...s.inn]) {
        const st = generalStats(g);
        const v = Math.round(st.maxHp / 10 + st.atk + st.def + st.spd);
        rows.push({ name: `${g.name}（${s.player.name}）`, value: v, text: `${v}`, mine: true });
      }
      break;
    }
    case 'kangxing':
      rows = rs.map((r) => {
        const v = Math.round(rivalLevel(s, r) * 1.6 + r.luck / 10);
        return { name: r.name, value: v, text: `${v}`, mine: false };
      });
      rows.push(me(myResist, `${myResist}`));
      break;
  }
  return rows.sort((a, b) => b.value - a.value).slice(0, 50);
}

export function charmOf(s: Save): number {
  return s.p3.charm + s.player.level * 2;
}

// 自己在某个榜上排第几（50 名以外返回 0）
export function myBoardRank(rows: BoardRow[]): number {
  const i = rows.findIndex((r) => r.mine);
  return i < 0 ? 0 : i + 1;
}
