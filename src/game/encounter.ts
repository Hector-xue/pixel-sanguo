// 存档 ↔ 战斗内核 之间的转换：开战时把主角/副将/怪物做成战斗单位，打完把结果写回存档
import { LOYALTY_EVERY, decayLoyalty } from './generals';
import { trainAfterBattle } from './training';
import { campMods } from './camp';
import { PASSIVES, passiveOf } from '../core/passives';
import { feastBonus, feastTick } from './life';
import { applyFormation, clash, enemyFormation, myFormation } from './formation';
import { balance, items, locations, monsters, startLocation } from '../data';
import type { MonsterGroup } from '../data';
import { emptyStatus, computeRewards, createBattle } from '../core/battle';
import type { BUnit, Battle, Rewards } from '../core/battle';
import { expLevelMul, expToNext, monsterExp, monsterSilver, monsterStats } from '../core/formulas';
import { Rng } from '../core/rng';
import type { Stats } from '../core/types';
import type { General, Save } from './state';
import {
  addGeneral, addItem, addProf, heroVariant, checkCollect, findGeneral, generalStats, grantGeneralExp, grantPlayerExp,
  log, makeGeneral, onBattleKills, onCapture, playerStats, questDropAllowed,
} from './state';
import { afterGuard } from './dig';
import { afterArena } from './arena';
import { afterContest } from './contest';
import { afterGz, gzBuff } from './guozhan';
import { onSectKills } from './sect';
import { afterTreasure, festivalExpMul } from './events';
import { mercUnit, mercUsed } from './social';

// 战斗录像：存最近几场的开局和每回合的指令，回放时重算一遍
const REPLAYS = 8;
function saveReplay(s: Save, b: Battle): void {
  if (!b.init || !b.log) return;
  s.p3.replays.unshift({ t: Date.now(), title: b.title, at: s.location, init: b.init, rounds: b.log, outcome: b.outcome === 'fled' ? 'flee' : b.outcome });
  s.p3.replays.length = Math.min(s.p3.replays.length, REPLAYS);
}
import { onRingCapture, onRingKills } from './ring';
import { mentorExpMul, mountGain } from './town';

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
  // 药膳加成
  const fb = feastBonus(s);
  const base = baseUnit('p', st);
  base.atk = Math.round(base.atk * (1 + fb.atk));
  base.def = Math.round(base.def * (1 + fb.def));
  return {
    ...base,
    name: p.name, side: 'ally', kind: 'player', refId: 'player',
    classId: p.classId, gender: p.gender, look: `hero_${p.classId}_${p.gender}`, variant: heroVariant(s),
    level: p.level, row: 0,
    hp: Math.max(1, Math.min(p.hp, st.maxHp)), mp: Math.min(p.mp, st.maxMp),
    skills: p.skills.map((x) => ({ ...x })), aiSkills: [],
    historic: false, capturable: false, expYield: 0, silverYield: 0,
  };
}

export function generalUnit(g: General, s?: Save): BUnit {
  const st = { ...generalStats(g) };
  // 阵营羁绊（带着存档才算得出随行的是谁）
  let hpMul = 1;
  if (s) {
    const m = campMods(s, g);
    st.atk = Math.round(st.atk * (1 + m.atk));
    st.def = Math.round(st.def * (1 + m.def));
    st.spd = Math.round(st.spd * (1 + m.spd));
    hpMul = 1 + m.hp;
    st.maxHp = Math.round(st.maxHp * hpMul);
  }
  return {
    ...baseUnit(g.uid, st),
    name: g.name, side: 'ally', kind: 'general', refId: g.uid,
    classId: g.classId, gender: g.gender, look: g.look, level: g.level, row: 0,
    hp: Math.max(0, Math.min(Math.round(g.hp * hpMul), st.maxHp)), mp: Math.min(g.mp, st.maxMp), alive: g.hp > 0,
    skills: g.skills.map((x) => ({ ...x })), aiSkills: [],
    historic: false, capturable: false, expYield: 0, silverYield: 0, loyalty: g.loyalty,
    passive: g.recruitId && PASSIVES[g.recruitId] ? g.recruitId : undefined,
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
    passive: PASSIVES[monsterId] ? monsterId : undefined,
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
  return startGroupBattle(s, locations[s.location].groups[groupIndex], seed);
}

export function startGroupBattle(s: Save, group: MonsterGroup, seed: number): Battle {
  const rng = new Rng(seed);
  const enemies = rollEnemies(group, rng);
  const allies = [playerUnit(s)];
  const reserve: BUnit[] = [];
  for (const g of s.generals) {
    const u = generalUnit(g, s);
    if (g.uid === s.activeGeneral && u.alive) allies.push(u);
    else reserve.push(u);
  }
  const merc = mercUnit(s);
  if (merc) allies.push(merc);
  const all = [group.monster, group.escort?.monster].filter(Boolean) as string[];
  const canFlee = !all.some((m) => monsters[m].noFlee || monsters[m].historic);
  // 阵法：双方各自的加成，再加上克制
  const mine = myFormation(s);
  const theirs = enemyFormation(group);
  const c = clash(mine, theirs);
  applyFormation([...allies, ...reserve], mine, c);
  applyFormation(enemies, theirs, (-c) as 1 | -1 | 0);
  const b = createBattle({ seed: rng.next() * 4294967296 >>> 0, allies, reserve, enemies, items: { ...s.bag }, title: groupLabel(group), canFlee });
  b.forms = { ally: mine, enemy: theirs, clash: c };
  return b;
}

export interface BattleSummary {
  outcome: Battle['outcome'];
  rows: { name: string; exp: number; silver: number }[];
  drops: { name: string; n: number }[];
  lines: string[];
}

// 打完写回存档：血量、精力、药品消耗、熟练度、经验银两、掉落、招降、任务进度
export function finishBattle(s: Save, b: Battle, now = Date.now()): BattleSummary {
  s.battles++;
  // 仗打久了，随行副将有点懈怠
  const slack = s.battles % LOYALTY_EVERY === 0 && !b.spar && decayLoyalty(s);
  const rewards: Rewards = computeRewards(b, expLevelMul, (q) => questDropAllowed(s, q), (m) => monsters[m].drops);
  const all = [...b.units, ...b.reserve].filter((u) => u.side === 'ally');
  const sum: BattleSummary = { outcome: b.outcome, rows: [], drops: [], lines: [] };

  // 切磋（擂台、斗将台、决斗场）：不掉血不掉药，打完原样；结果另算
  if (b.spar) {
    const kind = (b.tag ?? '').split(':')[0];
    sum.lines.push(...(kind === 'league' || kind === 'kuaqu' ? afterContest(s, b, now) : afterArena(s, b, now)));
    for (const l of sum.lines) log(s, l);
    return sum;
  }
  const fed = feastTick(s);
  if (fed) sum.lines.push(fed);
  if (slack) sum.lines.push('连着打了好些仗，副将们有点懈怠了（忠诚下降），记得奖赏');
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
      // 羁绊加过气血上限的，按比例折回本来的上限
      const realMax = generalStats(g).maxHp;
      g.hp = keep(u.maxHp > realMax ? Math.round((u.hp * realMax) / u.maxHp) : u.hp);
      g.mp = u.mp;
      for (const [sk, n] of Object.entries(u.profGain)) {
        const st = g.skills.find((x) => x.id === sk);
        if (st) addProf(st, n);
      }
    }
  }

  if (b.outcome === 'win' && !b.spar) {
    // 本国占着洛阳、虎牢关：经验、银两加成
    const buff = gzBuff(s);
    // 资财：出战的副将会理财
    const rich = b.units.find((u) => u.side === 'ally' && passiveOf(u.passive)?.kind === 'loot');
    const loot = rich ? passiveOf(rich.passive)!.v : 0;
    rewards.silver = Math.round(rewards.silver * (1 + buff.silver + loot));
    if (rich) sum.lines.push(`${rich.name}·${passiveOf(rich.passive)!.name}：银两多了${Math.round(loot * 100)}%`);
    s.player.silver += rewards.silver;
    // 拜师加成 × 节日加成 × 国战加成
    const mul = mentorExpMul(s) * festivalExpMul(now) * (1 + buff.exp);
    for (const u of all) {
      const exp = Math.round((rewards.exp[u.id] ?? 0) * (u.kind === 'player' ? mul : 1));
      if (u.kind === 'player') {
        sum.rows.push({ name: u.name, exp, silver: rewards.silver });
        sum.lines.push(...grantPlayerExp(s, exp));
        // 随军操练的副将分一半
        const tr = trainAfterBattle(s, exp);
        if (tr) {
          sum.rows.push({ name: `${tr.name}（操练）`, exp: tr.exp, silver: 0 });
          sum.lines.push(...tr.lines);
        }
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
    const ring = onRingKills(s, rewards.kills);
    if (ring) sum.lines.push(ring);
    const sect = onSectKills(s, rewards.kills);
    if (sect) sum.lines.push(sect);
    const col = checkCollect(s);
    if (col && Object.keys(rewards.drops).length) sum.lines.push(col);
    sum.lines.push(...mountGain(s, balance.mount.expPerBattle));
    // 一起打赢的出战副将默契+1
    for (const u of all) {
      if (u.kind !== 'general' || !b.units.includes(u)) continue;
      const g = findGeneral(s, u.refId);
      if (g) g.rapport = Math.min(balance.general.rapportMax, g.rapport + balance.general.rapportPerBattle);
    }
  }
  if (b.tag === 'dig') sum.lines.push(...afterGuard(s, b.outcome === 'win'));
  if (b.tag === 'treasure') sum.lines.push(...afterTreasure(s, b.outcome === 'win', now));
  const gz = b.tag?.startsWith('gz:');
  if (gz) sum.lines.push(...afterGz(s, b, now));
  // 雇来的队友：打一场少一场
  if ([...b.units, ...b.reserve].some((u) => u.id === 'merc')) {
    const m = mercUsed(s);
    if (m) sum.lines.push(m);
  }
  saveReplay(s, b);

  // 招降成功的单位：赢了才算数（逃跑或战败就跑了）
  if (b.outcome === 'win') {
    const rng = new Rng(b.rng.state ^ 0x9e3779b9);
    for (const c of b.captured) {
      if (!c.monsterId) continue;
      sum.lines.push(addGeneral(s, makeGeneral(s, c.monsterId, c.level, rng)));
      const q = onCapture(s, c.monsterId);
      if (q) sum.lines.push(q);
      const r = onRingCapture(s, c.monsterId);
      if (r) sum.lines.push(r);
    }
  }

  if (b.outcome === 'lose') {
    const st = playerStats(s);
    // 国战打输了只是败退回营：回满血，不扣经验、不回新手村
    s.player.hp = st.maxHp;
    s.player.mp = st.maxMp;
    for (const g of s.generals) {
      const gs = generalStats(g);
      g.hp = gs.maxHp;
      g.mp = gs.maxMp;
    }
    if (gz) {
      for (const l of sum.lines) log(s, l);
      return sum;
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
