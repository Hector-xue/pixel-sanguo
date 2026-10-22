import balanceJson from './balance.json';
import classesJson from './classes.json';
import skillsJson from './skills.json';
import itemsJson from './items.json';
import monstersJson from './monsters.json';
import mapsJson from './maps.json';
import npcsJson from './npcs.json';
import questsJson from './quests.json';
import equipsJson from './equips.json';
import mountsJson from './mounts.json';
import generalsJson from './generals.json';
import systemsJson from './systems.json';
import type { Attrs, ClassId, Gender, ItemDef, MonsterDef, Resists, SkillDef, Slot } from '../core/types';

// JSON 里以 _ 开头的键是出处注释，读表时去掉
function table<T>(json: Record<string, unknown>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(json)) if (!k.startsWith('_')) out[k] = v as T;
  return out;
}

export interface ClassDef {
  name: string;
  baseAttrs: Attrs;
  resist: Partial<Resists>;
  skills: { male: string; female: string; common: string[] };
}

export interface MonsterGroup {
  monster: string;
  level: [number, number];
  count: [number, number];
  escort?: { monster: string; level: number; count: number };
  label?: string;
}

export interface LocationDef {
  name: string;
  town?: boolean;
  art: string;
  exits: Partial<Record<Dir, string>>;
  npcs: string[];
  facilities?: string[];
  groups: MonsterGroup[];
}
export type Dir = 'up' | 'down' | 'left' | 'right';

export interface NpcDef {
  name: string;
  look: string;
  lines: string[];
  quiz?: boolean;
  bounty?: string[];
  recruit?: boolean;
  ring?: boolean;
  dig?: boolean;
  sect?: boolean;
  rebirth?: boolean;
  silverRing?: boolean;
  mercenary?: boolean;
  marriage?: boolean;
  wenqu?: boolean;
}

export interface DialogLine {
  who: string;
  text: string;
}

export type QuestType = 'talk' | 'kill' | 'capture' | 'collect' | 'flag';
export interface QuestDef {
  id: string;
  title: string;
  giver: string;
  turnIn: string;
  type: QuestType;
  target?: { monster?: string; item?: string; count: number; at: string };
  flag?: string;
  hint: string;
  goal: string;
  accept: DialogLine[];
  finish: DialogLine[];
  reward: { exp?: number; silver?: number; items?: Record<string, number> };
  chapter?: string;
}

export interface BountyOption {
  id: string;
  monster: string;
  count: number;
  silver: number;
}

export interface Reward {
  silver?: number;
  gold?: number;
  items?: Record<string, number>;
  general?: string;
}

// 随机奖励表的一项：w 是权重；ore/gem 是"按人物等级给的矿石/宝石"，数字是档位
export interface LootEntry {
  w: number;
  silver?: [number, number];
  items?: Record<string, number>;
  general?: string;
  ore?: number;
  gem?: number;
  nothing?: boolean;
  minLevel?: number;
}

export interface MountDef {
  name: string;
  level: number;
  silver?: number;
  gold?: number;
  base: { spd: number; chaos: number; seal: number; trap: number };
  per: { spd: number; res: number };
  color: string;
}

export interface RecruitDef {
  id: string;
  name: string;
  class: ClassId;
  gender: Gender;
  look: string;
}

export interface TierDef {
  level: number;
  ore?: string;
  oreN?: number;
  silver?: number;
}

export interface GemKind {
  name: string;
  color: string;
  per: { resist?: Partial<Resists>; rates?: Record<string, number>; spd?: number; con?: number };
}

export const balance = balanceJson;
export const classes = table<ClassDef>(classesJson) as Record<ClassId, ClassDef>;
export const skills = table<SkillDef>(skillsJson);
const { gems: gemsJson, ...itemsOnly } = itemsJson;
export const gemKinds = table<GemKind>(gemsJson.kinds) as Record<string, GemKind>;
export const GEM_KINDS = Object.keys(gemKinds);
export const GEM_LEVELS = gemsJson.levels;
export const items = table<ItemDef>(itemsOnly as Record<string, unknown>);
// 宝石：每种 1～5 级各一个物品，id 形如 gem_zuanshi_2
for (const kind of GEM_KINDS) {
  for (let lv = 1; lv <= GEM_LEVELS; lv++) {
    items[gemId(kind, lv)] = { name: `${lv}级${gemKinds[kind].name}`, cat: 'gem', price: gemsJson.basePrice * 3 ** (lv - 1), gem: { kind, level: lv } };
  }
}
export function gemId(kind: string, level: number): string {
  return `gem_${kind}_${level}`;
}
export const monsters = table<MonsterDef>(monstersJson);
export const npcs = table<NpcDef>(npcsJson);
export const locations = mapsJson.locations as unknown as Record<string, LocationDef>;
export const lockedExits = mapsJson.locked as Record<string, string>;
export const startLocation = mapsJson.start;
export const opening = questsJson.opening as DialogLine[];
export const mainQuests = questsJson.main as QuestDef[];
export const bountyOptions = questsJson.bounty.options as BountyOption[];
export const quiz = questsJson.quiz as { reward: number; questions: { q: string; a: string[]; ok: number }[] };

export const equips = equipsJson as unknown as {
  slots: Slot[];
  slotNames: Record<Slot, string>;
  tiers: TierDef[];
  sockets: number[];
  shopPrice: Record<Slot, number>;
  stats: Record<Slot, Record<string, number[]>>;
  attrReq: Partial<Record<Slot, number[]>>;
  names: Record<Exclude<Slot, 'weapon'>, string[]> & { weapon: Record<ClassId, string[]> };
};
export const mounts = table<MountDef>(mountsJson);
export const recruits = generalsJson as unknown as { yingcai: RecruitDef[]; jiangcai: RecruitDef[]; tokens: Record<string, string> };
export const systems = systemsJson as unknown as {
  signin: { days: Reward[] };
  online: { tiers: (Reward & { minutes: number })[] };
  boxes: Record<'box' | 'bigbox', LootEntry[]>;
  ring: {
    minLevel: number; rounds: number; stamina: number; types: Record<string, number>; killCount: [number, number];
    buyDrugs: string[]; buyCount: [number, number]; deliverItems: string[]; expRatio: number; expStep: number; silverPerLevel: number;
    drops: (Reward & { chance: number; ore?: number; gem?: number })[];
    final: { items: Record<string, number>; chance: number; bonus: Record<string, number> };
    tiers: { name: string; minLevel: number; from: number; final: Record<string, number> }[];
    killPerTier: number;
  };
  dig: { digs: number; guardAt: number[]; guardCount: [number, number]; loot: LootEntry[] };
  casino: { chibiMinutes: number; houseCut: number; minBet: number; maxBet: number; guessMul: number; sides: string[]; titles: { net: number; name: string }[] };
  shop: { goods: { item: string; gold: number }[] };
  sect: {
    minLevel: number;
    sects: { id: string; name: string; perk: 'atk' | 'spd' | 'mp' | 'def'; desc: string }[];
    ranks: { rep: number; name: string }[];
    perkPerRank: Record<string, number>;
    aiRep: number[];
    rep: [number, number];
    killCount: [number, number];
  };
  treasure: { hours: number[]; minutes: number; perDay: number; silverPerLevel: number; guardCount: [number, number]; loot: LootEntry[] };
  silverRing: { need: number; perDay: number; silverBase: number; silverPerLevel: number; minLevel: number };
  lucky: { free: number; goldPerDraw: number; maxDraws: number; luck: [number, number]; prizes: (LootEntry & { gold?: [number, number] })[] };
  stall: { slots: number; tickMinutes: number; maxHours: number; fairOf: Record<string, number>; fee: number };
  festivals: { expMul: number; days: { id: string; name: string; dates: string[] }[]; gift: Reward };
  marriage: {
    giftsPerDay: number; giftSilverPerLevel: number; favorPerGift: [number, number]; charmPerGift: number; weddingSilver: number;
    female: { id: string; name: string; look: string }[]; male: { id: string; name: string; look: string }[];
    swornRapport: number; swornMax: number; swornMul: number;
  };
  merc: { battles: number; silverPerLevel: number; levelOffset: number };
  achv: { id: string; name: string; desc: string; key: string; need: number; reward: Reward; title?: string }[];
  wenqu: { perDay: number; expRatio: number; silverPerLevel: number; questions: { q: string; a: string[]; ok: number }[] };
  guozhan: GuozhanDef;
  league: {
    fightsPerDay: number; winPoints: number; baseP: number; perWin: number; stageLevel: number[];
    rewards: (Reward & { silverPerLevel: number; rep: number })[]; title: string;
  };
  kuaqu: {
    minLevel: number; fightsPerDay: number; servers: string[]; base: number; spread: number; playerWeight: number;
    winPoints: number; levelDiffPoints: number; oppLevel: [number, number]; rewards: (Reward & { silverPerLevel: number })[]; title: string;
  };
};

export type NationId = 'wei' | 'shu' | 'wu' | 'qun';
export type CityKind = 'capital' | 'key' | 'pass' | 'normal';
export interface GuozhanDef {
  minLevel: number;
  ordersPerDay: number;
  turnMinutes: number;
  seasonDays: number;
  nations: { id: NationId; name: string; full: string; ruler: string; color: number; joinable: boolean }[];
  kinds: Record<CityKind, { name: string; max: number; def: number; yield: number }>;
  cities: { id: string; name: string; x: number; y: number; kind: CityKind; owner: NationId }[];
  links: [string, string][];
  soldiers: Record<NationId, string[]>;
  guards: Record<NationId, string[]>;
  ai: { attackChance: number; sendPct: number; minRatio: number; startPct: number; qunStartPct: number; qunYieldMul: number; reinforcePct: number; bigNationDamp: number; luck: [number, number] };
  player: { hitPct: number; hitPerLevel: number; defendPct: number; captureTroopsPct: number; meritAtk: number; meritDef: number; meritBoss: number; guardControlResist: number; guardLevel: number; guardEscorts: number; mirrorChance: number; joinCooldownDays: number };
  ranks: { name: string; merit: number }[];
  rankBonus: { hp: number; atk: number; def: number };
  salaryPerRankLevel: number;
  buffs: Record<string, { exp?: number; silver?: number; text: string }>;
  seasonMinMerit: number;
  seasonRewards: (Reward & { silverPerLevel: number })[];
  shop: { id: string; cost: number }[];
}
// 有馆驿的城镇（馆驿传送的目的地）
export function innTowns(): string[] {
  return Object.keys(locations).filter((id) => locations[id].facilities?.includes('inn'));
}

export const CLASS_IDS: ClassId[] = ['warrior', 'scholar', 'mystic'];
export const GENDER_NAMES: Record<Gender, string> = { male: '男', female: '女' };

export function classSkills(classId: ClassId, gender: Gender): string[] {
  const c = classes[classId].skills;
  return [gender === 'male' ? c.male : c.female, ...c.common];
}
