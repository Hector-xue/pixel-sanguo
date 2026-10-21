import balanceJson from './balance.json';
import classesJson from './classes.json';
import skillsJson from './skills.json';
import itemsJson from './items.json';
import monstersJson from './monsters.json';
import mapsJson from './maps.json';
import npcsJson from './npcs.json';
import questsJson from './quests.json';
import type { Attrs, ClassId, Gender, ItemDef, MonsterDef, Resists, SkillDef } from '../core/types';

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
  bounty?: boolean;
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
}

export interface BountyOption {
  id: string;
  monster: string;
  count: number;
  silver: number;
}

export const balance = balanceJson;
export const classes = table<ClassDef>(classesJson) as Record<ClassId, ClassDef>;
export const skills = table<SkillDef>(skillsJson);
export const items = table<ItemDef>(itemsJson);
export const monsters = table<MonsterDef>(monstersJson);
export const npcs = table<NpcDef>(npcsJson);
export const locations = mapsJson.locations as unknown as Record<string, LocationDef>;
export const lockedExits = mapsJson.locked as Record<string, string>;
export const startLocation = mapsJson.start;
export const opening = questsJson.opening as DialogLine[];
export const mainQuests = questsJson.main as QuestDef[];
export const bountyOptions = questsJson.bounty.options as BountyOption[];
export const quiz = questsJson.quiz as { reward: number; questions: { q: string; a: string[]; ok: number }[] };

export const CLASS_IDS: ClassId[] = ['warrior', 'scholar', 'mystic'];
export const GENDER_NAMES: Record<Gender, string> = { male: '男', female: '女' };

export function classSkills(classId: ClassId, gender: Gender): string[] {
  const c = classes[classId].skills;
  return [gender === 'male' ? c.male : c.female, ...c.common];
}
