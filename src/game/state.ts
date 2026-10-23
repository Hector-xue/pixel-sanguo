// 存档与游戏规则（纯逻辑，可测）。界面只调这里的函数，不直接改存档字段。
import { migrateTraining } from './training';
import { migrateCalendar, migrateDaily } from './calendar';
import { balance, bountyOptions, classSkills, classes, items, lockedExits, locations, mainQuests, monsters, npcs, skills, startLocation, systems } from '../data';
import { p5Defaults } from './bond';
import type { P5State } from './bond';
import type { Dir, NationId, QuestDef } from '../data';
import { deriveStats, expToNext, monsterAttrs, playerAttrsAt } from '../core/formulas';
import { addBonus, applyBonus, emptyBonus, gearsBonus, mountBonus } from '../core/gear';
import { Rng } from '../core/rng';
import type { Attrs, ClassId, Gear, Gender, SkillState, Slot, Stats } from '../core/types';
import { ATTR_KEYS } from '../core/types';

export type Channel = 'sys' | 'qu' | 'pai' | 'shang' | 'shi';

export interface Msg {
  t: number;
  ch: Channel;
  who?: string;
  text: string;
}

export type Grade = '常人' | '英才' | '将才';

export interface General {
  uid: string;
  monsterId: string;
  recruitId?: string;
  name: string;
  classId: ClassId;
  gender: Gender;
  look: string;
  baseLook?: string;
  grade: Grade;
  level: number;
  exp: number;
  apt: { growth: number } & Attrs;
  // 属性 = base（baseLevel 级时的属性）+ 之后每级按资质成长
  base: Attrs;
  baseLevel: number;
  hp: number;
  mp: number;
  loyalty: number;
  rapport: number;
  star: number;
  skills: SkillState[];
  attrs?: Attrs;
  // 转数：100 级以后转一次才能继续升
  reborn?: number;
  // 和主角结拜过：忠诚不掉、属性加成
  sworn?: boolean;
}

export type RingType = 'goto' | 'buy' | 'kill' | 'capture' | 'deliver';

export interface RingTask {
  type: RingType;
  at?: string;
  monster?: string;
  item?: string;
  count: number;
  have: number;
  arrived?: boolean;
}

// 赤壁的一局：第几局、三方各押了多少（擂鼓开战才结算）
export interface ChibiRound {
  id: number;
  bets: number[];
}

export type QuestState = 'available' | 'active' | 'ready' | 'done';

export interface Save {
  v: 1;
  server: string;
  createdAt: number;
  seed: number;
  player: {
    name: string;
    gender: Gender;
    classId: ClassId;
    avatar: number;
    level: number;
    exp: number;
    free: number;
    added: Attrs;
    hp: number;
    mp: number;
    silver: number;
    gold: number;
    boundSilver: number;
    skills: SkillState[];
  };
  generals: General[];
  inn: General[];
  activeGeneral: string | null;
  // 第二、三个出战的副将（30 级、60 级各开一个出战位）
  wings?: string[];
  nextUid: number;
  bag: Record<string, number>;
  location: string;
  // qv：主线版本（中间插过新任务，老存档读档时按任务 id 换算 step）
  main: { step: number; state: QuestState; count: number; qv?: number };
  bounty: { id: string; count: number } | null;
  flags: Record<string, boolean>;
  kills: Record<string, number>;
  quiz: { day: string; answered: number[] };
  messages: Msg[];
  battles: number;
  // ===== P2 =====
  equip: Partial<Record<Slot, Gear>>;
  gear: Gear[];
  storage: Record<string, number>;
  bank: number;
  mounts: Record<string, { level: number; exp: number }>;
  riding: string | null;
  stamina: number;
  staminaAt: number;
  pills: { day: string; n: number };
  day: string;
  ring: { index: number; task: RingTask | null };
  signin: { count: number; day: string };
  online: { day: string; seconds: number; claimed: number[] };
  mentor: { joined: boolean; graduated: boolean };
  dig: { left: number; n: number } | null;
  casino: { chibi: ChibiRound | null; net: number; guess: { pot: number; base: number } | null; round?: number };
  life: Record<string, number>;
  rolls: number;
  dayN?: number;
  // ===== P3 =====
  p3: P3State;
  // ===== P4 =====
  p4: P4State;
  // ===== 精品化：好感、奇遇 =====
  p5: P5State;
}

export interface ReplayRecord {
  t: number;
  title: string;
  at: string;
  init: import('../core/battle').BattleInit;
  rounds: import('../core/battle').ReplayRound[];
  outcome: 'win' | 'lose' | 'flee' | null;
}

export interface P3State {
  // 转数（100级转职一次 +1）
  reborn: number;
  sect: { id: string | null; rep: number; day: string; done: number; task: RingTask | null };
  arena: { rank: number; best: number; day: string; fights: number; wins: number };
  duel: { rank: number; best: number; day: string; fights: number };
  pk: { day: string; fights: number };
  evil: number;
  // 恶人值上次结算时天下历走到第几格（每打一仗消 1 点）
  evilAt?: number;
  // 随军操练的副将（老存档里还可能带着 start/hours，读档时折算掉）
  training: { who: string } | null;
  vault: Record<string, number>;
  vaultCap: number;
  titles: string[];
  title: string | null;
  achv: Record<string, number>;
  treasure: { day: string; used: number; found: string | null; at: string | null };
  silverRing: { day: string; earned: number; task: { need: number; have: number } | null };
  wenqu: { day: string; answered: number[]; right: number };
  lucky: { day: string; luck: number; draws: number };
  // last：上次结算时天下历走到第几格
  stall: { name: string; goods: { item: string; price: number; n: number }[]; last: number; sold: number; income: number };
  festival: string[];
  marriage: { spouse: string | null; favor: Record<string, number>; sworn: string[] };
  merc: { id: string; battles: number } | null;
  replays: ReplayRecord[];
  charm: number;
  vigor: number;
  vigorDay: string;
  // 造型（0～2）和已解锁的造型、性格
  skin: number;
  skins: number[];
  personality: string;
}

export function p3Defaults(): P3State {
  return {
    reborn: 0,
    sect: { id: null, rep: 0, day: '', done: 0, task: null },
    arena: { rank: 0, best: 0, day: '', fights: 0, wins: 0 },
    duel: { rank: 0, best: 0, day: '', fights: 0 },
    pk: { day: '', fights: 0 },
    evil: 0,
    training: null,
    vault: {},
    vaultCap: 40,
    titles: [],
    title: null,
    achv: {},
    treasure: { day: '', used: 0, found: null, at: null },
    silverRing: { day: '', earned: 0, task: null },
    wenqu: { day: '', answered: [], right: 0 },
    lucky: { day: '', luck: 0, draws: 0 },
    stall: { name: '', goods: [], last: 0, sold: 0, income: 0 },
    festival: [],
    marriage: { spouse: null, favor: {}, sworn: [] },
    merc: null,
    replays: [],
    charm: 0,
    vigor: 0,
    vigorDay: '',
    skin: 0,
    skins: [0],
    personality: '',
  };
}

// ===== P4：国战、军团争霸、跨区大战 =====
export interface GzCity {
  owner: NationId;
  troops: number;
  // 你把守军打光时走到第几回合：之后一天（24 回合）不补兵、不调兵进来，留给你去单挑守将
  broken?: number;
}

export interface GzEvent {
  seq: number;
  turn: number;
  text: string;
  // 城池易主才算大事（会进公告）
  big: boolean;
}

export interface GzWorld {
  season: number;
  turn: number;
  cities: Record<string, GzCity>;
  events: GzEvent[];
  seq: number;
}

export interface P4State {
  nation: NationId | null;
  // 入国时天下历走到第几格
  joinedAt: number;
  // 天下历的底数：总战斗场数减它就是天下历走了几格（老存档换算时定下）
  calBase: number;
  // 天下历的版本：2 = 每天几次的那些也换算过了
  calV: number;
  // 可花的战功、累计战功（定官职）、本赛季战功
  merit: number;
  meritTotal: number;
  seasonMerit: number;
  orders: { day: string; used: number };
  salaryDay: string;
  world: GzWorld | null;
  seen: number;
  seasonClaim: { season: number; nation: NationId; rank: number; merit: number } | null;
  league: { week: number; sect: string | null; fought: number[]; wins: number[]; claim: { week: number; sect: string; rank: number } | null };
  kuaqu: { week: number; day: string; foughtIds: number[]; points: number; wins: number; claim: { week: number; rank: number; points: number } | null };
}

export function p4Defaults(): P4State {
  return {
    nation: null,
    joinedAt: 0,
    calBase: 0,
    calV: 2,
    merit: 0,
    meritTotal: 0,
    seasonMerit: 0,
    orders: { day: '', used: 0 },
    salaryDay: '',
    world: null,
    seen: 0,
    seasonClaim: null,
    league: { week: 0, sect: null, fought: [0, 0, 0, 0, 0, 0, 0], wins: [0, 0, 0, 0, 0, 0, 0], claim: null },
    kuaqu: { week: 0, day: '', foughtIds: [], points: 0, wins: 0, claim: null },
  };
}

// 官职：按累计战功
export function gzRank(total: number): number {
  let r = 0;
  systems.guozhan.ranks.forEach((x, i) => {
    if (total >= x.merit) r = i;
  });
  return r;
}

// 主角贴图的变体：头像 + 3 × 造型
export function heroVariant(s: Save): number {
  return s.player.avatar + 3 * (s.p3?.skin ?? 0);
}

// 转职前等级停在 100
export function levelCap(s: Save): number {
  return s.p3.reborn > 0 ? balance.levelCap : balance.levelCapBeforeRebirth;
}

export interface NewGameOpts {
  server: string;
  name: string;
  gender: Gender;
  classId: ClassId;
  avatar: number;
  seed?: number;
}

const zeroAttrs = (): Attrs => ({ con: 0, str: 0, int: 0, agi: 0 });

function p2Defaults(): Pick<Save, 'equip' | 'gear' | 'storage' | 'bank' | 'mounts' | 'riding' | 'stamina' | 'staminaAt' | 'pills' | 'day' | 'ring' | 'signin' | 'online' | 'mentor' | 'dig' | 'casino' | 'life' | 'rolls'> {
  return {
    equip: {}, gear: [], storage: {}, bank: 0, mounts: {}, riding: null,
    stamina: balance.stamina.max, staminaAt: Date.now(), pills: { day: '', n: 0 }, day: '',
    ring: { index: 0, task: null }, signin: { count: 0, day: '' }, online: { day: '', seconds: 0, claimed: [] },
    mentor: { joined: false, graduated: false }, dig: null, casino: { chibi: null, net: 0, guess: null }, life: {}, rolls: 0,
  };
}

// 存档自带的随机数：每次取一个新种子，结果可复现
export function rollRng(s: Save): Rng {
  s.rolls = (s.rolls ?? 0) + 1;
  return new Rng((Math.imul(s.seed, 2654435761) + Math.imul(s.rolls, 40503)) >>> 0);
}

export function dayKey(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// 本地时区的第几天（跨天判断用）
export function dayNum(now = Date.now()): number {
  return Math.floor((now - new Date(now).getTimezoneOffset() * 60000) / 86400000);
}

export function bump(s: Save, key: string, n = 1): void {
  s.life[key] = (s.life[key] ?? 0) + n;
}

export function newSave(o: NewGameOpts): Save {
  const s: Save = {
    v: 1,
    server: o.server,
    createdAt: Date.now(),
    seed: o.seed ?? 1,
    player: {
      name: o.name,
      gender: o.gender,
      classId: o.classId,
      avatar: o.avatar,
      level: 1,
      exp: 0,
      free: balance.freePointsAtStart,
      added: zeroAttrs(),
      hp: 0,
      mp: 0,
      silver: 0,
      gold: 0,
      boundSilver: 0,
      skills: [],
    },
    generals: [],
    inn: [],
    activeGeneral: null,
    nextUid: 1,
    bag: {},
    location: startLocation,
    main: { step: 0, state: 'available', count: 0, qv: MAIN_QV },
    bounty: null,
    flags: {},
    kills: {},
    quiz: { day: '', answered: [] },
    messages: [],
    battles: 0,
    ...p2Defaults(),
    p3: p3Defaults(),
    p4: p4Defaults(),
    p5: p5Defaults(),
  };
  const st = playerStats(s);
  s.player.hp = st.maxHp;
  s.player.mp = st.maxMp;
  return s;
}

export function log(s: Save, text: string, ch: Channel = 'sys', who?: string): void {
  s.messages.push({ t: Date.now(), ch, who, text });
  if (s.messages.length > 200) s.messages.splice(0, s.messages.length - 200);
}

// ===== 属性 =====

export function playerAttrs(s: Save): Attrs {
  return playerAttrsAt(s.player.classId, s.player.level, s.player.added);
}

export function playerBonus(s: Save) {
  const ride = s.riding ? s.mounts[s.riding] : undefined;
  return addBonus(addBonus(gearsBonus(Object.values(s.equip)), mountBonus(ride ? s.riding : null, ride?.level ?? 1)), p3Bonus(s));
}

// 教派职位、转数、配偶带来的加成
export function sectRank(rep: number): number {
  let r = 0;
  systems.sect.ranks.forEach((x, i) => {
    if (rep >= x.rep) r = i;
  });
  return r;
}

export function p3Bonus(s: Save) {
  const b = emptyBonus();
  const p3 = s.p3;
  if (!p3) return b;
  const sect = p3.sect.id && systems.sect.sects.find((x) => x.id === p3.sect.id);
  if (sect) {
    const k = (sectRank(p3.sect.rep) + 1) * s.player.level;
    const per = systems.sect.perkPerRank;
    if (sect.perk === 'atk') b.atk += Math.round(k * per.atk);
    if (sect.perk === 'spd') b.spd += Math.round(k * per.spd);
    if (sect.perk === 'mp') b.mp += Math.round(k * per.mp);
    if (sect.perk === 'def') {
      b.def += Math.round(k * per.def);
      b.hp += Math.round(k * per.hp);
    }
  }
  b.mul += p3.reborn * balance.rebirth.statMul;
  if (p3.marriage.spouse) b.hp += s.player.level * balance.marriage.hpPerLevel;
  // 国战官职
  if (s.p4?.nation) {
    const k = gzRank(s.p4.meritTotal) * s.player.level;
    const rb = systems.guozhan.rankBonus;
    b.hp += Math.round(k * rb.hp);
    b.atk += Math.round(k * rb.atk);
    b.def += Math.round(k * rb.def);
  }
  return b;
}

export function playerStats(s: Save): Stats {
  const b = playerBonus(s);
  const a = playerAttrs(s);
  a.con += b.con;
  return applyBonus(deriveStats(a, s.player.level, s.player.classId), b);
}

const GEN_PER = (balance.autoAttrPerLevel * 4 + balance.freePointsPerLevel) / 4;

export function generalAttrs(g: General): Attrs {
  const up = Math.max(0, g.level - g.baseLevel);
  const out = zeroAttrs();
  for (const k of ATTR_KEYS) out[k] = Math.round(g.base[k] + up * GEN_PER * g.apt[k] * g.apt.growth);
  return out;
}

export function generalStats(g: General): Stats {
  const G = balance.general;
  const b = emptyBonus();
  b.mul = g.star * G.starStatMul + (g.sworn ? systems.marriage.swornMul : 0);
  b.rates.crit = Math.floor(g.rapport / G.rapportRateDiv);
  b.rates.dodge = Math.floor(g.rapport / G.rapportRateDiv);
  return applyBonus(deriveStats(generalAttrs(g), g.level, g.classId), b);
}

export function className(id: ClassId): string {
  return classes[id].name;
}

// 加点：add 里每项是要加的点数
export function allocate(s: Save, add: Attrs): boolean {
  const total = ATTR_KEYS.reduce((n, k) => n + Math.max(0, Math.floor(add[k])), 0);
  if (total <= 0 || total > s.player.free) return false;
  for (const k of ATTR_KEYS) s.player.added[k] += Math.max(0, Math.floor(add[k]));
  s.player.free -= total;
  s.flags.allocated = true;
  onFlag(s, 'allocated');
  return true;
}

// ===== 经验与升级 =====

export function grantPlayerExp(s: Save, amount: number): string[] {
  const out: string[] = [];
  const p = s.player;
  if (amount <= 0) return out;
  p.exp += amount;
  const cap = levelCap(s);
  while (p.level < cap && p.exp >= expToNext(p.level)) {
    p.exp -= expToNext(p.level);
    p.level++;
    p.free += balance.freePointsPerLevel;
    const st = playerStats(s);
    p.hp = st.maxHp;
    p.mp = st.maxMp;
    out.push(`恭喜！${p.name}升到了${p.level}级，获得${balance.freePointsPerLevel}个属性点`);
  }
  // 到了上限经验不再往上涨（转职前是 100 级）
  if (p.level >= cap && p.exp >= expToNext(p.level)) {
    p.exp = expToNext(p.level) - 1;
    if (cap < balance.levelCap && !s.flags.capNotice) {
      s.flags.capNotice = true;
      out.push('已经100级了，去洛阳找左慈转职，才能继续升级');
    }
  }
  return out;
}

export function grantGeneralExp(g: General, amount: number): string[] {
  const out: string[] = [];
  if (amount <= 0) return out;
  g.exp += amount;
  const cap = g.reborn ? balance.levelCap : balance.levelCapBeforeRebirth;
  while (g.level < cap && g.exp >= expToNext(g.level)) {
    g.exp -= expToNext(g.level);
    g.level++;
    // 副将升级按资质自动长属性（见 generalAttrs）
    const st = generalStats(g);
    g.hp = st.maxHp;
    g.mp = st.maxMp;
    out.push(`副将${g.name}升到了${g.level}级`);
  }
  return out;
}

// ===== 背包 =====

export function bagUsed(s: Save): number {
  return Object.entries(s.bag).reduce((n, [id, c]) => n + (items[id]?.quest ? 0 : c), 0) + s.gear.length;
}

export function bagCap(s: Save): number {
  return playerStats(s).carry;
}

export function bagCount(s: Save, id: string): number {
  return s.bag[id] ?? 0;
}

// 放进背包，满了放不下的部分返回丢失数量（任务物品不占负重）
export function addItem(s: Save, id: string, n: number): number {
  const def = items[id];
  if (!def || n <= 0) return 0;
  const room = def.quest ? n : Math.max(0, bagCap(s) - bagUsed(s));
  const put = Math.min(n, room);
  if (put > 0) s.bag[id] = (s.bag[id] ?? 0) + put;
  return n - put;
}

export function removeItem(s: Save, id: string, n: number): boolean {
  if (bagCount(s, id) < n) return false;
  s.bag[id] -= n;
  if (s.bag[id] <= 0) delete s.bag[id];
  return true;
}

export type Target = 'player' | string;

export function targetHpMp(s: Save, t: Target): { hp: number; mp: number; maxHp: number; maxMp: number; name: string } | null {
  if (t === 'player') {
    const st = playerStats(s);
    return { hp: s.player.hp, mp: s.player.mp, maxHp: st.maxHp, maxMp: st.maxMp, name: s.player.name };
  }
  const g = findGeneral(s, t);
  if (!g) return null;
  const st = generalStats(g);
  return { hp: g.hp, mp: g.mp, maxHp: st.maxHp, maxMp: st.maxMp, name: g.name };
}

function setHpMp(s: Save, t: Target, hp: number, mp: number): void {
  if (t === 'player') {
    s.player.hp = hp;
    s.player.mp = mp;
    return;
  }
  const g = findGeneral(s, t);
  if (g) {
    g.hp = hp;
    g.mp = mp;
  }
}

export function useItem(s: Save, id: string, t: Target): string {
  const def = items[id];
  const cur = targetHpMp(s, t);
  if (!def || !cur || def.cat !== 'drug') return '这个物品不能使用';
  if (!removeItem(s, id, 1)) return '物品不足';
  const hp = Math.min(def.hp ?? 0, cur.maxHp - cur.hp);
  const mp = Math.min(def.mp ?? 0, cur.maxMp - cur.mp);
  setHpMp(s, t, cur.hp + hp, cur.mp + mp);
  const parts = [hp ? `气血+${hp}` : '', mp ? `精力+${mp}` : ''].filter(Boolean).join('，');
  return `${cur.name}使用了${def.name}${parts ? '，' + parts : '，但没有效果'}`;
}

// 快速恢复：用背包里的药把主角和随行副将补满，先用小药
export function quickRecover(s: Save): string {
  const targets: Target[] = ['player', ...s.generals.map((g) => g.uid)];
  const drugs = Object.keys(s.bag).filter((id) => items[id]?.cat === 'drug');
  let used = 0;
  for (const kind of ['hp', 'mp'] as const) {
    const list = drugs.filter((id) => (items[id][kind] ?? 0) > 0).sort((a, b) => (items[a][kind] ?? 0) - (items[b][kind] ?? 0));
    for (const t of targets) {
      for (const id of list) {
        while (bagCount(s, id) > 0) {
          const cur = targetHpMp(s, t)!;
          const missing = kind === 'hp' ? cur.maxHp - cur.hp : cur.maxMp - cur.mp;
          if (missing <= 0) break;
          useItem(s, id, t);
          used++;
        }
      }
    }
  }
  return used ? `快速恢复用掉了${used}个药品` : '不需要恢复，或者没有合适的药';
}

// ===== 医馆 =====

export function healCost(s: Save): number {
  if (s.player.level < balance.hospital.freeBelowLevel) return 0;
  let missing = 0;
  for (const t of ['player', ...s.generals.map((g) => g.uid)]) {
    const c = targetHpMp(s, t)!;
    missing += c.maxHp - c.hp + (c.maxMp - c.mp);
  }
  return Math.ceil(missing * balance.hospital.costPerPoint);
}

export function heal(s: Save): string {
  const cost = healCost(s);
  if (s.player.silver < cost) return `银两不足，治疗需要${cost}两`;
  s.player.silver -= cost;
  for (const t of ['player', ...s.generals.map((g) => g.uid)]) {
    const c = targetHpMp(s, t)!;
    setHpMp(s, t, c.maxHp, c.maxMp);
  }
  return cost ? `治疗完毕，花费${cost}两` : '治疗完毕（10级以前免费）';
}

export function buy(s: Save, id: string, n: number): string {
  const def = items[id];
  if (!def || n <= 0) return '没有这个商品';
  const cost = def.price * n;
  if (s.player.silver < cost) return '银两不足';
  if (bagUsed(s) + n > bagCap(s)) return '负重已满，放不下了';
  s.player.silver -= cost;
  addItem(s, id, n);
  return `买了${n}个${def.name}，花费${cost}两`;
}

export function sellPrice(id: string): number {
  return Math.floor((items[id]?.price ?? 0) * balance.hospital.sellRatio);
}

export function sell(s: Save, id: string, n: number): string {
  const def = items[id];
  if (!def || def.quest) return '这个东西不能卖';
  if (!removeItem(s, id, n)) return '数量不足';
  const gain = sellPrice(id) * n;
  s.player.silver += gain;
  return `卖出${n}个${def.name}，得到${gain}两`;
}

// ===== 技能学校 =====

export interface SkillRow {
  id: string;
  name: string;
  desc: string;
  state: SkillState | null;
  action: 'learn' | 'upgrade' | null;
  reason: string;
}

export function profCap(level: number): number {
  return level * balance.skill.profPerLevel;
}

export function skillSchool(s: Save): SkillRow[] {
  const p = s.player;
  return classSkills(p.classId, p.gender).map((id) => {
    const def = skills[id];
    const st = p.skills.find((x) => x.id === id) ?? null;
    if (!st) {
      const ok = p.level >= def.learnLevel;
      return { id, name: def.name, desc: def.desc, state: null, action: ok ? 'learn' : null, reason: ok ? '' : `${def.learnLevel}级可学` };
    }
    if (st.level > balance.skill.maxLevel) return { id, name: def.name, desc: def.desc, state: st, action: null, reason: '已入化境' };
    if (st.level === balance.skill.maxLevel) {
      const r = huajingReason(p.level, st);
      return { id, name: def.name, desc: def.desc, state: st, action: r ? null : 'upgrade', reason: r || '可以进入化境' };
    }
    const needLv = st.level * balance.skill.roleLevelPerSkillLevel;
    const needProf = profCap(st.level);
    let reason = '';
    if (st.prof < needProf) reason = `熟练度${st.prof}/${needProf}`;
    else if (p.level < needLv) reason = `人物${needLv}级可升`;
    return { id, name: def.name, desc: def.desc, state: st, action: reason ? null : 'upgrade', reason };
  });
}

// 化境：5 级满熟练度、人物 90 级（第 6 级）
export function huajingReason(level: number, st: SkillState): string {
  const full = profCap(balance.skill.maxLevel);
  if (st.prof < full) return `熟练度${st.prof}/${full}后可入化境`;
  if (level < balance.skill.huajingLevel) return `${balance.skill.huajingLevel}级可入化境`;
  return '';
}

export function skillLevelText(level: number): string {
  return level > balance.skill.maxLevel ? '化境' : `${level}级`;
}

export function learnSkill(s: Save, id: string): string {
  const row = skillSchool(s).find((r) => r.id === id);
  if (!row || row.action !== 'learn') return row?.reason || '不能学习';
  s.player.skills.push({ id, level: 1, prof: 0 });
  s.flags.learned = true;
  onFlag(s, 'learned');
  return `学会了${row.name}`;
}

export function upgradeSkill(s: Save, id: string): string {
  const row = skillSchool(s).find((r) => r.id === id);
  if (!row || row.action !== 'upgrade' || !row.state) return row?.reason || '不能升级';
  row.state.level++;
  if (row.state.level > balance.skill.maxLevel) {
    bump(s, 'huajing');
    log(s, `${row.name}进入化境`);
    return `${row.name}进入化境！威力大增`;
  }
  return `${row.name}升到了${row.state.level}级（熟练度不清零）`;
}

export function addProf(st: SkillState, n: number): void {
  st.prof = Math.min(profCap(st.level), st.prof + n);
}

// ===== 副将 =====

export function findGeneral(s: Save, uid: string): General | undefined {
  return s.generals.find((g) => g.uid === uid) ?? s.inn.find((g) => g.uid === uid);
}

export function rollApt(grade: Grade, rng: Rng): General['apt'] {
  const A = balance.generalAptitude[grade];
  const roll = (r: number[]) => Math.round(rng.range(r[0], r[1]) * 100) / 100;
  return { growth: roll(A.growth), con: roll(A.attr), str: roll(A.attr), int: roll(A.attr), agi: roll(A.attr) };
}

export function makeGeneral(s: Save, monsterId: string, level: number, rng: Rng): General {
  const m = monsters[monsterId];
  const g: General = {
    uid: `g${s.nextUid++}`,
    monsterId,
    name: m.name,
    classId: m.class,
    gender: m.gender,
    look: m.look,
    grade: '常人',
    level,
    exp: 0,
    apt: rollApt('常人', rng),
    base: monsterAttrs(monsterId, level),
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

// 招降成功：随行没满就跟着走，满了放进馆驿
export function addGeneral(s: Save, g: General): string {
  if (s.generals.length < balance.followerMax) {
    s.generals.push(g);
    if (!s.activeGeneral) s.activeGeneral = g.uid;
    return `${g.name}成为了你的副将`;
  }
  s.inn.push(g);
  return `${g.name}成为了你的副将。随行副将已满，自动放进馆驿`;
}

export function setActive(s: Save, uid: string | null): void {
  // 操练中的副将叫上场，就不再操练了
  if (uid !== null && s.p3?.training?.who === uid) s.p3.training = null;
  if (uid === null || s.generals.some((g) => g.uid === uid)) s.activeGeneral = uid;
  if (uid) s.wings = (s.wings ?? []).filter((x) => x !== uid);
}

// ===== 出战位：1 级一个，30 级、60 级各多开一个 =====
export const DEPLOY_LEVELS = [1, 30, 60];

export function deploySlots(s: Save): number {
  return DEPLOY_LEVELS.filter((lv) => s.player.level >= lv).length;
}

// 这一仗跟着上场的副将（按出战顺序，不超过出战位）
export function deployedUids(s: Save): string[] {
  const ids = [s.activeGeneral, ...(s.wings ?? [])].filter((x): x is string => !!x && s.generals.some((g) => g.uid === x));
  return [...new Set(ids)].slice(0, deploySlots(s));
}

export function isDeployed(s: Save, uid: string): boolean {
  return deployedUids(s).includes(uid);
}

// 副将详情里点「出战」/「休息」
export function toggleDeploy(s: Save, uid: string): string {
  const g = s.generals.find((x) => x.uid === uid);
  if (!g) return '';
  if (isDeployed(s, uid)) {
    if (s.activeGeneral === uid) {
      const rest = (s.wings ?? []).filter((x) => x !== uid);
      s.activeGeneral = rest.shift() ?? null;
      s.wings = rest;
    } else s.wings = (s.wings ?? []).filter((x) => x !== uid);
    return `${g.name}下场休息`;
  }
  const n = deployedUids(s).length;
  const slots = deploySlots(s);
  if (n >= slots) {
    const next = DEPLOY_LEVELS[slots];
    return next ? `出战位满了（${next}级再开一个），先让一个副将休息` : '出战位满了，先让一个副将休息';
  }
  if (s.p3?.training?.who === uid) s.p3.training = null;
  if (!s.activeGeneral || !s.generals.some((x) => x.uid === s.activeGeneral)) s.activeGeneral = uid;
  else s.wings = [...(s.wings ?? []).filter((x) => x !== uid && s.generals.some((y) => y.uid === x)), uid];
  return `${g.name}出战`;
}

// 离队、进馆驿时把出战位腾出来
function undeploy(s: Save, uid: string): void {
  s.wings = (s.wings ?? []).filter((x) => x !== uid);
  if (s.activeGeneral === uid) s.activeGeneral = s.wings.shift() ?? s.generals[0]?.uid ?? null;
}

export function moveToInn(s: Save, uid: string): string {
  const g = s.generals.find((x) => x.uid === uid);
  if (!g) return '';
  s.generals = s.generals.filter((x) => x !== g);
  s.inn.push(g);
  undeploy(s, uid);
  return `${g.name}去馆驿休息了`;
}

export function moveToTeam(s: Save, uid: string): string {
  const g = s.inn.find((x) => x.uid === uid);
  if (!g) return '';
  if (s.generals.length >= balance.followerMax) return `随行副将最多${balance.followerMax}个`;
  s.inn = s.inn.filter((x) => x !== g);
  s.generals.push(g);
  if (!s.activeGeneral) s.activeGeneral = g.uid;
  return `${g.name}开始随行`;
}

export function releaseGeneral(s: Save, uid: string): string {
  const g = findGeneral(s, uid);
  if (!g) return '';
  s.generals = s.generals.filter((x) => x !== g);
  s.inn = s.inn.filter((x) => x !== g);
  undeploy(s, uid);
  return `${g.name}离开了队伍`;
}

// ===== 地图 =====

export const DIRS: Dir[] = ['up', 'left', 'right', 'down'];

export function exitsOf(locId: string): { dir: Dir; to: string; name: string; locked: boolean }[] {
  const loc = locations[locId];
  return DIRS.filter((d) => loc.exits[d]).map((d) => {
    const to = loc.exits[d]!;
    const locked = to.startsWith('@');
    return { dir: d, to, name: locked ? lockedExits[to] : locations[to].name, locked };
  });
}

// 广度优先找路（任务"开启寻路"）
export function findPath(from: string, to: string): string[] | null {
  if (from === to) return [from];
  const prev = new Map<string, string>([[from, '']]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of exitsOf(cur)) {
      if (e.locked || prev.has(e.to)) continue;
      prev.set(e.to, cur);
      if (e.to === to) {
        const path = [to];
        let p = cur;
        while (p) {
          path.unshift(p);
          p = prev.get(p)!;
        }
        return path;
      }
      queue.push(e.to);
    }
  }
  return null;
}

// 到达某地：记下去过（馆驿传送、跑环用），跑环的"送信"到了就算完成
export function arrive(s: Save, to: string): void {
  s.location = to;
  s.flags[`v_${to}`] = true;
  // 生活技能的采集点按走过的步数恢复
  if (s.p5?.life) s.p5.life.steps++;
  const t = s.ring?.task;
  if (t && t.type === 'goto' && t.at === to) t.arrived = true;
  const st = s.p3?.sect.task;
  if (st && st.type === 'goto' && st.at === to) st.arrived = true;
}

export function moveTo(s: Save, to: string): boolean {
  const ok = exitsOf(s.location).some((e) => e.to === to && !e.locked) || (to === startLocation && s.location !== to) || (s.location === 'baodong' && to === 'xuchang');
  if (ok) arrive(s, to);
  return ok;
}

export function npcLocation(npcId: string): string | null {
  for (const [id, loc] of Object.entries(locations)) if (loc.npcs.includes(npcId)) return id;
  return null;
}

// ===== 主线任务 =====

export function currentQuest(s: Save): QuestDef | null {
  return mainQuests[s.main.step] ?? null;
}

// NPC 名字后的标记：! 有任务可接，? 可以交任务
export function npcMark(s: Save, npcId: string): '!' | '?' | null {
  const q = currentQuest(s);
  if (!q || s.main.state === 'done') return null;
  if (s.main.state === 'available' && q.giver === npcId) return '!';
  if (s.main.state === 'ready' && q.turnIn === npcId) return '?';
  if (s.main.state === 'active' && q.type === 'talk' && q.turnIn === npcId) return '?';
  return null;
}

// 主线中途插过的任务：版本号 → 那一版新加的任务 id
const MAIN_INSERTS: Record<number, string[]> = { 2: ['m7a', 'm7b', 'm8a', 'm15a'] };
export const MAIN_QV = 2;

// 老存档的 step 是按旧任务表数的，换算成新表里同一个任务的位置（插在前面的新任务就跳过了）
export function migrateMain(s: Save): void {
  let v = s.main.qv ?? 1;
  while (v < MAIN_QV) {
    v++;
    const added = new Set(MAIN_INSERTS[v] ?? []);
    const later = new Set(Object.entries(MAIN_INSERTS).filter(([k]) => Number(k) > v).flatMap(([, ids]) => ids));
    const old = mainQuests.filter((q) => !added.has(q.id) && !later.has(q.id)).map((q) => q.id);
    const id = old[s.main.step];
    s.main.step = id ? mainQuests.findIndex((q) => q.id === id) : mainQuests.length;
  }
  s.main.qv = MAIN_QV;
}

export function acceptQuest(s: Save): void {
  const q = currentQuest(s);
  if (!q || s.main.state !== 'available') return;
  s.main.state = 'active';
  s.main.count = 0;
  if (q.type === 'flag' && q.flag && s.flags[q.flag]) s.main.state = 'ready';
  if (q.type === 'collect') checkCollect(s);
  log(s, `接受任务：${q.title}`);
}

export interface QuestReward {
  exp: number;
  silver: number;
  items: Record<string, number>;
  lines: string[];
}

export function turnInQuest(s: Save): QuestReward | null {
  const q = currentQuest(s);
  if (!q) return null;
  const ready = s.main.state === 'ready' || (s.main.state === 'active' && q.type === 'talk');
  if (!ready) return null;
  if (q.type === 'collect' && q.target?.item) removeItem(s, q.target.item, bagCount(s, q.target.item));
  const r = q.reward;
  const out: QuestReward = { exp: r.exp ?? 0, silver: r.silver ?? 0, items: r.items ?? {}, lines: [] };
  s.player.silver += out.silver;
  out.lines.push(...grantPlayerExp(s, out.exp));
  for (const [id, n] of Object.entries(out.items)) {
    const lost = addItem(s, id, n);
    if (lost) out.lines.push(`负重已满，${lost}个${items[id].name}没拿到`);
  }
  log(s, `完成任务：${q.title}，获得经验${out.exp}${out.silver ? `、银两${out.silver}` : ''}`);
  for (const l of out.lines) log(s, l);
  s.main.step++;
  s.main.count = 0;
  s.main.state = mainQuests[s.main.step] ? 'available' : 'done';
  return out;
}

export function questNeed(q: QuestDef): number {
  return q.target?.count ?? 1;
}

export function questProgressText(s: Save): string {
  const q = currentQuest(s);
  if (!q) return '新手任务全部完成';
  if (s.main.state === 'available') return `去找${npcName(q.giver)}接任务`;
  if (s.main.state === 'ready') return `已完成，回去找${npcName(q.turnIn)}`;
  if (q.type === 'kill' || q.type === 'capture' || q.type === 'collect') return `${q.goal}：${s.main.count}/${questNeed(q)}`;
  return q.goal;
}

export function npcName(id: string): string {
  return npcs[id]?.name ?? id;
}

// 任务现在该去哪（寻路目的地）
export function questDestination(s: Save): string | null {
  const q = currentQuest(s);
  if (!q || s.main.state === 'done') return null;
  if (s.main.state === 'available') return npcLocation(q.giver);
  if (s.main.state === 'ready' || q.type === 'talk' || q.type === 'flag') return npcLocation(q.turnIn);
  return q.target?.at ?? null;
}

function setCount(s: Save, q: QuestDef, n: number): string | null {
  const need = questNeed(q);
  s.main.count = Math.min(need, n);
  if (s.main.count >= need) {
    s.main.state = 'ready';
    return `任务【${q.title}】已完成，回去找${npcName(q.turnIn)}`;
  }
  return null;
}

// 战后更新任务进度，返回要显示的进度句子
export function onBattleKills(s: Save, kills: Record<string, number>): string[] {
  const out: string[] = [];
  for (const [m, n] of Object.entries(kills)) s.kills[m] = (s.kills[m] ?? 0) + n;
  const q = currentQuest(s);
  if (q && s.main.state === 'active' && q.type === 'kill' && q.target?.monster && kills[q.target.monster]) {
    const name = monsters[q.target.monster].name;
    const done = setCount(s, q, s.main.count + kills[q.target.monster]);
    out.push(done ?? `已经打败${s.main.count}个${name}，还差${questNeed(q) - s.main.count}个`);
  }
  if (s.bounty) {
    const opt = bountyOptions.find((b) => b.id === s.bounty!.id);
    if (opt && kills[opt.monster]) {
      s.bounty.count = Math.min(opt.count, s.bounty.count + kills[opt.monster]);
      const name = monsters[opt.monster].name;
      out.push(s.bounty.count >= opt.count ? `悬赏令完成，回去找捕快领${opt.silver}两` : `悬赏令：${name}${s.bounty.count}/${opt.count}`);
    }
  }
  return out;
}

export function onCapture(s: Save, monsterId: string): string | null {
  const q = currentQuest(s);
  if (q && s.main.state === 'active' && q.type === 'capture' && q.target?.monster === monsterId) {
    return setCount(s, q, s.main.count + 1) ?? `已经招降${s.main.count}个${monsters[monsterId].name}`;
  }
  return null;
}

export function onFlag(s: Save, flag: string): void {
  const q = currentQuest(s);
  if (q && s.main.state === 'active' && q.type === 'flag' && q.flag === flag) {
    s.main.state = 'ready';
    log(s, `任务【${q.title}】已完成，回去找${npcName(q.turnIn)}`);
  }
}

export function checkCollect(s: Save): string | null {
  const q = currentQuest(s);
  if (!q || q.type !== 'collect' || !q.target?.item || (s.main.state !== 'active' && s.main.state !== 'ready')) return null;
  const have = bagCount(s, q.target.item);
  const need = questNeed(q);
  s.main.count = Math.min(have, need);
  s.main.state = have >= need ? 'ready' : 'active';
  return s.main.state === 'ready' ? `任务【${q.title}】已完成，回去找${npcName(q.turnIn)}` : `已经夺回${s.main.count}份${items[q.target.item].name}，还差${need - s.main.count}份`;
}

// 掉落里标了 questOnly 的物品，只有做那个任务时才掉
export function questDropAllowed(s: Save, questOnly?: string): boolean {
  if (!questOnly) return true;
  if (questOnly === 'silverRing') return !!s.p3?.silverRing.task;
  const q = currentQuest(s);
  return !!q && q.id === questOnly && (s.main.state === 'active' || s.main.state === 'ready');
}

// ===== 悬赏令 =====

export function acceptBounty(s: Save, id: string): string {
  if (s.bounty) return '你手上已经有一张悬赏令了';
  const opt = bountyOptions.find((b) => b.id === id);
  if (!opt) return '';
  s.bounty = { id, count: 0 };
  return `接下悬赏令：打败${opt.count}个${monsters[opt.monster].name}，赏银${opt.silver}两`;
}

export function turnInBounty(s: Save): string {
  const opt = s.bounty && bountyOptions.find((b) => b.id === s.bounty!.id);
  if (!s.bounty || !opt) return '你还没有接悬赏令';
  if (s.bounty.count < opt.count) return `还差${opt.count - s.bounty.count}个${monsters[opt.monster].name}`;
  s.player.silver += opt.silver;
  s.bounty = null;
  log(s, `领取悬赏${opt.silver}两`);
  return `辛苦了！这是${opt.silver}两赏银`;
}

export function abandonBounty(s: Save): string {
  s.bounty = null;
  return '悬赏令已放弃';
}

// ===== 存档 =====

export const SAVE_KEY = 'pxsg.save.v1';

export function serialize(s: Save): string {
  return JSON.stringify(s);
}

export function deserialize(text: string): Save {
  const s = JSON.parse(text) as Save;
  if (s?.v !== 1 || !s.player || !locations[s.location]) throw new Error('存档格式不对');
  s.flags ??= {};
  s.kills ??= {};
  s.inn ??= [];
  s.quiz ??= { day: '', answered: [] };
  const d = p2Defaults();
  for (const [k, v] of Object.entries(d)) if ((s as unknown as Record<string, unknown>)[k] === undefined) (s as unknown as Record<string, unknown>)[k] = v;
  s.p3 = { ...p3Defaults(), ...(s.p3 ?? {}) };
  // 国战原来按真实时间走：没有天下历底数的老存档换算一次
  const oldCal = !!s.p4 && s.p4.calBase === undefined;
  const oldDaily = !s.p4 || s.p4.calV === undefined;
  s.p4 = { ...p4Defaults(), ...(s.p4 ?? {}) };
  if (oldCal) migrateCalendar(s);
  s.p5 = { ...p5Defaults(), ...(s.p5 ?? {}) };
  s.p5.life = { ...p5Defaults().life, ...s.p5.life };
  migrateMain(s);
  migrateTraining(s);
  if (oldDaily) migrateDaily(s);
  // 单机化：以前的「1区 许昌」这类分区名统一成本州
  if (!s.server || /区/.test(s.server)) s.server = '豫州';
  // 主线加长了：之前停在「全部完成」的存档接着往下走
  if (s.main.state === 'done' && mainQuests[s.main.step]) s.main.state = 'available';
  // P1 的副将存的是当前属性，换算成"起点属性 + 成长"后数值不变
  for (const g of [...s.generals, ...s.inn]) {
    if (!g.base) {
      g.base = g.attrs ?? zeroAttrs();
      g.baseLevel = g.level;
    }
    delete g.attrs;
  }
  return s;
}

export function moneyText(n: number): string {
  if (n >= 10000) return `${Math.floor(n / 1000) / 10}万`;
  return String(n);
}
