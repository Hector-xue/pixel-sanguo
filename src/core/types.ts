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

// sweep 物理横扫全体、multi 物理连打几下（随机目标）、heal 全体回血（cleanse 顺带解控）、drain 法术伤害吸血、rally 全体攻击加成几回合
export type SkillKind = 'cleave' | 'sacrifice' | 'guard' | 'control' | 'cleanse' | 'nuke' | 'poison' | 'aoe' | 'sweep' | 'multi' | 'heal' | 'drain' | 'rally';

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
  // multi：打几下；heal / rally：顺带解控；drain：吸回伤害的几成
  // 主角进阶招式（学会时直接从较高的等级起步）
  adv?: boolean;
  hits?: number;
  cleanse?: boolean;
  drain?: number;
}

export type ItemUse = 'box' | 'bigbox' | 'stamina' | 'xinfa' | 'skillbook' | 'dig' | 'gemore' | 'feast';

export interface ItemDef {
  name: string;
  cat: 'drug' | 'equip' | 'ore' | 'gem' | 'misc';
  hp?: number;
  mp?: number;
  price: number;
  quest?: boolean;
  desc?: string;
  // 自己做的菜：店里不卖
  cook?: boolean;
  tier?: number;
  use?: ItemUse;
  amount?: number;
  gem?: { kind: string; level: number };
}

export type Slot = 'head' | 'neck' | 'weapon' | 'wrist' | 'armor' | 'boots';

// 装备实例：同一种装备打造出来品质、宝石可以不同，所以每件单独存
export interface Gear {
  uid: string;
  slot: Slot;
  tier: number;
  cls?: ClassId;
  q: number;
  gems: (string | null)[];
}

// 装备、宝石、坐骑、副将星级等加在面板上的东西
export interface Bonus {
  hp: number;
  mp: number;
  atk: number;
  def: number;
  spd: number;
  con: number;
  resist: Partial<Resists>;
  rates: Partial<Rates>;
  mul: number;
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
