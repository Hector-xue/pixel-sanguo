export type ClassId = 'warrior' | 'scholar' | 'mystic';
export type Gender = 'male' | 'female';
export type AttrKey = 'con' | 'str' | 'int' | 'agi';
export type Attrs = Record<AttrKey, number>;
export type ResistKey = 'phys' | 'chaos' | 'seal' | 'trap' | 'thunder' | 'fire' | 'wind' | 'poison' | 'mystic';
export type Resists = Record<ResistKey, number>;
export const RESIST_KEYS: ResistKey[] = ['phys', 'chaos', 'seal', 'trap', 'thunder', 'fire', 'wind', 'poison', 'mystic'];
export const RESIST_NAMES: Record<ResistKey, string> = {
  phys: '抗物理', chaos: '抗扰乱', seal: '抗封锁', trap: '抗围困',
  thunder: '抗落雷', fire: '抗妖火', wind: '抗风沙', poison: '抗毒', mystic: '抗玄击',
};
export const ATTR_NAMES: Record<AttrKey, string> = { con: '体质', str: '力量', int: '智力', agi: '敏捷' };
export const ATTR_KEYS: AttrKey[] = ['con', 'str', 'int', 'agi'];

export interface Rates {
  crit: number;
  counter: number;
  fatal: number;
  dodge: number;
}

export interface Stats {
  maxHp: number;
  maxMp: number;
  atk: number;
  def: number;
  spd: number;
  carry: number;
  resist: Resists;
  rates: Rates;
}

export interface SkillState {
  id: string;
  level: number;
  prof: number;
}

export type ControlStatus = 'chaos' | 'seal' | 'trap';
export const STATUS_NAMES: Record<ControlStatus, string> = { chaos: '乱', seal: '封', trap: '围' };

export type SkillKind = 'cleave' | 'sacrifice' | 'guard' | 'control' | 'cleanse' | 'nuke' | 'poison' | 'aoe';

export interface SkillDef {
  name: string;
  short?: string;
  class: ClassId;
  kind: SkillKind;
  target: 'enemy' | 'enemies' | 'allies';
  resist?: ResistKey;
  status?: ControlStatus;
  desc: string;
  mp: [number, number];
  learnLevel: number;
  pct?: [number, number];
  atkMul?: number;
  mul?: [number, number];
  selfPct?: [number, number];
  profMul?: number;
  amount?: [number, number];
  turns?: number;
  chance?: [number, number];
  targets?: number[];
  base?: [number, number];
}

export interface ItemDef {
  name: string;
  cat: 'drug' | 'equip' | 'ore' | 'misc';
  hp?: number;
  mp?: number;
  price: number;
  quest?: boolean;
  desc?: string;
}

export interface MonsterDef {
  name: string;
  class: ClassId;
  gender: Gender;
  look: string;
  weights: Attrs;
  skills: { id: string; level: number; rate: number }[];
  drops: { item: string; chance: number; questOnly?: string }[];
  hpMul?: number;
  atkMul?: number;
  expMul?: number;
  silverMul?: number;
  boss?: boolean;
  capturable?: boolean;
  noFlee?: boolean;
  historic?: boolean;
}
