// 自动通关模拟：用自动战斗跑主线（新手篇 + 许昌篇），检查任务能不能走通、升级节奏合不合适。单测和数值调整都用它。
import { aiCommand, autoCommand, canCast, controlOf, foesOf, living, needsCommand, resolveRound } from '../core/battle';
import type { BUnit, Battle, Command } from '../core/battle';
import { gearBonus, mountPower, tierLevel } from '../core/gear';
import { Rng } from '../core/rng';
import type { Slot } from '../core/types';
import { GEM_KINDS, classSkills, equips, gemId, items, locations, mainQuests, monsters, mounts, skills } from '../data';
import { finishBattle, startBattle } from '../game/encounter';
import { generalLearn, generalSkillRows, readXinfa, recruitWith } from '../game/generals';
import { nextRing, taskDone, turnInRing } from '../game/ring';
import { buyGear, canEquip, combineGem, combineOre, equipGear, forge, forgeRows, ORE_CHAIN, oreCombineCost, sellGear, socketGem } from '../game/smith';
import type { Save } from '../game/state';
import {
  acceptQuest, allocate, arrive, bagCap, bagCount, bagUsed, buy, currentQuest, findPath, heal, learnSkill, moveToInn, moveToTeam,
  npcLocation, playerStats, sell, setActive, skillSchool, turnInQuest, upgradeSkill,
} from '../game/state';
import { buyGold, buyMount, ride, shopBuy, visited } from '../game/town';
import { arenaBattle, challengers } from '../game/arena';
import { joinSect } from '../game/sect';
import { endTraining, startTraining, trainingProgress } from '../game/training';
import { generalRebirth, generalRebirthReason, rebirth } from '../game/rebirth';
import { oreFor } from '../game/welfare';

export interface AutoplayReport {
  finished: boolean;
  battles: number;
  wins: number;
  losses: number;
  level: number;
  steps: { quest: string; level: number; battles: number }[];
  generals: number;
  rings: number;
  // 在哪儿输的（地点 → 场数），调数值用
  lossAt: Record<string, number>;
}

interface Sim {
  s: Save;
  rng: Rng;
  rep: AutoplayReport;
  now: number;
  lastSmith: number;
  badSpot: Record<string, number>;
  badLevel: number;
}

function go(s: Save, to: string): void {
  if (!findPath(s.location, to) && to !== 'xinshoucun') throw new Error(`走不到 ${to}`);
  // 路上经过的地方都算去过
  for (const loc of findPath(s.location, to) ?? [to]) arrive(s, loc);
}

export function playerCommand(b: Battle, u: BUnit, s: Save, captureId: string | null): Command {
  const foes = foesOf(b, u);
  if (captureId) {
    const t = foes.find((f) => f.monsterId === captureId && f.hp / f.maxHp < 0.45);
    if (t) return { actor: u.id, type: 'capture', target: t.id };
  } else if (s.generals.length < 3) {
    const t = foes.find((f) => f.capturable && f.kind === 'monster' && f.hp / f.maxHp < 0.35);
    if (t) return { actor: u.id, type: 'capture', target: t.id };
  }
  if (u.hp < u.maxHp * 0.35) {
    const drug = Object.keys(b.items).filter((k) => b.items[k] > 0 && items[k].hp).sort((a, c) => items[c].hp! - items[a].hp!)[0];
    if (drug) return { actor: u.id, type: 'item', item: drug, target: u.id };
  }
  const own = classSkills(s.player.classId, s.player.gender).filter((id) => u.skills.some((x) => x.id === id));
  const castable = own.filter((id) => canCast(u, id));
  if (own.length && !castable.length && u.mp < u.maxMp * 0.3) {
    const mpDrug = Object.keys(b.items).filter((k) => b.items[k] > 0 && items[k].mp).sort((a, c) => items[c].mp! - items[a].mp!)[0];
    if (mpDrug) return { actor: u.id, type: 'item', item: mpDrug, target: u.id };
  }
  const aoe = castable.find((id) => skills[id].kind === 'aoe');
  if (aoe && foes.length >= 2) return { actor: u.id, type: 'skill', skill: aoe };
  const busy = captureId && foes.some((f) => f.monsterId === captureId);
  const ctl = castable.find((id) => skills[id].kind === 'control');
  const free = foes.filter((f) => !controlOf(f)).sort((a, c) => c.hp - a.hp);
  if (ctl && !busy && free.length && foes.length > 1) return { actor: u.id, type: 'skill', skill: ctl, target: free[0].id };
  const dmg = castable.find((id) => ['nuke', 'cleave', 'poison'].includes(skills[id].kind));
  if (dmg && !busy) return { actor: u.id, type: 'skill', skill: dmg, target: [...foes].sort((a, c) => c.hp - a.hp)[0]?.id };
  return autoCommand(b, u);
}

export function generalCommand(b: Battle, u: BUnit, captureId: string | null): Command {
  if (captureId && foesOf(b, u).some((f) => f.monsterId === captureId)) {
    const t = foesOf(b, u).find((f) => f.monsterId === captureId && f.hp > f.maxHp * 0.5);
    return t ? { actor: u.id, type: 'attack', target: t.id } : { actor: u.id, type: 'defend' };
  }
  const sk = u.skills.map((x) => x.id).filter((id) => canCast(u, id) && skills[id].target !== 'allies');
  if (sk.length) {
    const foes = foesOf(b, u);
    const id = sk.find((k) => skills[k].kind === 'aoe' && foes.length >= 2) ?? sk[0];
    const free = foes.filter((f) => !controlOf(f));
    const t = skills[id].kind === 'control' ? free[0] : [...foes].sort((a, c) => c.hp - a.hp)[0];
    if (t || skills[id].target === 'enemies') return { actor: u.id, type: 'skill', skill: id, target: t?.id };
  }
  return autoCommand(b, u);
}

function runBattle(sim: Sim, b: Battle, captureId: string | null): Battle['outcome'] {
  const { s } = sim;
  for (let r = 0; r < 200 && !b.outcome; r++) {
    const cmds: Command[] = [];
    for (const u of living(b)) {
      if (!needsCommand(u)) continue;
      if (u.side === 'enemy') cmds.push(aiCommand(b, u));
      else if (u.kind === 'player') cmds.push(playerCommand(b, u, s, captureId));
      else cmds.push(generalCommand(b, u, captureId));
    }
    resolveRound(b, cmds);
  }
  const where = `${s.location}@${s.player.level}`;
  finishBattle(s, b, sim.now);
  sim.now += 40000;
  sim.rep.battles++;
  if (b.outcome === 'win') sim.rep.wins++;
  if (b.outcome === 'lose') {
    sim.rep.losses++;
    sim.rep.lossAt[where] = (sim.rep.lossAt[where] ?? 0) + 1;
  }
  return b.outcome;
}

function fight(sim: Sim, groupIndex: number, captureId: string | null): Battle['outcome'] {
  return runBattle(sim, startBattle(sim.s, groupIndex, sim.rng.int(0, 2 ** 31)), captureId);
}

// ===== 养成习惯：加点、学技能、配装备、买马、带副将 =====
const DRUGS: [number, string, string][] = [[8, 'dieda', 'huami'], [20, 'zhixue', 'huami'], [30, 'jinchuang', 'qingquan'], [40, 'huichun', 'qingquan'], [70, 'dahuan', 'yulu'], [110, 'jiuzhuan', 'qiongjiang'], [999, 'xuelian', 'xianlu']];

// 最近的、去过的、有医馆的城镇
function homeTown(s: Save): string {
  let best = 'xinshoucun';
  let dist = Infinity;
  for (const [id, loc] of Object.entries(locations)) {
    if (!loc.town || !loc.facilities?.includes('hospital') || (!visited(s, id) && id !== 'xinshoucun')) continue;
    const p = findPath(s.location, id);
    if (p && p.length < dist) {
      dist = p.length;
      best = id;
    }
  }
  return best;
}

// 最近的、去过的、有某设施的城镇（买装备、打造用）
function townWith(s: Save, fac: string): string | null {
  let best: string | null = null;
  let dist = Infinity;
  for (const [id, loc] of Object.entries(locations)) {
    if (!loc.facilities?.includes(fac) || !visited(s, id)) continue;
    const p = findPath(s.location, id);
    if (p && p.length < dist) {
      dist = p.length;
      best = id;
    }
  }
  return best;
}

function townUpkeep(sim: Sim): void {
  const s = sim.s;
  const town = s.location;
  const full = locations[town].facilities ?? [];
  heal(s);
  const [, hpDrug, mpDrug] = DRUGS.find(([lv]) => s.player.level < lv)!;
  const caster = s.player.classId !== 'warrior';
  const room = () => bagCap(s) - bagUsed(s);
  const wantHp = 8 - bagCount(s, hpDrug);
  if (wantHp > 0) buy(s, hpDrug, Math.min(wantHp, room(), Math.floor(s.player.silver / items[hpDrug].price / 3)));
  const wantMp = (caster ? 6 : 2) - bagCount(s, mpDrug);
  if (wantMp > 0) buy(s, mpDrug, Math.min(wantMp, room(), Math.floor(s.player.silver / items[mpDrug].price / 4)));
  if (!full.includes('weapon') && !full.includes('smith')) return;
  // 1级装备先配齐
  if (full.includes('weapon')) for (const slot of equips.slots) if (!s.equip[slot] && !s.gear.some((g) => g.slot === slot) && s.player.silver > equips.shopPrice[slot] * 3) buyGear(s, slot);
  // 矿石不够就合成，能打更高级的就打（先武器、铠甲，再其他）
  const order = ['weapon', 'armor', 'head', 'boots', 'wrist', 'neck'] as const;
  for (const slot of order) {
    const cur = Math.max(s.equip[slot]?.tier ?? 0, ...s.gear.filter((g) => g.slot === slot).map((g) => g.tier));
    const rows = forgeRows(s, slot).filter((r) => r.tier > cur && s.player.level >= r.level).reverse();
    for (const row of rows) {
      const i = ORE_CHAIN.indexOf(row.ore);
      while (i > 0 && bagCount(s, row.ore) < row.oreN) {
        const c = oreCombineCost(row.ore)!;
        if (bagCount(s, c.from) < c.n || s.player.silver < c.silver + row.silver) break;
        combineOre(s, row.ore);
      }
      if (bagCount(s, row.ore) >= row.oreN && s.player.silver > row.silver * 1.2 && forge(s, slot, row.tier).startsWith('打造成功')) break;
    }
  }
  for (const g of [...s.gear].sort((a, c) => c.tier - a.tier)) {
    const cur = s.equip[g.slot];
    if (!canEquip(s, g) && (!cur || cur.tier < g.tier || (cur.tier === g.tier && g.q > cur.q))) equipGear(s, g.uid);
  }
  for (const g of [...s.gear]) if ((s.equip[g.slot]?.tier ?? 0) > g.tier) sellGear(s, g.uid);
  // 宝石：能合就合，空孔就镶
  for (const kind of GEM_KINDS) for (let lv = 1; lv < 3; lv++) while (bagCount(s, gemId(kind, lv)) >= 3 && s.player.silver > 5000) combineGem(s, kind, lv);
  for (const slot of equips.slots) {
    const g = s.equip[slot];
    if (!g) continue;
    g.gems.forEach((x, idx) => {
      if (x) return;
      const gem = Object.keys(s.bag).filter((id) => items[id].gem).sort((a, c) => items[c].gem!.level - items[a].gem!.level)[0];
      if (gem) socketGem(s, { slot }, idx, gem);
    });
  }
  // 马：买得起的最好的银两马
  const best = Object.keys(mounts).filter((id) => mounts[id].silver && mounts[id].level <= s.player.level && !s.mounts[id] && s.player.silver > (mounts[id].silver ?? 0) * 2)
    .sort((a, c) => mountPower(c, 1) - mountPower(a, 1))[0];
  if (best && (!s.riding || mountPower(best, 1) > mountPower(s.riding, s.mounts[s.riding].level))) {
    buyMount(s, best);
    ride(s, best);
  }
}

function upkeep(sim: Sim): void {
  const s = sim.s;
  const p = s.player;
  if (p.free > 0) {
    const n = p.free;
    // 攻略的加点思路：武士体力各半；文人"3血1速"；异人一半体质、其余智力和敏捷
    const plan = p.classId === 'warrior' ? { con: Math.ceil(n / 2), str: Math.floor(n / 2), int: 0, agi: 0 }
      : p.classId === 'scholar' ? { con: Math.ceil((n * 3) / 4), str: 0, int: 0, agi: n - Math.ceil((n * 3) / 4) }
        : { con: Math.ceil(n / 2), str: 0, int: Math.floor(n / 4), agi: n - Math.ceil(n / 2) - Math.floor(n / 4) };
    allocate(s, plan);
  }
  for (const row of skillSchool(s)) {
    if (row.action === 'learn') learnSkill(s, row.id);
    if (row.action === 'upgrade') upgradeSkill(s, row.id);
  }
  // 馆驿里的英才、将才换下随行的常人
  for (const g of [...s.inn].filter((x) => x.grade !== '常人')) {
    const weak = s.generals.find((x) => x.grade === '常人');
    if (s.generals.length >= 3 && weak) moveToInn(s, weak.uid);
    if (s.generals.length < 3) moveToTeam(s, g.uid);
  }
  // 将令：有大将军令就招将才；副将百级以后转生
  const elite = [...s.generals, ...s.inn].filter((g) => g.grade !== '常人').length;
  if (bagCount(s, 'dajiangjunling') > (s.p3.reborn ? 1 : 0) && elite < 4 && s.player.level >= 30) {
    const here = s.location;
    go(s, 'xuchang');
    recruitWith(s, 'dajiangjunling');
    go(s, here);
  }
  for (const g of [...s.generals]) if (!generalRebirthReason(s, g.uid)) generalRebirth(s, g.uid);
  if (s.p3.training && trainingProgress(s, sim.now)?.done) endTraining(s, sim.now);
  // 背包快满了，把用不上的东西卖掉
  if (bagUsed(s) > bagCap(s) - 6) {
    const keep = new Set(DRUGS.find(([lv]) => p.level < lv)!.slice(1) as string[]);
    for (const [lv, hp, mp] of DRUGS) for (const id of [hp, mp]) if (lv <= p.level && !keep.has(id) && bagCount(s, id)) sell(s, id, bagCount(s, id));
    for (const id of ['zhusun']) if (bagCount(s, id)) sell(s, id, bagCount(s, id));
    // 用不上的低档矿石也卖掉
    const oreKeep = ORE_CHAIN.indexOf(oreFor(p.level));
    ORE_CHAIN.forEach((o, i) => {
      if (i < oreKeep - 1 && bagCount(s, o)) sell(s, o, bagCount(s, o));
    });
  }
  // 副将：心法书给等级最高的，10级后学本职业技能，最强的出战
  const gens = [...s.generals].sort((a, c) => c.level - a.level || (c.grade > a.grade ? 1 : -1));
  const top = gens.find((g) => g.grade !== '常人') ?? gens[0];
  if (top) {
    for (const book of ['xinfa3', 'xinfa2', 'xinfa1']) while (bagCount(s, book) > 0 && top.level < p.level) readXinfa(s, top.uid, book);
    for (const g of gens) {
      const row = generalSkillRows(g).find((r) => r.action === 'learn' && !r.changesClass);
      if (row) {
        const was = s.activeGeneral;
        setActive(s, null);
        generalLearn(s, g.uid, row.id);
        setActive(s, was);
      }
    }
    // 文人自己没输出：全队都是文人时让一个将才改学异人技能；出战优先带能打的
    if (p.classId === 'scholar' && p.level >= 30 && !s.generals.some((g) => g.grade !== '常人' && g.classId !== 'scholar')) {
      const g = s.generals.filter((x) => x.grade !== '常人' && x.level >= 10).sort((a, c) => (c.grade === '将才' ? 1 : 0) - (a.grade === '将才' ? 1 : 0) || c.level - a.level)[0];
      const row = g && generalSkillRows(g).find((r) => r.cls === 'mystic' && r.action === 'learn');
      if (g && row) {
        setActive(s, null);
        generalLearn(s, g.uid, row.id);
      }
    }
    const score = (g: (typeof s.generals)[number]) => g.level + (g.grade === '常人' ? 0 : 6) + (p.classId === 'scholar' && g.classId !== 'scholar' ? 15 : 0);
    const best = [...s.generals].sort((a, c) => score(c) - score(a))[0];
    if (best && best.hp > 0) setActive(s, best.uid);
  }
  const st = playerStats(s);
  const low = s.player.hp < st.maxHp * 0.6 || s.generals.some((g) => g.hp <= 1) || bagCount(s, DRUGS.find(([lv]) => p.level < lv)![1]) < 3;
  if (low) {
    const back = s.location;
    go(s, homeTown(s));
    townUpkeep(sim);
    go(s, back);
  }
  // 隔一阵子去最近的铁匠铺看看能不能打更好的装备
  if (sim.rep.battles - sim.lastSmith >= 30) {
    sim.lastSmith = sim.rep.battles;
    const smith = townWith(s, 'smith');
    if (smith) {
      const back = s.location;
      go(s, smith);
      townUpkeep(sim);
      go(s, back);
    }
  }
}

function groupFor(locId: string, monsterId: string): number {
  return locations[locId].groups.findIndex((g) => g.monster === monsterId);
}

// 等级不够时找等级合适的地方练级（怪物等级上限不超过自己+1）；在某处连着输了就换个地方
function grind(sim: Sim): void {
  const s = sim.s;
  let best: { loc: string; gi: number; lv: number } | null = null;
  for (const [loc, def] of Object.entries(locations)) {
    if (!findPath(s.location, loc) && loc !== s.location) continue;
    def.groups.forEach((g, gi) => {
      if (monsters[g.monster].boss || g.label || g.level[1] > s.player.level + 1) return;
      if ((sim.badSpot[`${loc}:${gi}`] ?? 0) >= 2) return;
      if (!best || g.level[0] > best.lv) best = { loc, gi, lv: g.level[0] };
    });
  }
  const pick = best as { loc: string; gi: number } | null;
  go(s, pick ? pick.loc : 'cunbei');
  const out = fight(sim, pick ? pick.gi : 0, null);
  if (pick) {
    const k = `${pick.loc}:${pick.gi}`;
    if (out === 'lose') sim.badSpot[k] = (sim.badSpot[k] ?? 0) + 1;
    else if (out === 'win' && sim.badSpot[k]) sim.badSpot[k] = Math.max(0, sim.badSpot[k] - 0.25);
  }
  // 等级涨了，之前打不过的地方再给一次机会
  if (s.player.level !== sim.badLevel) {
    sim.badLevel = s.player.level;
    sim.badSpot = {};
  }
}

// 跑一环里的一个任务
function doRingTask(sim: Sim): boolean {
  const s = sim.s;
  const t = s.ring.task!;
  if (taskDone(s, t)) {
    go(s, npcLocation('paohuan')!);
    turnInRing(s);
    return true;
  }
  switch (t.type) {
    case 'goto':
      go(s, t.at!);
      return true;
    case 'buy':
      go(s, 'xuchang');
      buy(s, t.item!, t.count - bagCount(s, t.item!));
      return taskDone(s, t);
    case 'deliver': {
      const need = t.count - bagCount(s, t.item!);
      const good = items[t.item!];
      if (good.cat === 'misc') {
        go(s, 'xuchang');
        const gold = 10 * need;
        if (s.player.gold < gold) buyGold(s, gold - s.player.gold);
        shopBuy(s, t.item!, need);
        return taskDone(s, t);
      }
      return false;
    }
    default: {
      const gi = groupFor(t.at!, t.monster!);
      const g = locations[t.at!].groups[gi];
      if (s.player.level < g.level[0] - 1) return false;
      go(s, t.at!);
      fight(sim, gi, t.type === 'capture' ? t.monster! : null);
      return true;
    }
  }
}

function doFlag(sim: Sim, flag: string): boolean {
  const s = sim.s;
  switch (flag) {
    case 'allocated':
    case 'learned':
      return false;
    case 'equipped':
    case 'forged':
    case 'gemmed':
    case 'mounted': {
      go(s, 'xuchang');
      townUpkeep(sim);
      if (flag === 'mounted' && !s.flags.mounted && s.player.silver >= 2000) {
        buyMount(s, 'zhanma');
        ride(s, 'zhanma');
      }
      return !!s.flags[flag];
    }
    case 'recruited':
      go(s, 'xuchang');
      recruitWith(s, 'jiangjunling');
      return !!s.flags.recruited;
    case 'joinedSect':
      go(s, npcLocation('jiaopai')!);
      joinSect(s, s.player.classId === 'warrior' ? 'qinglong' : 'xuanwu');
      return !!s.flags.joinedSect;
    case 'arena': {
      const c = challengers(s, 'arena')[challengers(s, 'arena').length - 1];
      if (!c) return false;
      const b = arenaBattle(s, 'arena', c.rank, sim.rng.int(0, 2 ** 31));
      if (typeof b === 'string') return false;
      runBattle(sim, b, null);
      return !!s.flags.arena;
    }
    case 'trained': {
      const g = s.generals.find((x) => x.uid !== s.activeGeneral) ?? s.inn[0];
      startTraining(s, g ? g.uid : 'player', 1, sim.now);
      return !!s.flags.trained;
    }
    case 'reborn': {
      go(s, npcLocation('zuoci')!);
      rebirth(s, s.player.classId, s.player.gender, s.player.avatar);
      return !!s.flags.reborn;
    }
    case 'ring2':
    case 'ring3': {
      if (!s.ring.task) {
        go(s, 'xuchang');
        nextRing(s, sim.now, flag === 'ring2' ? 2 : 3);
        if (!s.ring.task) return false;
      }
      return doRingTask(sim);
    }

    case 'ringRound': {
      if (!s.ring.task) {
        go(s, 'xuchang');
        nextRing(s, sim.now);
        if (!s.ring.task) return false;
      }
      return doRingTask(sim);
    }
  }
  return false;
}

export function autoplay(s: Save, seed = 7, maxBattles = 600, untilStep = mainQuests.length): AutoplayReport {
  const sim: Sim = { s, rng: new Rng(seed), rep: { finished: false, battles: 0, wins: 0, losses: 0, level: 1, steps: [], generals: 0, rings: 0, lossAt: {} }, now: Date.UTC(2026, 2, 10, 2), lastSmith: 0, badSpot: {}, badLevel: 0 };
  const { rep } = sim;
  s.staminaAt = sim.now;
  let guard = 0;
  // 真人打头目输了会回去多练几级，这里每输一次多要求 1 级
  let extra = 0;
  let streak = 0;
  while (guard++ < 20000 && rep.battles < maxBattles) {
    const q = currentQuest(s);
    if (!q || s.main.state === 'done' || s.main.step >= untilStep) {
      rep.finished = true;
      break;
    }
    upkeep(sim);
    if (s.main.state === 'available') {
      go(s, npcLocation(q.giver)!);
      acceptQuest(s);
      continue;
    }
    if (s.main.state === 'ready' || q.type === 'talk') {
      go(s, npcLocation(q.turnIn)!);
      turnInQuest(s);
      extra = 0;
      rep.steps.push({ quest: q.title, level: s.player.level, battles: rep.battles });
      continue;
    }
    if (q.type === 'flag') {
      if (!doFlag(sim, q.flag!)) grind(sim);
      continue;
    }
    const at = q.target!.at;
    const monster = q.target!.monster ?? Object.keys(monsters).find((m) => monsters[m].drops.some((d) => d.item === q.target!.item && d.questOnly === q.id))!;
    const gi = groupFor(at, monster);
    if (gi < 0) throw new Error(`${locations[at].name} 没有 ${monsters[monster].name}`);
    const g = locations[at].groups[gi];
    const need = g.level[0] - (monsters[monster].boss ? 2 : 1) + extra;
    if (s.player.level < need) {
      grind(sim);
      continue;
    }
    go(s, at);
    const out = fight(sim, gi, q.type === 'capture' ? monster : null);
    // 输了就回去多练：头目每输一次多要 1 级；普通怪连输 3 次也多要 1 级
    if (out === 'lose') {
      streak++;
      if (monsters[monster].boss || streak >= 3) {
        extra = Math.min(extra + 1, 6);
        streak = 0;
      }
    } else if (out === 'win') streak = 0;
  }
  rep.level = s.player.level;
  rep.generals = s.generals.length + s.inn.length;
  rep.rings = s.life.rings ?? 0;
  return rep;
}

// 供调试：主角当前装备的总加成
export function gearSummary(s: Save): string {
  return (Object.entries(s.equip) as [Slot, NonNullable<Save['equip'][Slot]>][]).map(([slot, g]) => `${slot}:${g.tier}${g.q ? '+' : ''}(${tierLevel(g.tier)})atk${gearBonus(g).atk}`).join(' ');
}
