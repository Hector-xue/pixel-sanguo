// 主线里的讨伐战、名将战、剧情抉择。
// 讨伐战：打怪任务到了地方，可以挑一拨满编的（5 个、高一级）打，打倒一个算两个——15 个的任务两仗就够。
// 名将战：主线里点名要和某位名将过招，到了地方点「挑战」。按切磋算（回满血上阵、不带药、输了不掉东西），赢了任务完成。
// 剧情抉择：交任务时二选一，各有回话和额外奖励，记在 flags 里（qc_任务id_第几个 = true）。
import { createBattle } from '../core/battle';
import type { BUnit, Battle } from '../core/battle';
import { Rng } from '../core/rng';
import { balance, locations, monsters } from '../data';
import type { MonsterGroup, QuestDef } from '../data';
import { generalUnit, monsterUnit, playerUnit, startGroupBattle } from './encounter';
import type { Save } from './state';
import { currentQuest, deployedUids, log, npcName, questNeed } from './state';
import { bossUnit } from './tower';

export const TAOFA_MUL = 2;
// 名将战：名将的血够你们一队普攻打 rounds 回合，普攻一下打掉队员约 hit 的血（60 级以后两样都随等级往上加），防御 = 全队平均防御 × def
// （后期副将技能多、被动强，一回合能打的远不止普攻：回合数随等级往上加）
const D = { rounds: 9, roundsPerLevel: 0.12, hit: 0.3, hitPerLevel: 0.002, def: 1.0, escorts: 0, controlResist: 120 };
const TAOFA_COUNT = 5;

function activeQuest(s: Save, type: QuestDef['type']): QuestDef | null {
  const q = currentQuest(s);
  return q && s.main.state === 'active' && q.type === type ? q : null;
}

// 任务要打的那种怪在这个地方的那一拨
function questGroup(s: Save, q: QuestDef): MonsterGroup | undefined {
  return locations[s.location]?.groups.find((g) => g.monster === q.target?.monster && !g.label);
}

export function taofaReason(s: Save): string {
  const q = activeQuest(s, 'kill');
  if (!q || !q.target?.monster || s.location !== q.target.at) return '不在打怪任务的地方';
  if (monsters[q.target.monster].boss) return '头目只有一个，不用讨伐';
  if (!questGroup(s, q)) return '这里没有任务要打的怪';
  if (questNeed(q) - s.main.count < 4) return '只差几个了，直接打就行';
  return '';
}

export function taofaBattle(s: Save, seed: number): Battle | string {
  const why = taofaReason(s);
  if (why) return why;
  const q = currentQuest(s)!;
  const g = questGroup(s, q)!;
  const name = monsters[g.monster].name;
  const b = startGroupBattle(s, { monster: g.monster, level: [g.level[0] + 1, g.level[1] + 1], count: [TAOFA_COUNT, TAOFA_COUNT], label: `讨伐·${name}` }, seed);
  b.tag = 'taofa';
  return b;
}

export function duelReason(s: Save): string {
  const q = activeQuest(s, 'duel');
  if (!q || !q.target?.monster) return '没有名将战';
  if (s.location !== q.target.at) return `去${locations[q.target.at].name}`;
  return '';
}

// 名将（演武塔守层那一套：带自己的技能和专属被动）加上本地的兵，比主角高两级
export function duelBattle(s: Save, seed: number): Battle | string {
  const why = duelReason(s);
  if (why) return why;
  const q = currentQuest(s)!;
  const gid = q.target!.monster!;
  const lv = s.player.level + 2;
  const rng = new Rng(seed);
  const allies = [playerUnit(s)];
  const reserve: BUnit[] = [];
  const dep = deployedUids(s);
  for (const g of s.generals) (dep.includes(g.uid) ? allies : reserve).push(generalUnit(g, s));
  for (const u of [...allies, ...reserve]) Object.assign(u, { hp: u.maxHp, mp: u.maxMp, alive: true });
  // 名将按你这一队的实力定（不然前期打不过、后期一刀一个）：血照着你们一回合能打多少、攻击照着你们的血和防御、防御照着全队平均
  const boss = bossUnit(gid, lv);
  const avg = (f: (u: BUnit) => number) => allies.reduce((n, u) => n + f(u), 0) / allies.length;
  const top = (f: (u: BUnit) => number) => Math.max(...allies.map(f));
  boss.def = Math.round(avg((u) => u.def) * D.def);
  // 血：全队一回合普攻大概能打多少 × D.rounds（扣完名将的防御）
  const B = balance.damage;
  const perRound = allies.reduce((n, u) => n + Math.max(u.atk - boss.def * B.defK, u.atk * B.minRatio), 0);
  boss.maxHp = boss.hp = Math.round(perRound * (D.rounds + Math.max(0, s.player.level - 60) * D.roundsPerLevel));
  // 攻击定成：普攻一下大约打掉队员 D.hit 的血（扣完防御）
  const late = Math.max(0, s.player.level - 60);
  boss.atk = Math.round(avg((u) => u.maxHp) * (D.hit + late * D.hitPerLevel) + avg((u) => u.def) * balance.damage.defK);
  boss.spd = Math.round(top((u) => u.spd));
  // 和国战守将一样不怕计策（不然文人一封到底）
  for (const k of ['chaos', 'seal', 'trap'] as const) boss.resist[k] += D.controlResist;
  const enemies: BUnit[] = [boss];
  const pool = locations[s.location].groups.filter((g) => !monsters[g.monster].boss && !g.label);
  if (pool.length) for (let i = 1; i <= D.escorts && enemies.length < 5; i++) enemies.push(monsterUnit(`e${i}`, rng.pick(pool).monster, lv, i < 3 ? 0 : 1));
  for (const e of enemies) {
    e.capturable = false;
    e.expYield = 0;
    e.silverYield = 0;
  }
  return createBattle({
    seed: (rng.next() * 4294967296) >>> 0, allies, reserve, enemies, items: {},
    title: `名将战·${monsters[gid].name}`, spar: true, canFlee: true, tag: `duel:${q.id}`,
  });
}

export function afterDuel(s: Save, b: Battle): string[] {
  const q = currentQuest(s);
  const id = (b.tag ?? '').split(':')[1];
  if (!q || q.id !== id || s.main.state !== 'active') return [];
  const name = monsters[q.target!.monster!].name;
  if (b.outcome !== 'win') return [`没能胜过${name}，回去练练再来（名将战按切磋算，什么也没丢）`];
  s.main.state = 'ready';
  s.main.count = 1;
  const line = `胜过${name}！任务【${q.title}】完成，回去找${npcName(q.turnIn)}`;
  log(s, line);
  return [line];
}

// 剧情抉择选了哪一个（没选过：-1）
export function choiceOf(s: Save, questId: string): number {
  for (let i = 0; i < 4; i++) if (s.flags[`qc_${questId}_${i}`]) return i;
  return -1;
}

// 主线最后一段（汉中篇「天下」）：一路上的几次抉择，阎圃各说一句
const ECHO: [string, string, string][] = [
  ['m44a', '陈留那边捎信来，卫公散财的事，至今还有人说起。', '曹孟德说，当年剿匪缴的那批军饷，养活了陈留义兵整整一冬。'],
  ['m60a', '东郡的屯田，今年又是丰年。', '濮阳郡兵里有个老卒，逢人就说是你把他从黄巾里拎出来的。'],
  ['m72a', '酸枣大营那一回，你在帐中据理力争，诸侯里到现在还有人记着。', '酸枣大营那一回你不争功，孟德说，这才是能成大事的人。'],
  ['m81a', '传国玉玺在盟主手里，诸侯总算还认汉室。', '听说传国玉玺至今下落不明……这种事，还是不问的好。'],
  ['m91a', '长安的百姓给你立了个生祠，香火不断。', '郿坞的金银撑起了汉中这一仗。'],
  ['m102a', '张鲁说，府库原封献上，是你成全了他。', '汉中的义舍又冒烟了，百姓都说你是讲道理的人。'],
];

export function epilogue(s: Save): { who: string; text: string }[] {
  const out = ECHO.map(([id, a, b]) => [choiceOf(s, id), a, b] as const).filter(([c]) => c >= 0).map(([c, a, b]) => ({ who: 'yanpu', text: c === 0 ? a : b }));
  return out.length ? [{ who: 'yanpu', text: '一路走来，你做过的事，天下人都看着：' }, ...out] : [];
}
