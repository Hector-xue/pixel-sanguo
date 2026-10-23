// 国战沙盘：魏、蜀、吴三国加董卓余部（群雄）争 17 座城。日子按「天下历」走：你每打一仗天下走一格，18 仗算一天，
// AI 势力一天走 24 回合（补兵、调兵、打邻城），七天一个赛季，按城数排名（同一个种子同一格，算出来的结果都一样）。
// 主角 60 级入一国：每天 8 道军令出征敌城（削守军）或驻守己城（补兵）；守军打光了守将出城单挑，赢了这座城归本国。
import { PASSIVES } from '../core/passives';
import { monsters, systems } from '../data';
import type { CityKind, NationId } from '../data';
import { createBattle } from '../core/battle';
import { monsterExp, monsterSilver } from '../core/formulas';
import type { BUnit, Battle } from '../core/battle';
import { Rng } from '../core/rng';
import { generalUnit, monsterUnit, playerUnit } from './encounter';
import { mirrorUnit, rivals } from './rivals';
import type { Rival } from './rivals';
import type { GzCity, GzWorld, Save } from './state';
import { bump, gzRank, log, rollRng, deployedUids } from './state';
import { DAY_BATTLES, TURNS, battlesToNextDay, calDay, calTick, turnOf, weekIndex } from './calendar';
import { grantReward, oreFor, randomGem } from './welfare';

export { DAY_BATTLES, SEASON_BATTLES, SEASON_DAYS, battlesToNextDay, calDay, calTick, turnOf, weekIndex, weekday } from './calendar';

const G = systems.guozhan;
export const PLAYABLE: NationId[] = ['wei', 'shu', 'wu'];

export function hashStr(str: string): number {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export const seasonTurns = TURNS;

// ===== 查询 =====
export const nationDef = (id: NationId) => G.nations.find((n) => n.id === id)!;
export const cityDef = (id: string) => G.cities.find((c) => c.id === id)!;
export const kindOf = (id: string) => G.kinds[cityDef(id).kind as CityKind];

export function neighbors(id: string): string[] {
  const out: string[] = [];
  for (const [a, b] of G.links) {
    if (a === id) out.push(b);
    else if (b === id) out.push(a);
  }
  return out;
}

export function citiesOf(w: GzWorld, n: NationId): string[] {
  return G.cities.filter((c) => w.cities[c.id].owner === n).map((c) => c.id);
}

function frontier(w: GzWorld, id: string): boolean {
  const o = w.cities[id].owner;
  return neighbors(id).some((x) => w.cities[x].owner !== o);
}

// ===== 开局与推进 =====
function newWorld(season: number): GzWorld {
  const cities: Record<string, GzCity> = {};
  for (const c of G.cities) cities[c.id] = { owner: c.owner, troops: Math.round(G.kinds[c.kind].max * (c.owner === 'qun' ? G.ai.qunStartPct : G.ai.startPct)) };
  return { season, turn: 0, cities, events: [], seq: 0 };
}

function event(w: GzWorld, text: string, big: boolean): void {
  w.seq++;
  w.events.push({ seq: w.seq, turn: w.turn, text, big });
  if (w.events.length > 60) w.events.splice(0, w.events.length - 60);
}

// 守军被你打光后的一天（24 回合）里：守城一方补不上兵、调不进兵，别家也不来抢，留给你去单挑守将
const ROUTED_TURNS = 24;

function routed(w: GzWorld, id: string): boolean {
  const c = w.cities[id];
  if (c.broken === undefined) return false;
  if (w.turn - c.broken < ROUTED_TURNS && c.troops <= 0) return true;
  delete c.broken;
  return false;
}

const natName = (n: NationId) => (n === 'qun' ? '董卓余部' : `${nationDef(n).name}军`);

// AI 走一回合：补兵 → 后方往前线调兵 → 各国看情况打邻城（都城 AI 只能围、打不下来，三国不会被 AI 灭掉）
function aiTurn(s: Save, w: GzWorld): void {
  const A = G.ai;
  const rng = new Rng(hashStr(`${s.seed}-gz-${w.season}-${w.turn}`));
  const counts: Record<string, number> = {};
  for (const c of G.cities) counts[w.cities[c.id].owner] = (counts[w.cities[c.id].owner] ?? 0) + 1;
  // 哀兵：一国只剩两座城以内，补兵更快、守城更硬（不然一国一垮，整张图一天就被吞掉）
  const lastStand = (n: NationId) => n !== 'qun' && (counts[n] ?? 0) <= A.lastStandCities;
  const defOf = (id: string) => kindOf(id).def * (lastStand(w.cities[id].owner) ? A.lastStandDef : 1);
  for (const c of G.cities) {
    const st = w.cities[c.id];
    const k = G.kinds[c.kind];
    if (routed(w, c.id)) continue;
    // 地盘越大补兵越慢（免得一家独大一路滚雪球），董卓余部只守不攻、补得也慢
    const damp = st.owner === 'qun' ? A.qunYieldMul : lastStand(st.owner) ? A.lastStandYield : Math.max(0.5, 1 - A.bigNationDamp * Math.max(0, counts[st.owner] - 4));
    st.troops = Math.min(k.max, st.troops + Math.round(k.yield * damp));
  }
  // 合纵：城最多的那一国（领先两座以上）会被另外两国当成头号对手，打它更积极、也更拼命
  const ranks = nationRanks(w);
  const leader = ranks[0].cities - ranks[1].cities >= 2 ? ranks[0].id : null;
  // 打这座城有多拼命：合纵打领头的、收复被你夺走的城，各自乘上去
  const drive = (t: GzCity, n: NationId) => (leader && t.owner === leader && n !== leader ? A.allyVsLeader : 1) * (t.lostBy === n ? A.revengeMul : 1);
  for (const n of rng.shuffle([...PLAYABLE])) {
    const mine = citiesOf(w, n);
    if (!mine.length) continue;
    rivalRaid(s, w, n, rng);
    const front = mine.filter((id) => frontier(w, id) && !routed(w, id));
    // 后方的城把一部分兵调到最缺兵的前线
    if (front.length) {
      const weakest = front.reduce((a, b) => (w.cities[a].troops / kindOf(a).max <= w.cities[b].troops / kindOf(b).max ? a : b));
      for (const id of mine) {
        if (front.includes(id)) continue;
        const move = Math.round(w.cities[id].troops * A.reinforcePct);
        const room = kindOf(weakest).max - w.cities[weakest].troops;
        const m = Math.min(move, room);
        if (m <= 0) continue;
        w.cities[id].troops -= m;
        w.cities[weakest].troops += m;
      }
    }
    // 被你夺走城的那一国一心想打回来：边上有它丢的城就更想出兵，打那座城也更拼命
    const revenge = front.some((id) => neighbors(id).some((x) => w.cities[x].lostBy === n && w.cities[x].owner !== n));
    const chance = A.attackChance + (leader && n !== leader ? A.allyAttackBonus : 0) + (revenge ? A.revengeAttackBonus : 0);
    if (!rng.chance(Math.min(0.95, chance))) continue;
    let best: { from: string; to: string; ratio: number } | null = null;
    for (const from of front) {
      for (const to of neighbors(from)) {
        const t = w.cities[to];
        // 守将正出城和你单挑的城，别家不来插手
        if (t.owner === n || routed(w, to)) continue;
        const ratio = (w.cities[from].troops * A.sendPct * drive(t, n)) / Math.max(1, t.troops * defOf(to)) * rng.range(0.9, 1.1);
        if (!best || ratio > best.ratio) best = { from, to, ratio };
      }
    }
    if (!best || best.ratio < A.minRatio) continue;
    const src = w.cities[best.from];
    const tgt = w.cities[best.to];
    const send = Math.round(src.troops * A.sendPct);
    src.troops -= send;
    const att = send * rng.range(A.luck[0], A.luck[1]) * drive(tgt, n);
    const def = Math.max(1, tgt.troops) * defOf(best.to) * rng.range(A.luck[0], A.luck[1]);
    const name = cityDef(best.to).name;
    if (att > def && cityDef(best.to).kind === 'capital') {
      // 都城 AI 打不下来，只能围城杀伤（要靠玩家斩守将才能夺都城）
      tgt.troops = Math.max(100, Math.round(tgt.troops * 0.4));
      event(w, `${natName(n)}围攻${name}，${natName(tgt.owner)}死守不退`, false);
    } else if (att > def) {
      const was = tgt.owner;
      tgt.owner = n;
      tgt.troops = Math.max(100, Math.round(send * (1 - def / att)));
      delete tgt.broken;
      delete tgt.lostBy;
      event(w, `${natName(n)}从${cityDef(best.from).name}出兵，攻占了${natName(was).replace('军', '')}的${name}`, true);
    } else {
      tgt.troops = Math.max(50, Math.round(tgt.troops - (att / defOf(best.to)) * 0.6));
      event(w, `${natName(n)}进攻${name}，被${natName(tgt.owner)}击退`, false);
    }
  }
}

// 敌国的 AI 玩家也在出征：你入了国以后，另外两国各有人每天打几仗，专挑本国前线兵少的城削守军
// （不然只有你一个人在打，本国几乎季季第一）。削不光，打光守军、斩将夺城只有你会
function rivalRaid(s: Save, w: GzWorld, n: NationId, rng: Rng): void {
  const me = s.p4.nation;
  const A = G.ai;
  if (!me || n === me || !rng.chance(A.raidChance)) return;
  const front = citiesOf(w, n).filter((id) => frontier(w, id));
  const targets = [...new Set(front.flatMap((id) => neighbors(id)))].filter((x) => w.cities[x].owner === me && w.cities[x].troops > 1 && !routed(w, x));
  if (!targets.length) return;
  const to = targets.reduce((a, b) => (w.cities[a].troops / kindOf(a).max <= w.cities[b].troops / kindOf(b).max ? a : b));
  const c = w.cities[to];
  const dmg = Math.round((kindOf(to).max * G.player.hitPct + s.player.level * G.player.hitPerLevel) * A.raidPower);
  c.troops = Math.max(1, c.troops - dmg);
  const rs = rivalsOf(s, n);
  const who = rs.length ? rng.pick(rs).name : natName(n);
  event(w, `${natName(n).replace('军', '国')}的${who}出征${cityDef(to).name}，守军折了${dmg}人`, false);
}

// 把世界推进到天下历第 t 格：跨了赛季先把旧赛季打完、结算，再开新局
export function syncWorld(s: Save, t = calTick(s)): GzWorld {
  const season = weekIndex(t);
  let w = s.p4.world;
  if (w && w.season !== season) {
    while (w.turn < TURNS) {
      aiTurn(s, w);
      w.turn++;
    }
    settleSeason(s, w);
    w = null;
  }
  if (!w) {
    w = newWorld(season);
    s.p4.world = w;
    s.p4.seen = 0;
  }
  const target = turnOf(t);
  while (w.turn < target) {
    aiTurn(s, w);
    w.turn++;
  }
  return w;
}

// 新出的大事进公告（最多 3 条，免得刷屏）
export function announce(s: Save): void {
  if (!s.p4.nation || s.player.level < G.minLevel) return;
  const w = syncWorld(s);
  const fresh = w.events.filter((e) => e.seq > s.p4.seen && e.big);
  for (const e of fresh.slice(-3)) log(s, `【国战】${e.text}`);
  s.p4.seen = w.seq;
}

// 排名：城多的在前，一样多比总兵力
export function nationRanks(w: GzWorld): { id: NationId; cities: number; troops: number }[] {
  return PLAYABLE.map((id) => {
    const cs = citiesOf(w, id);
    return { id, cities: cs.length, troops: cs.reduce((a, c) => a + w.cities[c].troops, 0) };
  }).sort((a, b) => b.cities - a.cities || b.troops - a.troops);
}

function settleSeason(s: Save, w: GzWorld): void {
  const n = s.p4.nation;
  if (n && s.p4.seasonMerit >= G.seasonMinMerit) {
    const rank = nationRanks(w).findIndex((x) => x.id === n) + 1;
    s.p4.seasonClaim = { season: w.season, nation: n, rank, merit: s.p4.seasonMerit };
  }
  s.p4.seasonMerit = 0;
}

export function claimSeason(s: Save): string[] {
  const c = s.p4.seasonClaim;
  if (!c) return ['没有能领的赛季奖励'];
  const r = G.seasonRewards[c.rank - 1];
  s.p4.seasonClaim = null;
  const lines = [`上赛季${nationDef(c.nation).full}排第${c.rank}`];
  lines.push(...grantReward(s, { ...r, silver: r.silverPerLevel * s.player.level }));
  if (c.rank === 1) bump(s, 'gzSeasonWins');
  for (const l of lines) log(s, l);
  return lines;
}

// ===== 入国 =====
export function joinReason(s: Save, t = calTick(s)): string {
  if (s.player.level < G.minLevel) return `${G.minLevel}级才能参加国战`;
  const wait = G.player.joinCooldownDays * DAY_BATTLES - (t - s.p4.joinedAt);
  if (s.p4.nation && wait > 0) return `入国${G.player.joinCooldownDays}天以内不能改投别国（还要打${wait}仗）`;
  return '';
}

export function joinNation(s: Save, id: NationId, t = calTick(s)): string {
  if (!PLAYABLE.includes(id) || s.p4.nation === id) return '';
  const why = joinReason(s, t);
  if (why) return why;
  const before = s.p4.nation;
  if (before) {
    // 改投别国：本赛季战功清零，可花的战功折半
    s.p4.seasonMerit = 0;
    s.p4.merit = Math.floor(s.p4.merit / 2);
  }
  s.p4.nation = id;
  s.p4.joinedAt = t;
  syncWorld(s, t);
  s.p4.seen = s.p4.world!.seq;
  bump(s, 'gzJoined');
  const d = nationDef(id);
  log(s, `${before ? `离开${nationDef(before).full}，` : ''}投奔了${d.full}（${d.ruler}）`);
  return before ? `改投${d.full}，本赛季战功清零，战功折半` : `投奔了${d.full}，听${d.ruler}调遣`;
}

// ===== 军令、官职、俸禄 =====
export function ordersLeft(s: Save, t = calTick(s)): number {
  const d = calDay(t);
  if (s.p4.orders.day !== d) s.p4.orders = { day: d, used: 0 };
  return Math.max(0, G.ordersPerDay - s.p4.orders.used);
}

export function rankName(s: Save): string {
  return G.ranks[gzRank(s.p4.meritTotal)].name;
}

export function nextRank(s: Save): { name: string; merit: number } | null {
  return G.ranks[gzRank(s.p4.meritTotal) + 1] ?? null;
}

function addMerit(s: Save, n: number): string[] {
  const before = gzRank(s.p4.meritTotal);
  s.p4.merit += n;
  s.p4.meritTotal += n;
  s.p4.seasonMerit += n;
  const after = gzRank(s.p4.meritTotal);
  s.life.gzRank = Math.max(s.life.gzRank ?? 0, after);
  return after > before ? [`战功够了，升为${G.ranks[after].name}！`] : [];
}

export function salary(s: Save): number {
  return gzRank(s.p4.meritTotal) * s.player.level * G.salaryPerRankLevel;
}

export function salaryClaimed(s: Save, t = calTick(s)): boolean {
  return s.p4.salaryDay === calDay(t);
}

export function claimSalary(s: Save, t = calTick(s)): string {
  if (!s.p4.nation) return '还没投奔哪一国';
  const d = calDay(t);
  if (s.p4.salaryDay === d) return `今天的俸禄已经领过了，再打${battlesToNextDay(t)}仗到明天`;
  const n = salary(s);
  if (!n) return '士卒没有俸禄，攒战功升了伍长再来';
  s.p4.salaryDay = d;
  s.player.silver += n;
  return `领到${rankName(s)}的俸禄${n}两`;
}

// 本国占着洛阳、虎牢关的加成
export function gzBuff(s: Save): { exp: number; silver: number } {
  const out = { exp: 0, silver: 0 };
  const w = s.p4.world;
  if (!s.p4.nation || !w || w.season !== weekIndex(calTick(s))) return out;
  for (const [id, b] of Object.entries(G.buffs)) {
    if (w.cities[id]?.owner !== s.p4.nation) continue;
    out.exp += b.exp ?? 0;
    out.silver += b.silver ?? 0;
  }
  return out;
}

// ===== 战功商店 =====
export function shopItemId(s: Save, id: string): string {
  if (id === '@ore') return oreFor(s.player.level);
  if (id === '@gem') return 'gem';
  return id;
}

export function buyWithMerit(s: Save, i: number): string {
  const e = G.shop[i];
  if (!e) return '';
  if (!s.p4.nation) return '还没投奔哪一国';
  if (s.p4.merit < e.cost) return `战功不够（要${e.cost}）`;
  s.p4.merit -= e.cost;
  const id = e.id === '@gem' ? randomGem(rollRng(s), Math.min(8, 1 + Math.floor(s.player.level / 20))) : shopItemId(s, e.id);
  const lines = grantReward(s, { items: { [id]: 1 } });
  return lines.join('，');
}

// ===== 出征、驻守、守将 =====
export type GzMode = 'atk' | 'def' | 'boss';

export function attackTargets(s: Save, w: GzWorld): string[] {
  const n = s.p4.nation;
  if (!n) return [];
  const mine = citiesOf(w, n);
  // 亡了国就只能去打回都城
  if (!mine.length) return G.cities.filter((c) => c.owner === n && c.kind === 'capital').map((c) => c.id);
  const set = new Set<string>();
  for (const id of mine) for (const x of neighbors(id)) if (w.cities[x].owner !== n) set.add(x);
  return [...set];
}

// 敌国都城的接应：和它接壤、还归同一国的城（有接应时守军打不光）
export function capitalCover(w: GzWorld, id: string): string[] {
  if (cityDef(id).kind !== 'capital') return [];
  const o = w.cities[id].owner;
  return neighbors(id).filter((x) => w.cities[x].owner === o);
}

export function defendTargets(s: Save, w: GzWorld): string[] {
  const n = s.p4.nation;
  if (!n) return [];
  return citiesOf(w, n).filter((id) => frontier(w, id));
}

export function guardOf(w: GzWorld, id: string): string {
  const owner = w.cities[id].owner;
  const list = G.guards[owner];
  return list[G.cities.findIndex((c) => c.id === id) % list.length];
}

// 哪一国的 AI 玩家：名册按序号轮着分给三国
export function rivalsOf(s: Save, n: NationId): Rival[] {
  const i = PLAYABLE.indexOf(n);
  return i < 0 ? [] : rivals(s).filter((_, k) => k % 3 === i);
}

export function cityReason(s: Save, w: GzWorld, id: string, mode: GzMode, t = calTick(s)): string {
  if (!s.p4.nation) return '还没投奔哪一国';
  if (s.player.level < G.minLevel) return `${G.minLevel}级才能参加国战`;
  const c = w.cities[id];
  if (mode === 'boss') {
    if (c.owner === s.p4.nation) return '这是本国的城';
    if (c.troops > 0) return '守军还没打光，守将不会出城';
    return '';
  }
  if (ordersLeft(s, t) <= 0) return `今天的军令用完了，去别处再打${battlesToNextDay(t)}仗就到明天`;
  if (mode === 'atk' && !attackTargets(s, w).includes(id)) return '只能打和本国接壤的城';
  if (mode === 'atk' && c.troops <= 0) return '守军已经打光了，去和守将单挑';
  if (mode === 'def' && !defendTargets(s, w).includes(id)) return '只有前线的本国城池需要驻守';
  if (mode === 'def' && c.troops >= kindOf(id).max) return '这座城兵已经满了';
  return '';
}

function team(s: Save): { allies: BUnit[]; reserve: BUnit[] } {
  const allies = [playerUnit(s)];
  const reserve: BUnit[] = [];
  const dep = deployedUids(s);
  for (const g of s.generals) {
    const u = generalUnit(g, s);
    if (dep.includes(g.uid) && u.alive) allies.push(u);
    else reserve.push(u);
  }
  return { allies, reserve };
}

// 守将：同级镜像（带装备和加点，比同级怪硬得多），气血再乘倍数；经验、银两、掉落照守将的怪物表算
function guardUnit(gid: string, lv: number): BUnit {
  const m = monsters[gid];
  const u = mirrorUnit('e0', m.name, m.class, 'male', 0, lv, 'enemy', lv > 100);
  u.maxHp = Math.round(u.maxHp * (m.hpMul ?? 1));
  u.hp = u.maxHp;
  u.atk = Math.round(u.atk * (m.atkMul ?? 1));
  // 名将定力足：乱、封、围不容易中
  for (const k of ['chaos', 'seal', 'trap'] as const) u.resist[k] += G.player.guardControlResist;
  return {
    ...u, kind: 'monster', refId: gid, monsterId: gid, look: m.look,
    skills: m.skills.map((x) => ({ id: x.id, level: x.level, prof: x.level * 2500 })),
    aiSkills: m.skills.map((x) => ({ id: x.id, rate: x.rate })),
    expYield: monsterExp(gid, lv), silverYield: monsterSilver(gid, lv),
    // 名将守城也带着自己的专属被动
    passive: PASSIVES[gid] ? gid : undefined,
  };
}

// 本国名将助阵：驻守时是这座城自己的守将，出征时按城池轮一位；AI 指挥，带着专属被动
export function aidOf(s: Save, w: GzWorld, id: string, mode: GzMode): string | null {
  const n = s.p4.nation;
  if (!n) return null;
  if (mode === 'def' && w.cities[id].owner === n) return guardOf(w, id);
  const list = G.guards[n];
  if (!list?.length) return null;
  return list[(G.cities.findIndex((c) => c.id === id) + 1) % list.length];
}

function aidUnit(gid: string, lv: number): BUnit {
  const m = monsters[gid];
  const u = mirrorUnit('a9', m.name, m.class, 'male', 0, Math.max(1, lv - 2), 'ally', lv > 100);
  u.atk = Math.round(u.atk * 0.9);
  return {
    ...u, look: m.look,
    skills: m.skills.map((x) => ({ id: x.id, level: x.level, prof: x.level * 2500 })),
    aiSkills: m.skills.map((x) => ({ id: x.id, rate: x.rate })),
    passive: PASSIVES[gid] ? gid : undefined,
  };
}

// 驻守时来犯的是哪一国：接壤的敌国里兵最多的那家
function attackerOf(w: GzWorld, id: string): NationId {
  const own = w.cities[id].owner;
  let best: NationId = 'qun';
  let most = -1;
  for (const x of neighbors(id)) {
    const c = w.cities[x];
    if (c.owner !== own && c.troops > most) {
      most = c.troops;
      best = c.owner;
    }
  }
  return best;
}

export function gzBattle(s: Save, id: string, mode: GzMode, seed: number, t = calTick(s)): Battle | string {
  const w = syncWorld(s, t);
  const why = cityReason(s, w, id, mode, t);
  if (why) return why;
  const rng = new Rng(seed);
  const foe = mode === 'def' ? attackerOf(w, id) : w.cities[id].owner;
  const lv = s.player.level;
  const pool = G.soldiers[foe];
  const enemies: BUnit[] = [];
  let title = '';
  // 我方多带一个副将，对面多一个人（这些仗原来按主角加一个副将配的）
  const extra = Math.max(0, deployedUids(s).length - 1);
  if (mode === 'boss') {
    const gid = guardOf(w, id);
    enemies.push(guardUnit(gid, lv + G.player.guardLevel));
    // 护卫：步卒、谋士、步卒（方士群攻太狠，不带）
    for (let i = 1; i <= Math.min(5, G.player.guardEscorts + extra); i++) enemies.push(monsterUnit(`e${i}`, pool[[0, 1, 0, 2, 0, 1][i - 1] ?? 0], lv, i < 3 ? 0 : 1));
    title = `${cityDef(id).name}守将·${enemies[0].name}`;
  } else {
    const n = Math.min(6, rng.int(3, 5) + extra);
    for (let i = 0; i < n; i++) enemies.push(monsterUnit(`e${i}`, rng.pick(pool), Math.max(1, lv + rng.int(-2, 1)), i < 3 ? 0 : 1));
    title = mode === 'atk' ? `出征·${cityDef(id).name}` : `驻守·${cityDef(id).name}`;
    // 有时敌国的 AI 玩家带队
    const rs = rivalsOf(s, foe);
    if (rs.length && rng.chance(G.player.mirrorChance)) {
      const r = rng.pick(rs);
      const m = mirrorUnit(`e${enemies.length}`, r.name, r.classId, r.gender, r.variant, Math.max(1, lv + rng.int(-3, 2)), 'enemy', lv > 100);
      m.row = 1;
      if (enemies.length >= 6) enemies[5] = m;
      else enemies.push(m);
      title = `${title}（${r.name}率${natName(foe)}）`;
    }
  }
  const { allies, reserve } = team(s);
  const aid = aidOf(s, w, id, mode);
  if (aid && allies.length < 5) {
    allies.push(aidUnit(aid, lv));
    title = `${title} · ${monsters[aid].name}助阵`;
  }
  return createBattle({
    seed: (rng.next() * 4294967296) >>> 0, allies, reserve, enemies, items: { ...s.bag }, title,
    canFlee: mode !== 'boss', tag: `gz:${mode}:${id}`,
  });
}

// 战斗结束后由 finishBattle 调用（t 是开打那一格，军令记在开打那天）
export function afterGz(s: Save, b: Battle, t = calTick(s)): string[] {
  const [, mode, id] = (b.tag ?? '').split(':') as [string, GzMode, string];
  const w = syncWorld(s, t);
  const c = w.cities[id];
  const name = cityDef(id).name;
  const n = s.p4.nation;
  const lines: string[] = [];
  if (mode !== 'boss') {
    ordersLeft(s, t);
    s.p4.orders.used++;
  }
  if (b.outcome !== 'win' || !c || !n) {
    lines.push(b.outcome === 'fled' ? '撤兵回营' : `${mode === 'boss' ? '没打过守将' : '出征失利'}，败退回营`);
    return lines;
  }
  const max = kindOf(id).max;
  const P = G.player;
  if (mode === 'atk') {
    if (c.owner === n) {
      lines.push(`${name}已经被本国拿下了`);
    } else {
      const dmg = Math.round(max * P.hitPct + s.player.level * P.hitPerLevel);
      // 都城还有自家的城接应，守军打不光（一天就斩将夺都城，整国一下就垮了）
      const floor = capitalCover(w, id).length ? Math.round(max * P.capitalFloorPct) : 0;
      c.troops = Math.max(Math.min(c.troops, floor), c.troops - dmg);
      lines.push(`击溃${name}守军${dmg}人（还剩${c.troops}），战功+${P.meritAtk}`);
      if (floor && c.troops <= floor) lines.push(`${name}有${capitalCover(w, id).map((x) => cityDef(x).name).join('、')}接应，守军打不光——先拿下这几座城，让${name}成孤城`);
      lines.push(...addMerit(s, P.meritAtk));
      if (c.troops <= 0) {
        c.broken = w.turn;
        lines.push(`${name}守军打光了！守将${monsters[guardOf(w, id)].name}要出城迎战——一天之内（再打${DAY_BATTLES}仗以内）在沙盘上点${name}和他单挑，过了这天守军就补回来了`);
      }
      bump(s, 'gzAttacks');
    }
  } else if (mode === 'def') {
    const add = Math.round(max * P.defendPct);
    c.troops = Math.min(max, c.troops + add);
    lines.push(`守住了${name}，守军+${add}（${c.troops}），战功+${P.meritDef}`);
    lines.push(...addMerit(s, P.meritDef));
    bump(s, 'gzDefends');
  } else if (c.owner !== n && c.troops <= 0) {
    const was = c.owner;
    c.owner = n;
    c.troops = Math.round(max * P.captureTroopsPct);
    delete c.broken;
    c.lostBy = was;
    event(w, `${s.player.name}率${natName(n)}攻下了${natName(was).replace('军', '')}的${name}`, true);
    s.p4.seen = w.seq;
    lines.push(`斩将夺城！${name}归了${nationDef(n).full}，战功+${P.meritBoss}`);
    lines.push(...addMerit(s, P.meritBoss));
    bump(s, 'gzCaptures');
  }
  return lines;
}
