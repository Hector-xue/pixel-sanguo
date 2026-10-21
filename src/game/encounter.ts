// 存档 ↔ 战斗内核 之间的转换：开战时把主角/副将/怪物做成战斗单位，打完把结果写回存档
import { balance, items, locations, monsters, startLocation } from '../data';
import type { MonsterGroup } from '../data';
import { emptyStatus, computeRewards, createBattle } from '../core/battle';
import type { BUnit, Battle, Rewards } from '../core/battle';
import { expLevelMul, expToNext, monsterExp, monsterSilver, monsterStats } from '../core/formulas';
import { Rng } from '../core/rng';
import type { Stats } from '../core/types';
import type { General, Save } from './state';
import {
  addGeneral, addItem, addProf, checkCollect, findGeneral, generalStats, grantGeneralExp, grantPlayerExp,
  log, makeGeneral, onBattleKills, onCapture, playerStats, questDropAllowed,
} from './state';

function baseUnit(id: string, stats: Stats): Pick<BUnit, 'id' | 'maxHp' | 'maxMp' | 'atk' | 'def' | 'spd' | 'resist' | 'rates' | 'status' | 'defending' | 'alive' | 'captured' | 'profGain'> {
  return {
    id,
    maxHp: stats.maxHp,
    maxMp: stats.maxMp,
    atk: stats.atk,
    def: stats.def,
    spd: stats.spd,
    resist: { ...stats.resist },
    rates: { ...stats.rates },
    status: emptyStatus(),
    defending: false,
    alive: true,
    captured: false,
    profGain: {},
  };
}

export function playerUnit(s: Save): BUnit {
  const st = playerStats(s);
  const p = s.player;
  return {
    ...baseUnit('p', st),
    name: p.name, side: 'ally', kind: 'player', refId: 'player',
    classId: p.classId, gender: p.gender, look: `hero_${p.classId}_${p.gender}`, variant: p.avatar,
    level: p.level, row: 0,
    hp: Math.max(1, Math.min(p.hp, st.maxHp)), mp: Math.min(p.mp, st.maxMp),
    skills: p.skills.map((x) => ({ ...x })), aiSkills: [],
    historic: false, capturable: false, expYield: 0, silverYield: 0,
  };
}

export function generalUnit(g: General): BUnit {
  const st = generalStats(g);
  return {
    ...baseUnit(g.uid, st),
    name: g.name, side: 'ally', kind: 'general', refId: g.uid,
    classId: g.classId, gender: g.gender, look: g.look, level: g.level, row: 0,
    hp: Math.max(0, Math.min(g.hp, st.maxHp)), mp: Math.min(g.mp, st.maxMp), alive: g.hp > 0,
    skills: g.skills.map((x) => ({ ...x })), aiSkills: [],
    historic: false, capturable: false, expYield: 0, silverYield: 0,
  };
}

export function monsterUnit(id: string, monsterId: string, level: number, row: 0 | 1): BUnit {
  const m = monsters[monsterId];
  const st = monsterStats(monsterId, level);
  return {
    ...baseUnit(id, st),
    name: m.name, side: 'enemy', kind: 'monster', refId: monsterId, monsterId,
    classId: m.class, gender: m.gender, look: m.look, level, row,
    hp: st.maxHp, mp: st.maxMp,
    skills: m.skills.map((x) => ({ id: x.id, level: x.level, prof: 0 })),
    aiSkills: m.skills.map((x) => ({ id: x.id, rate: x.rate })),
    historic: !!m.historic, capturable: m.capturable !== false,
    expYield: monsterExp(monsterId, level), silverYield: monsterSilver(monsterId, level),
  };
}

// 敌人站两列：前排最多3个，其余在后排
export function rollEnemies(group: MonsterGroup, rng: Rng): BUnit[] {
  const list: { monster: string; level: number }[] = [];
  const n = rng.int(group.count[0], group.count[1]);
  for (let i = 0; i < n; i++) list.push({ monster: group.monster, level: rng.int(group.level[0], group.level[1]) });
  if (group.escort) for (let i = 0; i < group.escort.count; i++) list.push({ monster: group.escort.monster, level: group.escort.level });
  return list.slice(0, 5).map((e, i) => monsterUnit(`e${i}`, e.monster, e.level, i < 3 ? 0 : 1));
}

export function groupLabel(group: MonsterGroup): string {
  return group.label ?? `${monsters[group.monster].name}群`;
}

export function startBattle(s: Save, groupIndex: number, seed: number): Battle {
  const group = locations[s.location].groups[groupIndex];
  const rng = new Rng(seed);
  const enemies = rollEnemies(group, rng);
  const allies = [playerUnit(s)];
  const reserve: BUnit[] = [];
  for (const g of s.generals) {
    const u = generalUnit(g);
    if (g.uid === s.activeGeneral && u.alive) allies.push(u);
    else reserve.push(u);
  }
  const all = [group.monster, group.escort?.monster].filter(Boolean) as string[];
  const canFlee = !all.some((m) => monsters[m].noFlee || monsters[m].historic);
  return createBattle({ seed: rng.next() * 4294967296 >>> 0, allies, reserve, enemies, items: { ...s.bag }, title: groupLabel(group), canFlee });
}

export interface BattleSummary {
  outcome: Battle['outcome'];
  rows: { name: string; exp: number; silver: number }[];
  drops: { name: string; n: number }[];
  lines: string[];
}

// 打完写回存档：血量、精力、药品消耗、熟练度、经验银两、掉落、招降、任务进度
export function finishBattle(s: Save, b: Battle): BattleSummary {
  s.battles++;
  const rewards: Rewards = computeRewards(b, expLevelMul, (q) => questDropAllowed(s, q), (m) => monsters[m].drops);
  const all = [...b.units, ...b.reserve].filter((u) => u.side === 'ally');
  const sum: BattleSummary = { outcome: b.outcome, rows: [], drops: [], lines: [] };

  for (const [id, n] of Object.entries(b.itemsUsed)) {
    s.bag[id] = Math.max(0, (s.bag[id] ?? 0) - n);
    if (!s.bag[id]) delete s.bag[id];
  }

  for (const u of all) {
    const keep = (hp: number) => (b.outcome === 'win' || b.outcome === 'fled' ? Math.max(1, hp) : hp);
    if (u.kind === 'player') {
      s.player.hp = keep(u.hp);
      s.player.mp = u.mp;
      for (const [sk, n] of Object.entries(u.profGain)) {
        const st = s.player.skills.find((x) => x.id === sk);
        if (st) addProf(st, n);
      }
    } else {
      const g = findGeneral(s, u.refId);
      if (!g) continue;
      g.hp = keep(u.hp);
      g.mp = u.mp;
      for (const [sk, n] of Object.entries(u.profGain)) {
        const st = g.skills.find((x) => x.id === sk);
        if (st) addProf(st, n);
      }
    }
  }

  if (b.outcome === 'win' && !b.spar) {
    s.player.silver += rewards.silver;
    for (const u of all) {
      const exp = rewards.exp[u.id] ?? 0;
      if (u.kind === 'player') {
        sum.rows.push({ name: u.name, exp, silver: rewards.silver });
        sum.lines.push(...grantPlayerExp(s, exp));
      } else if (exp > 0) {
        const g = findGeneral(s, u.refId);
        if (!g) continue;
        sum.rows.push({ name: g.name, exp, silver: 0 });
        sum.lines.push(...grantGeneralExp(g, exp));
      }
    }
    for (const [id, n] of Object.entries(rewards.drops)) {
      const lost = addItem(s, id, n);
      sum.drops.push({ name: items[id].name, n: n - lost });
      if (lost) sum.lines.push(`负重已满，丢掉了${lost}个${items[id].name}`);
    }
    sum.lines.push(...onBattleKills(s, rewards.kills));
    const col = checkCollect(s);
    if (col && Object.keys(rewards.drops).length) sum.lines.push(col);
  }

  // 招降成功的单位：赢了才算数（逃跑或战败就跑了）
  if (b.outcome === 'win') {
    const rng = new Rng(b.rng.state ^ 0x9e3779b9);
    for (const c of b.captured) {
      if (!c.monsterId) continue;
      sum.lines.push(addGeneral(s, makeGeneral(s, c.monsterId, c.level, rng)));
      const q = onCapture(s, c.monsterId);
      if (q) sum.lines.push(q);
    }
  }

  if (b.outcome === 'lose') {
    const st = playerStats(s);
    s.player.hp = st.maxHp;
    s.player.mp = st.maxMp;
    for (const g of s.generals) {
      const gs = generalStats(g);
      g.hp = gs.maxHp;
      g.mp = gs.maxMp;
    }
    s.location = startLocation;
    if (s.player.level >= balance.defeatPenaltyFromLevel) {
      const lost = Math.floor(expToNext(s.player.level) * balance.defeatExpLoss);
      s.player.exp = Math.max(0, s.player.exp - lost);
      sum.lines.push(`战斗失败，损失经验${lost}，被人送回了新手村`);
    } else {
      sum.lines.push(`战斗失败，被人送回了新手村（10级以前不扣经验）`);
    }
  }
  for (const l of sum.lines) log(s, l);
  return sum;
}
