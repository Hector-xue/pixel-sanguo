// 教派（34 级开放）：加入一个 NPC 教派，每天做教派任务攒声望；声望够了升职位，职位越高教派加成越大。
// 做任务要花活力（活力每天回满，上限 = 等级 × 3）。教派排名和几个 AI 教派一起比声望。
import { items, locations, monsters, systems } from '../data';
import { expToNext } from '../core/formulas';
import type { RingTask, Save } from './state';
import { bagCount, bump, dayKey, grantPlayerExp, log, onFlag, removeItem, rollRng, sectRank } from './state';
import { visited } from './town';

const S = systems.sect;

export function vigorMax(s: Save): number {
  return s.player.level * S.vigorPerLevel;
}

// 活力：跨天回满
export function vigorNow(s: Save, now = Date.now()): number {
  const d = dayKey(now);
  if (s.p3.vigorDay !== d) {
    s.p3.vigorDay = d;
    s.p3.vigor = vigorMax(s);
  }
  return s.p3.vigor;
}

export function sectDef(id: string | null) {
  return S.sects.find((x) => x.id === id) ?? null;
}

export function sectRankName(rep: number): string {
  return S.ranks[sectRank(rep)].name;
}

export function joinSect(s: Save, id: string): string {
  if (s.player.level < S.minLevel) return `${S.minLevel}级才能入教派`;
  if (s.p3.sect.id) return `你已经是${sectDef(s.p3.sect.id)!.name}的人了`;
  const def = sectDef(id);
  if (!def) return '';
  s.p3.sect = { id, rep: 0, day: '', done: 0, task: null };
  s.flags.joinedSect = true;
  onFlag(s, 'joinedSect');
  bump(s, 'sectJoined');
  log(s, `加入了${def.name}`);
  return `加入了${def.name}（${def.desc}）`;
}

export function leaveSect(s: Save): string {
  const def = sectDef(s.p3.sect.id);
  if (!def) return '你还没入教派';
  s.p3.sect = { id: null, rep: 0, day: '', done: 0, task: null };
  return `退出了${def.name}，声望清零`;
}

export function sectTasksLeft(s: Save, now = Date.now()): number {
  const d = dayKey(now);
  if (s.p3.sect.day !== d) {
    s.p3.sect.day = d;
    s.p3.sect.done = 0;
  }
  return Math.max(0, S.tasksPerDay - s.p3.sect.done);
}

// 教派任务：打怪 / 送药 / 巡视，和跑环差不多但简单
function huntable(s: Save): { monster: string; at: string }[] {
  const lv = s.player.level;
  const out: { monster: string; at: string }[] = [];
  for (const [id, loc] of Object.entries(locations)) {
    if (!visited(s, id)) continue;
    for (const g of loc.groups) {
      if (monsters[g.monster].boss || g.label) continue;
      if (g.level[1] < lv - 10 || g.level[0] > lv + 1) continue;
      out.push({ monster: g.monster, at: id });
    }
  }
  return out;
}

export function takeSectTask(s: Save, now = Date.now()): string {
  if (!s.p3.sect.id) return '你还没入教派';
  if (s.p3.sect.task) return '手上的教派任务还没做完';
  if (sectTasksLeft(s, now) <= 0) return '今天的教派任务做完了，明天再来';
  if (vigorNow(s, now) < S.vigorCost) return `活力不够（要${S.vigorCost}点）`;
  s.p3.vigor -= S.vigorCost;
  const rng = rollRng(s);
  const hunt = huntable(s);
  const roll = rng.next();
  let t: RingTask;
  if (hunt.length && roll < 0.55) {
    const h = rng.pick(hunt);
    t = { type: 'kill', monster: h.monster, at: h.at, count: rng.int(S.killCount[0], S.killCount[1]), have: 0 };
  } else if (roll < 0.8) {
    const drug = rng.pick(['jinchuang', 'huichun', 'dahuan', 'qingquan', 'yulu']);
    t = { type: 'deliver', item: drug, count: rng.int(2, 4), have: 0 };
  } else {
    const places = Object.keys(locations).filter((id) => visited(s, id) && !locations[id].town && id !== s.location && id !== 'baodong');
    t = { type: 'goto', at: rng.pick(places.length ? places : ['cunbei']), count: 1, have: 0, arrived: false };
  }
  s.p3.sect.task = t;
  return `教派任务：${sectTaskText(t)}`;
}

export function sectTaskText(t: RingTask): string {
  if (t.type === 'kill') return `去${locations[t.at!].name}打败${t.count}个${monsters[t.monster!].name}（${Math.min(t.have, t.count)}/${t.count}）`;
  if (t.type === 'deliver') return `送${t.count}个${items[t.item!].name}给教派使者`;
  return `去${locations[t.at!].name}巡视一圈${t.arrived ? '（已到）' : ''}`;
}

export function sectTaskDone(s: Save): boolean {
  const t = s.p3.sect.task;
  if (!t) return false;
  if (t.type === 'deliver') return bagCount(s, t.item!) >= t.count;
  if (t.type === 'goto') return !!t.arrived;
  return t.have >= t.count;
}

export function turnInSect(s: Save): string[] {
  const t = s.p3.sect.task;
  if (!t || !sectTaskDone(s)) return ['任务还没做完'];
  if (t.type === 'deliver') removeItem(s, t.item!, t.count);
  const rng = rollRng(s);
  const rep = rng.int(S.rep[0], S.rep[1]);
  const before = sectRank(s.p3.sect.rep);
  s.p3.sect.rep += rep;
  s.p3.sect.task = null;
  s.p3.sect.done++;
  const exp = Math.round(expToNext(s.player.level) * 0.04);
  const silver = s.player.level * 25;
  s.player.silver += silver;
  bump(s, 'sectTasks');
  const lines = [`教派任务完成：声望+${rep}、经验+${exp}、银两+${silver}`, ...grantPlayerExp(s, exp)];
  const after = sectRank(s.p3.sect.rep);
  if (after > before) lines.push(`声望够了，升为${S.ranks[after].name}！教派加成变大了`);
  for (const l of lines) log(s, l);
  return lines;
}

export function onSectKills(s: Save, kills: Record<string, number>): string | null {
  const t = s.p3.sect.task;
  if (!t || t.type !== 'kill' || !kills[t.monster!] || t.have >= t.count) return null;
  t.have = Math.min(t.count, t.have + kills[t.monster!]);
  return t.have >= t.count ? '教派任务完成，回去找教派使者' : `教派任务：${monsters[t.monster!].name}${t.have}/${t.count}`;
}

// 教派排名：自己的教派 = AI 底子 + 自己的声望
export function sectBoard(s: Save): { name: string; rep: number; mine: boolean }[] {
  return S.sects
    .map((x, i) => ({ name: x.name, rep: S.aiRep[i] + (s.p3.sect.id === x.id ? s.p3.sect.rep : 0), mine: s.p3.sect.id === x.id }))
    .sort((a, b) => b.rep - a.rep);
}
