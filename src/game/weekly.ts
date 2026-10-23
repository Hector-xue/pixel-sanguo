// 本周军功簿：天下历每七天（和国战赛季同一个周期）换一批四件事，每件做完领一份，四件全做完再给一枚大将军令。
// 进度按存档里的累计数算：换周时记下这几个数的底，现在的数减去底就是本周做了多少。
// 第一件总是「打赢多少场」，其余三件从眼下做得了的里挑（按周数和存档种子定，同一周不会变）。
import { items } from '../data';
import { Rng } from '../core/rng';
import { calTick, weekIndex } from './calendar';
import type { Save } from './state';
import { addItem, log } from './state';
import { towerBest } from './tower';

export interface WeekGoal {
  key: string;
  name: string;
  need: number;
  count: (s: Save) => number;
  ok: (s: Save) => boolean;
}

const life = (k: string) => (s: Save) => s.life[k] ?? 0;

export const WEEK_GOALS: WeekGoal[] = [
  { key: 'win', name: '打赢60场仗', need: 60, count: life('wins'), ok: () => true },
  { key: 'gradeA', name: '拿15次「甲」评价', need: 15, count: life('gradeA'), ok: (s) => s.player.level >= 5 },
  { key: 'gather', name: '采集15次', need: 15, count: life('gathers'), ok: () => true },
  { key: 'cook', name: '在灶台做5道菜', need: 5, count: life('cooks'), ok: () => true },
  { key: 'ring', name: '跑完一整环', need: 1, count: life('rings'), ok: (s) => s.player.level >= 20 },
  { key: 'pk', name: '擂台、斗将台赢5场', need: 5, count: life('pkWins'), ok: (s) => s.player.level >= 30 },
  { key: 'sect', name: '做10次教派任务', need: 10, count: life('sectTasks'), ok: (s) => !!s.p3.sect.id },
  { key: 'gz', name: '国战出征、驻守12次', need: 12, count: (s) => (s.life.gzAttacks ?? 0) + (s.life.gzDefends ?? 0), ok: (s) => !!s.p4.nation },
  { key: 'tower', name: '演武塔登3层', need: 3, count: towerBest, ok: (s) => s.player.level >= 80 },
];
const BY_KEY = new Map(WEEK_GOALS.map((g) => [g.key, g]));
export const WEEK_PICKS = 4;

export interface WeekState {
  idx: number;
  keys: string[];
  base: Record<string, number>;
  claimed: string[];
  bonus: boolean;
}

// 这一周的军功簿（换周了就重新挑、重新记底）
export function weekState(s: Save, t = calTick(s)): WeekState {
  const idx = weekIndex(t);
  const cur = s.p5.week;
  if (cur && cur.idx === idx) return cur;
  const rng = new Rng((Math.imul(idx + 1, 2654435761) ^ s.seed) >>> 0);
  const pool = rng.shuffle(WEEK_GOALS.filter((g) => g.key !== 'win' && g.ok(s)));
  const keys = ['win', ...pool.slice(0, WEEK_PICKS - 1).map((g) => g.key)];
  const base: Record<string, number> = {};
  for (const k of keys) base[k] = BY_KEY.get(k)!.count(s);
  s.p5.week = { idx, keys, base, claimed: [], bonus: false };
  return s.p5.week;
}

export interface WeekRow {
  key: string;
  name: string;
  done: number;
  need: number;
  claimed: boolean;
}

export function weekRows(s: Save, t = calTick(s)): WeekRow[] {
  const w = weekState(s, t);
  return w.keys.map((k) => {
    const g = BY_KEY.get(k)!;
    return { key: k, name: g.name, done: Math.min(g.need, Math.max(0, g.count(s) - (w.base[k] ?? 0))), need: g.need, claimed: w.claimed.includes(k) };
  });
}

// 每件的奖励：银两随等级涨，再加一个高级宝箱；四件全领完另给一枚大将军令
export function weekReward(s: Save): { silver: number; items: Record<string, number> } {
  return { silver: Math.max(500, Math.round(s.player.level * s.player.level * 2 / 100) * 100), items: { gaojibaoxiang: 1 } };
}
export const WEEK_BONUS: Record<string, number> = { dajiangjunling: 1 };

export function weekPending(s: Save): number {
  const rows = weekRows(s);
  const w = weekState(s);
  return rows.filter((r) => r.done >= r.need && !r.claimed).length + (rows.every((r) => r.claimed) && !w.bonus ? 1 : 0);
}

export function claimWeek(s: Save, key: string): string {
  const w = weekState(s);
  const row = weekRows(s).find((r) => r.key === key);
  if (!row) return '这周没有这件事';
  if (row.claimed) return '已经领过了';
  if (row.done < row.need) return `还差${row.need - row.done}`;
  w.claimed.push(key);
  const r = weekReward(s);
  s.player.silver += r.silver;
  const lost = Object.entries(r.items).reduce((n, [id, k]) => n + addItem(s, id, k), 0);
  const got = [`银两${r.silver}`, ...Object.entries(r.items).map(([id, k]) => `${items[id].name}×${k}`)].join('、');
  log(s, `军功簿【${row.name}】领了${got}`);
  return `领了${got}${lost ? '（负重满了，有东西没拿到）' : ''}`;
}

export function claimWeekBonus(s: Save): string {
  const w = weekState(s);
  if (w.bonus) return '已经领过了';
  if (!weekRows(s).every((r) => r.claimed)) return '四件都领完才能领';
  w.bonus = true;
  for (const [id, k] of Object.entries(WEEK_BONUS)) addItem(s, id, k);
  const got = Object.entries(WEEK_BONUS).map(([id, k]) => `${items[id].name}×${k}`).join('、');
  log(s, `军功簿这一周全满，领了${got}`);
  return `这一周全满！领了${got}`;
}

// ===== 战绩：建号到现在的一张总账 =====
export function recordLines(s: Save, now = Date.now()): [string, string][] {
  const L = (k: string) => s.life[k] ?? 0;
  const days = Math.max(1, Math.floor((now - (s.createdAt || now)) / 86400000) + 1);
  const kills = Object.values(s.kills).reduce((n, v) => n + v, 0);
  const out: [string, string][] = [
    ['闯荡江湖', `第${days}天`],
    ['打过的仗', `${s.battles}场`],
    ['胜 / 负', `${L('wins')} / ${L('losses')}（0.1.4 起记）`],
    ['最长连胜', `${L('bestStreak')}场`],
    ['「甲」评价', `${L('gradeA')}次`],
    ['打倒的敌人', `${kills}个`],
    ['名将战胜过', `${L('duels')}位`],
    ['讨伐战打赢', `${L('taofa')}场`],
    ['身边副将', `${s.generals.length + s.inn.length}位`],
    ['跑完的环', `${L('rings')}环`],
    ['技能入化境', `${L('huajing')}次`],
    ['采集 / 做菜', `${L('gathers')} / ${L('cooks')}次`],
  ];
  if (towerBest(s)) out.push(['演武塔最高', `第${towerBest(s)}层`]);
  if (s.p4.nation) out.push(['国战', `出征${L('gzAttacks')}·驻守${L('gzDefends')}·夺城${L('gzCaptures')}`]);
  return out;
}
