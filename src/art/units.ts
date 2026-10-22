// Q 版人物纸娃娃：头身 + 发型 + 服饰 + 武器分层拼，自动描边和阴影。
// 照原版老版的比例：约 2.5 头身、大眼、叉腿站，原尺寸（1 像素 = 1 逻辑像素）显示，约 26×50。
// 画布 52×52，人物朝左，身体中线在 BX；左边留给攻击时伸出去的兵器。
import { Grid } from './pixel';
import { C, blend } from './palette';

export type Weapon = 'sword' | 'saber' | 'spear' | 'staff' | 'fan' | 'dagger' | 'axe' | 'club' | 'cane' | 'scroll' | 'none'
  // 名将的标志兵器：青龙偃月刀、丈八蛇矛、方天画戟、双股剑、羽扇、弓、铁鞭
  | 'guandao' | 'snake' | 'halberd' | 'twin' | 'feather' | 'bow' | 'whip';
// 肤色：常人 / 白净 / 黝黑 / 黑脸 / 枣红脸 / 僵尸青
export type Skin = 'normal' | 'pale' | 'tan' | 'dark' | 'red' | 'ghoul';
// 眼型：圆眼 / 怒目 / 细长眼 / 眯眼（老人）/ 柔眼（带睫毛）/ 亮眼 / 环眼（豹眼）/ 空眼（鬼）
export type Eyes = 'round' | 'fierce' | 'narrow' | 'old' | 'gentle' | 'sparkle' | 'ring' | 'blank';
export type Mouth = 'line' | 'grin' | 'smile' | 'frown' | 'fang';
// 胡子：八字胡 / 山羊胡 / 美髯 / 虎须 / 络腮胡 / 胡茬（颜色用 beard）
export type BeardStyle = 'mustache' | 'goatee' | 'long' | 'bushy' | 'full' | 'stubble';
// 头饰：护额 / 书生巾 / 纶巾 / 道冠 / 紫金冠雉鸡翎 / 盔缨 / 狮头盔 / 步摇 / 簪花 / 捕快帽 / 高冠 / 黄符 / 翎羽
export type Headgear = 'guard' | 'jin' | 'lunjin' | 'daoguan' | 'zijin' | 'plume' | 'lion' | 'buyao' | 'flower' | 'cap' | 'crown' | 'talisman' | 'feather';
export type HairStyle = 'topknot' | 'band' | 'tail' | 'buns' | 'long' | 'highbun' | 'hood' | 'helmet' | 'short';
export type Pose = 'idle' | 'idle2' | 'atk' | 'cast' | 'hurt' | 'down';
export const POSES: Pose[] = ['idle', 'idle2', 'atk', 'cast', 'hurt', 'down'];

export interface Look {
  outfit: [number, number];
  trim: number;
  belt: number;
  boots: number;
  hair: [number, number];
  style: HairStyle;
  accent?: number;
  weapon: Weapon;
  metal?: number;
  orb?: number;
  female?: boolean;
  broad?: boolean;
  armor?: boolean;
  beard?: number;
  longBeard?: boolean;
  mask?: number;
  hat?: number;
  cape?: number;
  // 裤子颜色（不写就用衣服暗色）；穿长袍的看不到裤子
  pants?: number;
  // ===== 辨识度：以下都可不写，不写就是原来的样子 =====
  skin?: Skin;
  eyes?: Eyes;
  mouth?: Mouth;
  beardStyle?: BeardStyle;
  head?: Headgear;
  // 头饰的主色（盔缨、飘带、巾、翎羽），不写用 accent
  headColor?: number;
  patch?: boolean;
  scar?: boolean;
  fat?: boolean;
  bare?: boolean;
  // 披帛（飘在身后的长绸带）
  sash?: number;
  bells?: boolean;
}

export const UNIT_W = 52;
export const UNIT_H = 52;
export const FEET_Y = 50;
// 身体中线；贴图中心在 26，所以显示时要往反方向挪 BX - 26
export const BX = 30;

const HAIRS: [number, number][] = [[C.darkBrown, C.ink], [C.brown, C.darkBrown], [C.navy, C.ink]];
const MALE_STYLES: HairStyle[] = ['topknot', 'band', 'tail'];
const FEMALE_STYLES: HairStyle[] = ['buns', 'long', 'highbun'];

const HERO: Record<string, Omit<Look, 'hair' | 'style'>> = {
  warrior: { outfit: [C.red, C.darkRed], trim: C.gold, belt: C.brown, boots: C.brown, weapon: 'sword', armor: true, accent: C.red },
  scholar: { outfit: [C.blue, C.navy], trim: C.white, belt: C.gold, boots: C.darkBrown, weapon: 'fan', accent: C.lightBlue },
  mystic: { outfit: [C.purple, C.darkPurple], trim: C.yellow, belt: C.red, boots: C.ink, weapon: 'staff', orb: C.yellow, accent: C.lilac },
};

// 造型：每个职业三套衣服配色（variant = 头像 + 3 × 造型）
const SKINS: Record<string, Partial<Look>[]> = {
  warrior: [{}, { outfit: [C.navy, C.ink], trim: C.gold, accent: C.gold }, { outfit: [C.darkGray, C.ink], trim: C.red, accent: C.red, metal: C.gold }],
  scholar: [{}, { outfit: [C.green, C.darkGreen], trim: C.paper, belt: C.brown }, { outfit: [C.white, C.lightGray], trim: C.blue, belt: C.navy }],
  mystic: [{}, { outfit: [C.darkRed, C.ink], trim: C.gold, belt: C.gold, orb: C.orange }, { outfit: [C.sky, C.lightBlue], trim: C.white, belt: C.navy, orb: C.white }],
};

// 三个头像各一种眼型；职业靠头饰认：武士护额飘带、文人书生巾 / 步摇、异人道冠（女的加披帛）
const MALE_EYES: Eyes[] = ['round', 'fierce', 'narrow'];
const FEMALE_EYES: Eyes[] = ['gentle', 'sparkle', 'narrow'];
const MALE_MOUTH: Mouth[] = ['smile', 'frown', 'line'];

export function heroLook(classId: string, gender: string, variant: number): Look {
  const female = gender === 'female';
  const v = ((variant % 3) + 3) % 3;
  const skin = SKINS[classId]?.[Math.floor(Math.max(0, variant) / 3) % 3] ?? {};
  const base: Look = { ...HERO[classId], ...skin, female, hair: HAIRS[v], style: (female ? FEMALE_STYLES : MALE_STYLES)[v] };
  base.eyes = (female ? FEMALE_EYES : MALE_EYES)[v];
  if (!female) base.mouth = MALE_MOUTH[v];
  // 同职业的三个头像再各换一样：男文人 书生巾 / 纶巾 / 只束髻，男异人 道冠 / 兜帽 / 披发道冠，男武士第二个晒得黝黑
  if (classId === 'warrior') {
    base.head = 'guard';
    base.headColor = base.accent ?? C.red;
    if (!female && v === 1) base.skin = 'tan';
  } else if (classId === 'scholar') {
    base.head = female ? 'buyao' : (['jin', 'lunjin', undefined] as (Headgear | undefined)[])[v];
    base.headColor = female ? C.gold : base.outfit[1];
  } else if (classId === 'mystic') {
    base.head = 'daoguan';
    if (female) base.sash = base.trim;
    else if (v === 1) {
      base.head = undefined;
      base.style = 'hood';
    } else if (v === 2) base.style = 'long';
  }
  return base;
}

export const LOOKS: Record<string, Look> = {
  thief: { outfit: [C.gray, C.darkGray], trim: C.lightGray, belt: C.brown, boots: C.darkBrown, hair: [C.darkGray, C.ink], style: 'hood', weapon: 'dagger', metal: C.lightGray },
  bandit: { outfit: [C.lightBrown, C.brown], trim: C.sand, belt: C.red, boots: C.darkBrown, hair: [C.darkBrown, C.ink], style: 'band', accent: C.red, weapon: 'club' },
  rogue: { outfit: [C.darkGray, C.ink], trim: C.gray, belt: C.darkRed, boots: C.ink, hair: [C.darkBrown, C.ink], style: 'tail', weapon: 'saber', mask: C.darkGray },
  soldier: { outfit: [C.green, C.darkGreen], trim: C.tan, belt: C.brown, boots: C.darkBrown, hair: [C.gray, C.darkGray], style: 'helmet', accent: C.red, weapon: 'spear', armor: true },
  witch: { outfit: [C.lilac, C.purple], trim: C.pink, belt: C.darkPurple, boots: C.darkPurple, hair: [C.darkPurple, C.ink], style: 'long', female: true, weapon: 'staff', orb: C.orange },
  brute: { outfit: [C.brown, C.darkBrown], trim: C.tan, belt: C.red, boots: C.ink, hair: [C.darkBrown, C.ink], style: 'band', accent: C.darkRed, weapon: 'axe', broad: true, beard: C.darkBrown },
  strategist: { outfit: [C.tan, C.lightBrown], trim: C.darkBrown, belt: C.darkRed, boots: C.darkBrown, hair: [C.darkBrown, C.ink], style: 'topknot', weapon: 'fan', beard: C.darkBrown, hat: C.darkGray },
  chief: { outfit: [C.darkRed, C.darkPurple], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.darkGray, C.ink], style: 'helmet', accent: C.gold, weapon: 'axe', metal: C.gold, broad: true, armor: true, beard: C.ink, cape: C.red },
  guide: { outfit: [C.lime, C.grass], trim: C.white, belt: C.green, boots: C.darkBrown, hair: [C.darkBrown, C.ink], style: 'topknot', weapon: 'scroll', hat: C.green },
  elder: { outfit: [C.tan, C.lightBrown], trim: C.paper, belt: C.brown, boots: C.darkBrown, hair: [C.lightGray, C.gray], style: 'topknot', weapon: 'cane', beard: C.white, longBeard: true },
  zhaoyun: { outfit: [C.white, C.lightGray], trim: C.lightBlue, belt: C.blue, boots: C.darkGray, hair: [C.lightGray, C.gray], style: 'helmet', accent: C.red, weapon: 'spear', armor: true, cape: C.white },
  helper: { outfit: [C.lightBlue, C.blue], trim: C.white, belt: C.gold, boots: C.darkBrown, hair: [C.darkBrown, C.ink], style: 'topknot', weapon: 'scroll', hat: C.navy },
  diaochan: { outfit: [C.pink, C.orange], trim: C.white, belt: C.gold, boots: C.darkRed, hair: [C.darkBrown, C.ink], style: 'highbun', female: true, weapon: 'fan', accent: C.gold },
  constable: { outfit: [C.navy, C.ink], trim: C.red, belt: C.red, boots: C.ink, hair: [C.darkBrown, C.ink], style: 'topknot', weapon: 'saber', hat: C.ink },
  squire: { outfit: [C.green, C.darkGreen], trim: C.paper, belt: C.gold, boots: C.darkBrown, hair: [C.darkBrown, C.ink], style: 'topknot', weapon: 'none', beard: C.darkBrown, hat: C.darkGreen },
  soldier_npc: { outfit: [C.red, C.darkRed], trim: C.gold, belt: C.brown, boots: C.darkBrown, hair: [C.gray, C.darkGray], style: 'helmet', accent: C.gold, weapon: 'spear', armor: true },
  // ===== 许昌线 =====
  refugee: { outfit: [C.tan, C.lightBrown], trim: C.sand, belt: C.brown, boots: C.brown, hair: [C.darkBrown, C.ink], style: 'short', weapon: 'club' },
  marauder: { outfit: [C.darkRed, C.brown], trim: C.tan, belt: C.ink, boots: C.ink, hair: [C.ink, C.ink], style: 'band', accent: C.orange, weapon: 'saber', beard: C.ink },
  horsethief: { outfit: [C.brown, C.darkBrown], trim: C.gold, belt: C.red, boots: C.ink, hair: [C.darkBrown, C.ink], style: 'tail', weapon: 'saber', mask: C.darkRed },
  thug: { outfit: [C.darkGray, C.ink], trim: C.red, belt: C.red, boots: C.ink, hair: [C.ink, C.ink], style: 'short', weapon: 'club', broad: true },
  farmsoldier: { outfit: [C.grass, C.green], trim: C.tan, belt: C.brown, boots: C.brown, hair: [C.gray, C.darkGray], style: 'helmet', accent: C.green, weapon: 'spear', armor: true },
  pedant: { outfit: [C.lightGray, C.gray], trim: C.darkGray, belt: C.darkBrown, boots: C.ink, hair: [C.gray, C.darkGray], style: 'topknot', weapon: 'scroll', hat: C.ink, beard: C.gray },
  pedant2: { outfit: [C.sky, C.lightBlue], trim: C.white, belt: C.navy, boots: C.ink, hair: [C.darkBrown, C.ink], style: 'topknot', weapon: 'fan', hat: C.navy },
  pedant3: { outfit: [C.paper, C.sand], trim: C.darkRed, belt: C.darkRed, boots: C.darkBrown, hair: [C.darkGray, C.ink], style: 'topknot', weapon: 'fan', hat: C.darkRed, beard: C.darkGray, longBeard: true },
  cavalry: { outfit: [C.ink, C.darkGray], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.orange, weapon: 'spear', armor: true, metal: C.gold, cape: C.darkRed },
  streetbandit: { outfit: [C.purple, C.darkPurple], trim: C.yellow, belt: C.ink, boots: C.ink, hair: [C.darkBrown, C.ink], style: 'band', accent: C.yellow, weapon: 'dagger' },
  official: { outfit: [C.darkRed, C.darkPurple], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.darkGray, C.ink], style: 'topknot', weapon: 'scroll', hat: C.ink, beard: C.ink, broad: true },
  official2: { outfit: [C.darkGreen, C.ink], trim: C.lime, belt: C.gold, boots: C.ink, hair: [C.darkGray, C.ink], style: 'topknot', weapon: 'staff', orb: C.lime, hat: C.ink },
  official3: { outfit: [C.navy, C.ink], trim: C.gold, belt: C.red, boots: C.ink, hair: [C.ink, C.ink], style: 'topknot', weapon: 'saber', hat: C.ink, beard: C.ink },
  gentry: { outfit: [C.gold, C.orange], trim: C.darkRed, belt: C.darkRed, boots: C.darkBrown, hair: [C.darkBrown, C.ink], style: 'topknot', weapon: 'staff', orb: C.sky, hat: C.darkRed, broad: true },
  roadbully: { outfit: [C.lightBrown, C.brown], trim: C.ink, belt: C.ink, boots: C.ink, hair: [C.ink, C.ink], style: 'band', accent: C.darkRed, weapon: 'axe', broad: true, beard: C.ink },
  rebel: { outfit: [C.yellow, C.gold], trim: C.brown, belt: C.darkRed, boots: C.darkBrown, hair: [C.darkBrown, C.ink], style: 'band', accent: C.yellow, weapon: 'spear', armor: true },
  rebelmage: { outfit: [C.darkPurple, C.ink], trim: C.yellow, belt: C.yellow, boots: C.ink, hair: [C.ink, C.ink], style: 'hood', weapon: 'staff', orb: C.orange },
  rebelchief: { outfit: [C.gold, C.darkRed], trim: C.yellow, belt: C.ink, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.yellow, weapon: 'axe', metal: C.yellow, broad: true, armor: true, beard: C.ink, cape: C.yellow },
  guardian: { outfit: [C.darkGray, C.ink], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.darkGray, C.ink], style: 'helmet', accent: C.gold, weapon: 'spear', armor: true, metal: C.gold, mask: C.gray },
  magistrate: { outfit: [C.darkRed, C.darkPurple], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.darkGray, C.ink], style: 'topknot', weapon: 'none', hat: C.ink, beard: C.darkGray },
  magistrate2: { outfit: [C.navy, C.ink], trim: C.white, belt: C.gold, boots: C.ink, hair: [C.darkBrown, C.ink], style: 'topknot', weapon: 'none', hat: C.ink, beard: C.darkBrown },
  minister: { outfit: [C.purple, C.darkPurple], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.lightGray, C.gray], style: 'topknot', weapon: 'scroll', hat: C.ink, beard: C.lightGray, longBeard: true },
  recruiter: { outfit: [C.red, C.darkRed], trim: C.white, belt: C.gold, boots: C.darkBrown, hair: [C.darkBrown, C.ink], style: 'topknot', weapon: 'scroll', hat: C.darkRed },
  courier: { outfit: [C.orange, C.darkRed], trim: C.yellow, belt: C.brown, boots: C.brown, hair: [C.darkBrown, C.ink], style: 'band', accent: C.yellow, weapon: 'scroll' },
  oldminer: { outfit: [C.brown, C.darkBrown], trim: C.tan, belt: C.ink, boots: C.ink, hair: [C.lightGray, C.gray], style: 'band', accent: C.tan, weapon: 'cane', beard: C.white, longBeard: true },
  // ===== 名将（招贤） =====
  g_caobao: { outfit: [C.brown, C.darkBrown], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.darkGray, C.ink], style: 'helmet', accent: C.red, weapon: 'saber', armor: true, beard: C.ink, broad: true },
  g_weixu: { outfit: [C.darkRed, C.ink], trim: C.gray, belt: C.ink, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.darkRed, weapon: 'spear', armor: true },
  g_songxian: { outfit: [C.navy, C.ink], trim: C.lightBlue, belt: C.gold, boots: C.ink, hair: [C.darkBrown, C.ink], style: 'helmet', accent: C.lightBlue, weapon: 'sword', armor: true, beard: C.darkBrown },
  g_houcheng: { outfit: [C.green, C.darkGreen], trim: C.paper, belt: C.gold, boots: C.darkBrown, hair: [C.darkBrown, C.ink], style: 'topknot', weapon: 'fan', hat: C.darkGreen },
  g_sunqian: { outfit: [C.sky, C.blue], trim: C.white, belt: C.navy, boots: C.darkBrown, hair: [C.darkGray, C.ink], style: 'topknot', weapon: 'fan', beard: C.darkGray },
  g_jianyong: { outfit: [C.lilac, C.purple], trim: C.white, belt: C.yellow, boots: C.ink, hair: [C.darkBrown, C.ink], style: 'tail', weapon: 'staff', orb: C.sky, beard: C.darkBrown },
  g_mifang: { outfit: [C.gold, C.brown], trim: C.paper, belt: C.darkRed, boots: C.darkBrown, hair: [C.darkBrown, C.ink], style: 'topknot', weapon: 'staff', orb: C.red, hat: C.brown },
  g_daqiao: { outfit: [C.sky, C.lightBlue], trim: C.white, belt: C.pink, boots: C.navy, hair: [C.ink, C.ink], style: 'highbun', female: true, weapon: 'staff', orb: C.pink, accent: C.pink },
  g_xiaoqiao: { outfit: [C.pink, C.red], trim: C.white, belt: C.gold, boots: C.darkRed, hair: [C.darkBrown, C.ink], style: 'buns', female: true, weapon: 'fan', accent: C.gold },
  g_chendeng: { outfit: [C.lightGray, C.gray], trim: C.blue, belt: C.navy, boots: C.ink, hair: [C.darkBrown, C.ink], style: 'topknot', weapon: 'sword', armor: true, beard: C.darkBrown },
  // ===== P3：陈留篇 =====
  m_daoshi: { outfit: [C.yellow, C.gold], trim: C.darkRed, belt: C.darkRed, boots: C.ink, hair: [C.darkGray, C.ink], style: 'topknot', weapon: 'staff', orb: C.red, hat: C.darkGray, beard: C.darkGray },
  m_shushi: { outfit: [C.darkPurple, C.ink], trim: C.lime, belt: C.lime, boots: C.ink, hair: [C.ink, C.ink], style: 'hood', weapon: 'staff', orb: C.lime },
  m_yaoren: { outfit: [C.darkGreen, C.ink], trim: C.lilac, belt: C.purple, boots: C.ink, hair: [C.darkPurple, C.ink], style: 'long', weapon: 'fan', mask: C.lime },
  m_youhun: { outfit: [C.lightGray, C.gray], trim: C.white, belt: C.gray, boots: C.gray, hair: [C.ink, C.ink], style: 'long', female: true, weapon: 'none', mask: C.lightGray },
  m_jiangshi: { outfit: [C.darkGreen, C.ink], trim: C.darkRed, belt: C.ink, boots: C.ink, hair: [C.ink, C.ink], style: 'topknot', weapon: 'none', hat: C.ink, mask: C.lime, broad: true },
  m_lishi: { outfit: [C.darkRed, C.brown], trim: C.gold, belt: C.ink, boots: C.ink, hair: [C.ink, C.ink], style: 'short', weapon: 'club', broad: true, beard: C.ink, pants: C.darkBrown },
  m_fushou: { outfit: [C.darkGray, C.ink], trim: C.red, belt: C.red, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.red, weapon: 'axe', armor: true, pants: C.darkRed },
  m_xianfeng: { outfit: [C.darkRed, C.ink], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.gold, weapon: 'axe', metal: C.gold, armor: true, broad: true, beard: C.ink, cape: C.darkRed },
  // ===== 濮阳篇 =====
  m_epu: { outfit: [C.brown, C.darkBrown], trim: C.tan, belt: C.ink, boots: C.ink, hair: [C.darkBrown, C.ink], style: 'band', accent: C.darkGray, weapon: 'club', pants: C.darkGray },
  m_nvzei: { outfit: [C.darkRed, C.ink], trim: C.pink, belt: C.gold, boots: C.ink, hair: [C.ink, C.ink], style: 'highbun', female: true, weapon: 'dagger', mask: C.darkRed, accent: C.gold },
  m_bailei: { outfit: [C.lilac, C.purple], trim: C.yellow, belt: C.yellow, boots: C.ink, hair: [C.darkGray, C.ink], style: 'topknot', weapon: 'fan', hat: C.purple },
  m_xiongtu: { outfit: [C.ink, C.darkGray], trim: C.red, belt: C.red, boots: C.ink, hair: [C.ink, C.ink], style: 'band', accent: C.red, weapon: 'saber', beard: C.ink, pants: C.brown },
  m_egun: { outfit: [C.tan, C.lightBrown], trim: C.ink, belt: C.ink, boots: C.ink, hair: [C.ink, C.ink], style: 'short', weapon: 'club', broad: true, pants: C.darkBrown, beard: C.darkBrown },
  m_hjbing: { outfit: [C.yellow, C.gold], trim: C.brown, belt: C.brown, boots: C.brown, hair: [C.darkBrown, C.ink], style: 'band', accent: C.yellow, weapon: 'spear', pants: C.brown },
  m_hjjing: { outfit: [C.gold, C.orange], trim: C.darkRed, belt: C.darkRed, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.yellow, weapon: 'saber', armor: true, pants: C.darkBrown },
  m_hjqushuai: { outfit: [C.yellow, C.gold], trim: C.red, belt: C.red, boots: C.ink, hair: [C.ink, C.ink], style: 'topknot', weapon: 'staff', orb: C.yellow, hat: C.yellow, beard: C.ink, longBeard: true, cape: C.yellow },
  m_duxing: { outfit: [C.ink, C.darkGray], trim: C.lightGray, belt: C.gray, boots: C.ink, hair: [C.ink, C.ink], style: 'tail', weapon: 'sword', mask: C.ink, pants: C.darkGray },
  m_caihua: { outfit: [C.pink, C.red], trim: C.white, belt: C.white, boots: C.ink, hair: [C.ink, C.ink], style: 'long', weapon: 'fan', accent: C.red },
  m_lvlin: { outfit: [C.green, C.darkGreen], trim: C.tan, belt: C.brown, boots: C.brown, hair: [C.darkBrown, C.ink], style: 'band', accent: C.green, weapon: 'saber', beard: C.darkBrown, pants: C.darkGreen },
  m_jiangyang: { outfit: [C.blue, C.navy], trim: C.sky, belt: C.sky, boots: C.ink, hair: [C.ink, C.ink], style: 'hood', weapon: 'staff', orb: C.sky },
  m_kuangshi: { outfit: [C.gray, C.darkGray], trim: C.lightBrown, belt: C.brown, boots: C.ink, hair: [C.darkBrown, C.ink], style: 'band', accent: C.gray, weapon: 'axe', broad: true, pants: C.brown },
  m_baoshi: { outfit: [C.purple, C.darkPurple], trim: C.sky, belt: C.lime, boots: C.ink, hair: [C.ink, C.ink], style: 'topknot', weapon: 'fan', hat: C.purple, accent: C.sky },
  m_baiyin: { outfit: [C.white, C.lightGray], trim: C.gold, belt: C.gold, boots: C.gray, hair: [C.darkGray, C.ink], style: 'tail', weapon: 'saber', metal: C.white, pants: C.gray },
  m_hjdadao: { outfit: [C.gold, C.brown], trim: C.yellow, belt: C.ink, boots: C.ink, hair: [C.ink, C.ink], style: 'hood', weapon: 'staff', orb: C.orange },
  m_dadaoshouling: { outfit: [C.yellow, C.darkRed], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.yellow, weapon: 'axe', metal: C.gold, broad: true, armor: true, beard: C.ink, cape: C.gold },
  // ===== 洛阳篇 =====
  m_xltieqi: { outfit: [C.darkGray, C.ink], trim: C.gold, belt: C.brown, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.darkRed, weapon: 'spear', armor: true, pants: C.brown },
  m_xlmoushi: { outfit: [C.darkRed, C.ink], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.darkGray, C.ink], style: 'topknot', weapon: 'fan', hat: C.ink, beard: C.darkGray },
  m_huaxiong: { outfit: [C.darkRed, C.ink], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.red, weapon: 'axe', metal: C.lightGray, broad: true, armor: true, beard: C.ink, cape: C.red },
  m_langqi: { outfit: [C.gray, C.darkGray], trim: C.white, belt: C.ink, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.gray, weapon: 'spear', armor: true, pants: C.darkGray, cape: C.gray },
  m_feixiong: { outfit: [C.ink, C.darkGray], trim: C.red, belt: C.red, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.ink, weapon: 'saber', armor: true, broad: true, pants: C.ink },
  m_lvbu: { outfit: [C.red, C.darkRed], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.red, weapon: 'spear', metal: C.gold, armor: true, cape: C.red, pants: C.darkRed },
  m_luanbing: { outfit: [C.brown, C.darkBrown], trim: C.gray, belt: C.ink, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.brown, weapon: 'saber', armor: true, pants: C.darkBrown },
  m_daomu: { outfit: [C.darkGray, C.ink], trim: C.tan, belt: C.brown, boots: C.ink, hair: [C.darkBrown, C.ink], style: 'hood', weapon: 'dagger', mask: C.darkGray },
  m_shimo: { outfit: [C.darkPurple, C.ink], trim: C.lime, belt: C.ink, boots: C.ink, hair: [C.lightGray, C.gray], style: 'long', weapon: 'staff', orb: C.lime, mask: C.lime },
  m_liru: { outfit: [C.ink, C.darkPurple], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.darkGray, C.ink], style: 'topknot', weapon: 'fan', hat: C.ink, beard: C.ink, longBeard: true },
  // ===== 长安篇 =====
  m_xlshoujun: { outfit: [C.darkGray, C.ink], trim: C.tan, belt: C.brown, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.darkRed, weapon: 'spear', armor: true, broad: true, pants: C.darkBrown },
  m_xljianshou: { outfit: [C.brown, C.darkBrown], trim: C.tan, belt: C.ink, boots: C.ink, hair: [C.ink, C.ink], style: 'band', accent: C.darkRed, weapon: 'dagger', pants: C.darkGray },
  m_qiangbing: { outfit: [C.tan, C.brown], trim: C.red, belt: C.red, boots: C.brown, hair: [C.ink, C.ink], style: 'tail', weapon: 'spear', pants: C.darkBrown, accent: C.red },
  m_qiangwu: { outfit: [C.red, C.darkRed], trim: C.yellow, belt: C.yellow, boots: C.brown, hair: [C.ink, C.ink], style: 'long', female: true, weapon: 'staff', orb: C.orange, accent: C.yellow },
  m_lijue: { outfit: [C.darkGreen, C.ink], trim: C.gold, belt: C.brown, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.green, weapon: 'saber', armor: true, pants: C.darkBrown },
  m_guosi: { outfit: [C.navy, C.ink], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.ink, C.ink], style: 'topknot', weapon: 'fan', hat: C.navy, beard: C.ink },
  m_xlqibing: { outfit: [C.darkRed, C.brown], trim: C.gold, belt: C.ink, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.orange, weapon: 'spear', armor: true, cape: C.darkRed, pants: C.brown },
  m_meiwu: { outfit: [C.darkPurple, C.ink], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.gold, weapon: 'spear', armor: true, broad: true, pants: C.ink },
  m_dongzhuo: { outfit: [C.darkPurple, C.ink], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.darkGray, C.ink], style: 'topknot', weapon: 'sword', hat: C.ink, broad: true, beard: C.ink, longBeard: true, cape: C.darkRed, armor: true },
  // ===== 汉中篇 =====
  m_zhandao: { outfit: [C.lightBrown, C.brown], trim: C.tan, belt: C.ink, boots: C.brown, hair: [C.darkBrown, C.ink], style: 'band', accent: C.yellow, weapon: 'spear', pants: C.brown },
  m_shanxiao: { outfit: [C.darkGreen, C.ink], trim: C.lime, belt: C.ink, boots: C.ink, hair: [C.darkBrown, C.ink], style: 'hood', weapon: 'club', mask: C.red, broad: true },
  m_huwei: { outfit: [C.navy, C.ink], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.blue, weapon: 'saber', armor: true, broad: true, pants: C.ink },
  m_gongqi: { outfit: [C.blue, C.navy], trim: C.white, belt: C.ink, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.blue, weapon: 'dagger', armor: true, pants: C.navy },
  m_guizu: { outfit: [C.yellow, C.gold], trim: C.ink, belt: C.ink, boots: C.ink, hair: [C.ink, C.ink], style: 'band', accent: C.ink, weapon: 'saber', pants: C.darkGray },
  m_jijiu: { outfit: [C.gold, C.yellow], trim: C.ink, belt: C.darkRed, boots: C.ink, hair: [C.darkGray, C.ink], style: 'topknot', weapon: 'staff', orb: C.white, hat: C.ink, beard: C.darkGray, longBeard: true },
  m_bandun: { outfit: [C.brown, C.darkBrown], trim: C.red, belt: C.red, boots: C.brown, hair: [C.ink, C.ink], style: 'short', weapon: 'axe', broad: true, pants: C.darkBrown, mask: C.red },
  m_wugui: { outfit: [C.darkPurple, C.ink], trim: C.red, belt: C.red, boots: C.ink, hair: [C.ink, C.ink], style: 'long', female: true, weapon: 'staff', orb: C.red, mask: C.lilac },
  m_hufa: { outfit: [C.white, C.lightGray], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.ink, C.ink], style: 'topknot', weapon: 'fan', hat: C.white, beard: C.ink },
  m_tslishi: { outfit: [C.lightGray, C.gray], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.yellow, weapon: 'club', armor: true, broad: true, pants: C.darkGray },
  m_zhanglu: { outfit: [C.white, C.lightGray], trim: C.yellow, belt: C.yellow, boots: C.ink, hair: [C.darkGray, C.ink], style: 'topknot', weapon: 'staff', orb: C.yellow, hat: C.gold, beard: C.lightGray, longBeard: true, cape: C.yellow },
  m_ljtaobing: { outfit: [C.green, C.darkGreen], trim: C.tan, belt: C.brown, boots: C.brown, hair: [C.darkBrown, C.ink], style: 'band', accent: C.tan, weapon: 'spear', pants: C.brown },
  // ===== P3 NPC =====
  g_caocao_npc: { outfit: [C.navy, C.ink], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.ink, C.ink], style: 'topknot', weapon: 'sword', hat: C.ink, beard: C.ink, cape: C.red },
  g_yuanshao_npc: { outfit: [C.gold, C.orange], trim: C.darkRed, belt: C.darkRed, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.gold, weapon: 'sword', metal: C.gold, armor: true, beard: C.ink, cape: C.gold },
  m_jiaopai: { outfit: [C.green, C.darkGreen], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.darkBrown, C.ink], style: 'topknot', weapon: 'scroll', hat: C.darkGreen },
  m_yingbing: { outfit: [C.brown, C.darkBrown], trim: C.gold, belt: C.red, boots: C.ink, hair: [C.ink, C.ink], style: 'band', accent: C.red, weapon: 'saber', armor: true, beard: C.ink, pants: C.darkBrown },
  m_wenqu: { outfit: [C.lightBlue, C.blue], trim: C.yellow, belt: C.yellow, boots: C.ink, hair: [C.lightGray, C.gray], style: 'topknot', weapon: 'scroll', hat: C.navy, beard: C.lightGray, longBeard: true },
  m_zuoci: { outfit: [C.white, C.lightGray], trim: C.sky, belt: C.sky, boots: C.gray, hair: [C.lightGray, C.gray], style: 'topknot', weapon: 'staff', orb: C.sky, beard: C.white, longBeard: true },
  // ===== P4 国战：魏蓝、蜀绿、吴红、群雄（董卓余部）褐黄 =====
  gz_weibu: { outfit: [C.blue, C.navy], trim: C.lightGray, belt: C.ink, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.blue, weapon: 'spear', armor: true, pants: C.navy },
  gz_weimou: { outfit: [C.navy, C.ink], trim: C.lightBlue, belt: C.lightBlue, boots: C.ink, hair: [C.ink, C.ink], style: 'topknot', weapon: 'fan', hat: C.navy, beard: C.ink },
  gz_weifang: { outfit: [C.lightBlue, C.blue], trim: C.white, belt: C.navy, boots: C.ink, hair: [C.darkGray, C.ink], style: 'hood', weapon: 'staff', orb: C.sky },
  gz_shubu: { outfit: [C.green, C.darkGreen], trim: C.tan, belt: C.brown, boots: C.brown, hair: [C.ink, C.ink], style: 'helmet', accent: C.green, weapon: 'spear', armor: true, pants: C.darkGreen },
  gz_shumou: { outfit: [C.darkGreen, C.ink], trim: C.paper, belt: C.gold, boots: C.ink, hair: [C.ink, C.ink], style: 'topknot', weapon: 'fan', hat: C.darkGreen, beard: C.darkBrown },
  gz_shufang: { outfit: [C.grass, C.green], trim: C.white, belt: C.darkGreen, boots: C.brown, hair: [C.darkBrown, C.ink], style: 'hood', weapon: 'staff', orb: C.lime },
  gz_wubu: { outfit: [C.red, C.darkRed], trim: C.gold, belt: C.ink, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.red, weapon: 'saber', armor: true, pants: C.darkRed },
  gz_wumou: { outfit: [C.darkRed, C.ink], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.ink, C.ink], style: 'topknot', weapon: 'fan', hat: C.darkRed, beard: C.ink },
  gz_wufang: { outfit: [C.orange, C.red], trim: C.yellow, belt: C.darkRed, boots: C.ink, hair: [C.darkBrown, C.ink], style: 'hood', weapon: 'staff', orb: C.orange },
  // 魏将
  gz_xiahoudun: { outfit: [C.navy, C.ink], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.blue, weapon: 'saber', armor: true, broad: true, beard: C.ink, mask: C.ink, cape: C.navy },
  gz_caoren: { outfit: [C.blue, C.navy], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.gold, weapon: 'spear', armor: true, broad: true, beard: C.ink },
  gz_zhangliao: { outfit: [C.lightBlue, C.blue], trim: C.white, belt: C.navy, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.sky, weapon: 'spear', armor: true, metal: C.white, cape: C.blue },
  gz_xuchu: { outfit: [C.navy, C.darkGray], trim: C.tan, belt: C.ink, boots: C.ink, hair: [C.ink, C.ink], style: 'short', weapon: 'axe', broad: true, beard: C.ink, pants: C.ink },
  gz_guojia: { outfit: [C.lightGray, C.blue], trim: C.navy, belt: C.navy, boots: C.ink, hair: [C.ink, C.ink], style: 'topknot', weapon: 'fan', hat: C.navy },
  gz_simayi: { outfit: [C.ink, C.navy], trim: C.lightBlue, belt: C.lightBlue, boots: C.ink, hair: [C.darkGray, C.ink], style: 'topknot', weapon: 'fan', hat: C.ink, beard: C.darkGray, longBeard: true },
  // 蜀将
  gz_guanyu: { outfit: [C.green, C.darkGreen], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.ink, C.ink], style: 'topknot', weapon: 'saber', hat: C.darkGreen, beard: C.ink, longBeard: true, armor: true, cape: C.green },
  gz_zhangfei: { outfit: [C.ink, C.darkGray], trim: C.green, belt: C.green, boots: C.ink, hair: [C.ink, C.ink], style: 'band', accent: C.green, weapon: 'spear', armor: true, broad: true, beard: C.ink },
  gz_machao: { outfit: [C.white, C.lightGray], trim: C.green, belt: C.darkGreen, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.lime, weapon: 'spear', armor: true, metal: C.white, cape: C.green },
  gz_huangzhong: { outfit: [C.gold, C.green], trim: C.darkGreen, belt: C.darkGreen, boots: C.ink, hair: [C.lightGray, C.gray], style: 'helmet', accent: C.gold, weapon: 'saber', armor: true, beard: C.white, longBeard: true },
  gz_zhugeliang: { outfit: [C.white, C.lightGray], trim: C.green, belt: C.darkGreen, boots: C.ink, hair: [C.ink, C.ink], style: 'topknot', weapon: 'fan', hat: C.darkGreen, beard: C.ink },
  gz_pangtong: { outfit: [C.darkGreen, C.ink], trim: C.tan, belt: C.tan, boots: C.ink, hair: [C.darkBrown, C.ink], style: 'topknot', weapon: 'staff', orb: C.lime, hat: C.ink, beard: C.darkBrown },
  // 吴将
  gz_zhouyu: { outfit: [C.red, C.darkRed], trim: C.white, belt: C.gold, boots: C.ink, hair: [C.ink, C.ink], style: 'topknot', weapon: 'fan', hat: C.darkRed },
  gz_lvmeng: { outfit: [C.darkRed, C.ink], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.red, weapon: 'saber', armor: true, beard: C.ink },
  gz_ganning: { outfit: [C.orange, C.darkRed], trim: C.yellow, belt: C.ink, boots: C.ink, hair: [C.ink, C.ink], style: 'band', accent: C.yellow, weapon: 'saber', pants: C.darkRed, beard: C.darkBrown },
  gz_taishici: { outfit: [C.red, C.ink], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.gold, weapon: 'spear', armor: true, cape: C.red, beard: C.ink },
  gz_huanggai: { outfit: [C.darkRed, C.brown], trim: C.tan, belt: C.ink, boots: C.ink, hair: [C.lightGray, C.gray], style: 'helmet', accent: C.darkRed, weapon: 'club', armor: true, broad: true, beard: C.white },
  gz_luxun: { outfit: [C.pink, C.red], trim: C.white, belt: C.darkRed, boots: C.ink, hair: [C.ink, C.ink], style: 'topknot', weapon: 'staff', orb: C.orange, hat: C.red },
  // 群雄（董卓余部）
  gz_xurong: { outfit: [C.darkGray, C.ink], trim: C.gold, belt: C.brown, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.darkRed, weapon: 'spear', armor: true, broad: true, beard: C.ink },
  gz_lijue: { outfit: [C.brown, C.darkBrown], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.orange, weapon: 'saber', armor: true, beard: C.ink, cape: C.darkRed },
  gz_guosi: { outfit: [C.darkPurple, C.ink], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.purple, weapon: 'axe', armor: true, beard: C.ink },
  gz_zhangji: { outfit: [C.tan, C.brown], trim: C.darkRed, belt: C.darkRed, boots: C.ink, hair: [C.darkGray, C.ink], style: 'helmet', accent: C.tan, weapon: 'spear', armor: true, beard: C.darkGray },
  gz_zhangxiu: { outfit: [C.lightGray, C.gray], trim: C.darkRed, belt: C.darkRed, boots: C.ink, hair: [C.ink, C.ink], style: 'helmet', accent: C.red, weapon: 'spear', armor: true, metal: C.lightGray },
  gz_jiaxu: { outfit: [C.ink, C.darkGray], trim: C.gold, belt: C.gold, boots: C.ink, hair: [C.darkGray, C.ink], style: 'topknot', weapon: 'fan', hat: C.ink, beard: C.darkGray, longBeard: true },
};

// 有名有姓的人和各类怪的辨识度：脸、头饰、标志兵器、体型（盖在上面的基础造型上）
const SIGNATURE: Record<string, Partial<Look>> = {
  // 新手村
  zhaoyun: { head: 'plume', headColor: C.red, eyes: 'round', mouth: 'smile', metal: C.white },
  diaochan: { head: 'buyao', eyes: 'sparkle', mouth: 'smile', sash: C.white },
  elder: { eyes: 'old', mouth: 'smile' },
  guide: { mouth: 'smile' },
  helper: { mouth: 'smile' },
  constable: { head: 'cap', headColor: C.red, eyes: 'fierce', beard: C.ink, beardStyle: 'mustache' },
  squire: { fat: true, eyes: 'narrow', beardStyle: 'mustache', mouth: 'smile' },
  soldier: { eyes: 'fierce' },
  soldier_npc: { eyes: 'fierce', mouth: 'frown' },
  thief: { eyes: 'narrow', mouth: 'grin' },
  bandit: { eyes: 'fierce', beard: C.ink, beardStyle: 'stubble', mouth: 'grin', scar: true, skin: 'tan' },
  rogue: { eyes: 'narrow', mouth: 'frown' },
  brute: { eyes: 'ring', beardStyle: 'full', bare: true, skin: 'tan' },
  witch: { eyes: 'narrow', mouth: 'smile' },
  chief: { eyes: 'fierce', beardStyle: 'full', scar: true },
  strategist: { eyes: 'narrow', beardStyle: 'goatee' },
  // 许昌线
  refugee: { mouth: 'frown', skin: 'tan' },
  marauder: { eyes: 'fierce', beardStyle: 'stubble', skin: 'tan', mouth: 'grin' },
  horsethief: { eyes: 'narrow' },
  thug: { bare: true, eyes: 'fierce', mouth: 'grin', skin: 'tan' },
  farmsoldier: { eyes: 'round', mouth: 'frown' },
  pedant: { eyes: 'narrow', beardStyle: 'goatee' },
  pedant2: { eyes: 'narrow', mouth: 'smile' },
  cavalry: { eyes: 'fierce', head: 'plume', headColor: C.darkRed },
  streetbandit: { eyes: 'narrow', mouth: 'grin' },
  official: { fat: true, eyes: 'narrow', beardStyle: 'mustache' },
  official2: { eyes: 'narrow', mouth: 'smile' },
  official3: { eyes: 'fierce', beardStyle: 'mustache' },
  gentry: { fat: true, beard: C.darkBrown, beardStyle: 'mustache', mouth: 'smile' },
  roadbully: { bare: true, eyes: 'fierce', beardStyle: 'full', skin: 'tan' },
  rebel: { eyes: 'fierce', mouth: 'frown' },
  rebelmage: { eyes: 'blank' },
  rebelchief: { eyes: 'ring', beardStyle: 'full', scar: true },
  guardian: { eyes: 'fierce' },
  magistrate: { eyes: 'narrow', beardStyle: 'mustache' },
  magistrate2: { eyes: 'round', beardStyle: 'goatee' },
  minister: { eyes: 'old' },
  recruiter: { mouth: 'smile' },
  courier: { mouth: 'smile' },
  oldminer: { eyes: 'old', mouth: 'smile', skin: 'tan' },
  // 招贤名将
  g_caobao: { eyes: 'fierce', beardStyle: 'full', skin: 'tan' },
  g_weixu: { eyes: 'fierce', mouth: 'frown' },
  g_songxian: { beardStyle: 'mustache' },
  g_houcheng: { eyes: 'narrow', mouth: 'smile' },
  g_sunqian: { eyes: 'narrow', beardStyle: 'goatee' },
  g_jianyong: { beardStyle: 'stubble', mouth: 'smile' },
  g_mifang: { fat: true, mouth: 'smile', head: 'jin', headColor: C.brown },
  g_daqiao: { head: 'flower', headColor: C.pink, eyes: 'gentle', sash: C.white },
  g_xiaoqiao: { head: 'flower', headColor: C.red, eyes: 'sparkle', mouth: 'smile' },
  g_chendeng: { eyes: 'narrow', beardStyle: 'goatee' },
  // 陈留、濮阳
  m_daoshi: { head: 'daoguan', eyes: 'narrow', beardStyle: 'goatee' },
  m_shushi: { eyes: 'blank' },
  m_yaoren: { eyes: 'narrow', mouth: 'fang' },
  m_youhun: { skin: 'pale', eyes: 'blank', mask: undefined },
  m_jiangshi: { skin: 'ghoul', head: 'talisman', eyes: 'blank', mouth: 'fang', mask: undefined },
  m_lishi: { bare: true, eyes: 'ring', beardStyle: 'full', skin: 'tan' },
  m_fushou: { eyes: 'fierce', mouth: 'frown' },
  m_xianfeng: { eyes: 'fierce', beardStyle: 'full', scar: true },
  m_epu: { eyes: 'fierce', mouth: 'grin' },
  m_nvzei: { eyes: 'narrow' },
  m_bailei: { eyes: 'narrow', mouth: 'smile' },
  m_xiongtu: { eyes: 'ring', beardStyle: 'bushy', scar: true },
  m_egun: { bare: true, mouth: 'grin', eyes: 'fierce' },
  m_hjbing: { eyes: 'fierce' },
  m_hjjing: { eyes: 'fierce', mouth: 'frown' },
  m_hjqushuai: { head: 'daoguan', eyes: 'narrow' },
  m_duxing: { eyes: 'narrow' },
  m_caihua: { eyes: 'narrow', mouth: 'smile' },
  m_lvlin: { eyes: 'fierce', beardStyle: 'stubble' },
  m_jiangyang: { eyes: 'blank' },
  m_kuangshi: { bare: true, skin: 'tan', mouth: 'frown' },
  m_baoshi: { eyes: 'narrow' },
  m_baiyin: { eyes: 'narrow', mouth: 'smile' },
  m_hjdadao: { eyes: 'blank' },
  m_dadaoshouling: { eyes: 'ring', beardStyle: 'full' },
  // 洛阳：吕布紫金冠雉鸡翎方天画戟，董卓胖子高冠络腮胡
  m_xltieqi: { eyes: 'fierce' },
  m_xlmoushi: { eyes: 'narrow', beardStyle: 'goatee' },
  m_huaxiong: { eyes: 'ring', beardStyle: 'full', skin: 'dark' },
  m_langqi: { eyes: 'fierce', mouth: 'fang' },
  m_feixiong: { eyes: 'ring', mouth: 'grin', skin: 'dark' },
  m_lvbu: { style: 'topknot', head: 'zijin', headColor: C.red, weapon: 'halberd', eyes: 'fierce', metal: C.gold },
  m_luanbing: { eyes: 'fierce', beardStyle: 'stubble' },
  m_daomu: { eyes: 'narrow', mouth: 'grin' },
  m_shimo: { eyes: 'blank', skin: 'pale' },
  m_liru: { eyes: 'narrow', beardStyle: 'goatee', mouth: 'smile' },
  // 长安、汉中
  m_xlshoujun: { eyes: 'fierce' },
  m_qiangbing: { skin: 'tan', head: 'feather', headColor: C.orange, eyes: 'fierce' },
  m_qiangwu: { skin: 'tan', head: 'feather', headColor: C.yellow, eyes: 'narrow' },
  m_lijue: { eyes: 'fierce', beard: C.ink, beardStyle: 'stubble' },
  m_guosi: { eyes: 'narrow', beardStyle: 'goatee' },
  m_xlqibing: { eyes: 'fierce', head: 'plume', headColor: C.darkRed },
  m_meiwu: { eyes: 'fierce', mouth: 'frown' },
  m_dongzhuo: { fat: true, head: 'crown', eyes: 'narrow', beardStyle: 'full', armor: false },
  m_shanxiao: { eyes: 'ring', mouth: 'fang', skin: 'ghoul' },
  m_huwei: { eyes: 'fierce' },
  m_jijiu: { head: 'daoguan', eyes: 'old' },
  m_bandun: { skin: 'tan', bare: true, eyes: 'fierce', head: 'feather', headColor: C.red },
  m_wugui: { skin: 'pale', eyes: 'blank', mask: undefined, mouth: 'fang' },
  m_hufa: { head: 'daoguan', eyes: 'narrow' },
  m_tslishi: { eyes: 'ring', beardStyle: 'full' },
  m_zhanglu: { head: 'daoguan', eyes: 'narrow', beardStyle: 'long' },
  // 其他 NPC
  g_caocao_npc: { head: 'crown', eyes: 'narrow', beardStyle: 'goatee', mouth: 'smile' },
  g_yuanshao_npc: { head: 'plume', headColor: C.gold, beardStyle: 'mustache' },
  m_wenqu: { eyes: 'old', mouth: 'smile' },
  m_zuoci: { head: 'daoguan', eyes: 'old', mouth: 'smile', beardStyle: 'long' },
  // 魏
  gz_xiahoudun: { patch: true, mask: undefined, eyes: 'fierce', beardStyle: 'full' },
  gz_caoren: { eyes: 'fierce', beardStyle: 'full' },
  gz_zhangliao: { head: 'plume', headColor: C.blue, eyes: 'fierce', beardStyle: 'mustache' },
  gz_xuchu: { bare: true, fat: true, skin: 'tan', eyes: 'ring', beardStyle: 'full', mouth: 'grin' },
  gz_guojia: { skin: 'pale', eyes: 'narrow', mouth: 'smile' },
  gz_simayi: { eyes: 'narrow', beardStyle: 'goatee', head: 'crown' },
  // 蜀：关羽枣红脸美髯偃月刀，张飞黑脸环眼虎须蛇矛，诸葛亮纶巾羽扇
  gz_guanyu: { skin: 'red', eyes: 'narrow', beardStyle: 'long', weapon: 'guandao', head: 'jin', headColor: C.darkGreen, hat: undefined },
  gz_zhangfei: { skin: 'dark', eyes: 'ring', beardStyle: 'bushy', weapon: 'snake', style: 'short' },
  gz_machao: { head: 'lion', headColor: C.white, eyes: 'fierce' },
  gz_huangzhong: { weapon: 'bow', eyes: 'fierce', beardStyle: 'long' },
  gz_zhugeliang: { head: 'lunjin', headColor: C.lightBlue, weapon: 'feather', eyes: 'narrow', beardStyle: 'mustache', mouth: 'smile', hat: undefined },
  gz_pangtong: { skin: 'tan', eyes: 'ring', beardStyle: 'stubble', head: 'jin', headColor: C.ink, hat: undefined },
  // 吴：甘宁光膀子挂铜铃插翎，黄盖铁鞭
  gz_zhouyu: { weapon: 'sword', head: 'jin', headColor: C.darkRed, hat: undefined, mouth: 'smile' },
  gz_lvmeng: { eyes: 'fierce', beardStyle: 'mustache' },
  gz_ganning: { bare: true, bells: true, skin: 'tan', head: 'feather', headColor: C.yellow, eyes: 'fierce', mouth: 'grin', beardStyle: 'stubble' },
  gz_taishici: { weapon: 'halberd', head: 'plume', headColor: C.gold, eyes: 'fierce' },
  gz_huanggai: { weapon: 'whip', eyes: 'fierce', beardStyle: 'full' },
  gz_luxun: { mouth: 'smile', head: 'jin', headColor: C.darkRed, hat: undefined },
  // 群雄
  gz_xurong: { eyes: 'fierce', beardStyle: 'stubble' },
  gz_lijue: { eyes: 'fierce', beardStyle: 'stubble' },
  gz_guosi: { eyes: 'narrow', mouth: 'grin' },
  gz_zhangji: { eyes: 'fierce', beardStyle: 'mustache' },
  gz_zhangxiu: { head: 'plume', headColor: C.red, eyes: 'fierce' },
  gz_jiaxu: { eyes: 'narrow', beardStyle: 'goatee', mouth: 'smile' },
  // 国战小兵：兵卒怒目，谋士细眼，方士空眼
  gz_weibu: { eyes: 'fierce' },
  gz_shubu: { eyes: 'fierce' },
  gz_wubu: { eyes: 'fierce' },
  gz_weimou: { eyes: 'narrow' },
  gz_shumou: { eyes: 'narrow' },
  gz_wumou: { eyes: 'narrow' },
};
for (const [k, v] of Object.entries(SIGNATURE)) if (LOOKS[k]) Object.assign(LOOKS[k], v);

// 副将学了别的职业的技能：保留脸、发型、胡子，换成那个职业的衣服和兵器
function classedLook(base: Look, cls: string): Look {
  const h = HERO[cls];
  if (!h) return base;
  return { ...base, outfit: h.outfit, trim: h.trim, belt: h.belt, weapon: h.weapon, armor: h.armor, orb: h.orb, metal: undefined, accent: base.accent ?? h.accent };
}

export function lookFor(key: string, variant = 0): Look {
  if (key.startsWith('cls:')) {
    const [, base, cls] = key.split(':');
    return classedLook(lookFor(base, variant), cls);
  }
  if (key.startsWith('hero_')) {
    const [, cls, gender] = key.split('_');
    return heroLook(cls, gender, variant);
  }
  return LOOKS[key] ?? LOOKS.thief;
}

interface Frame {
  dx: number;
  dy: number;
  eyesClosed: boolean;
  arm: 'down' | 'forward' | 'up';
  legs: 'stand' | 'lunge' | 'brace';
}

function frameOf(pose: Pose): Frame {
  switch (pose) {
    case 'idle2':
      return { dx: 0, dy: 1, eyesClosed: false, arm: 'down', legs: 'stand' };
    case 'atk':
      return { dx: -2, dy: 1, eyesClosed: false, arm: 'forward', legs: 'lunge' };
    case 'cast':
      return { dx: 0, dy: 0, eyesClosed: false, arm: 'up', legs: 'brace' };
    case 'hurt':
      return { dx: 2, dy: 1, eyesClosed: true, arm: 'down', legs: 'brace' };
    default:
      return { dx: 0, dy: 0, eyesClosed: pose === 'down', arm: 'down', legs: 'stand' };
  }
}

// 文官、术士、女子穿长袍（看不到裤腿）；武人穿短褂大裤脚
function robed(L: Look): boolean {
  return !!L.female || (!L.armor && !L.bare && ['fan', 'staff', 'scroll', 'cane', 'none', 'feather'].includes(L.weapon));
}

// 肤色和它的暗面
function skinOf(L: Look): [number, number] {
  switch (L.skin) {
    case 'pale':
      return [blend(C.skin, C.white, 0.5), C.skin];
    case 'tan':
      return [blend(C.skin, C.skinShade, 0.625), blend(C.skinShade, C.brown, 0.375)];
    case 'dark':
      return [blend(C.skinShade, C.brown, 0.625), blend(C.brown, C.darkBrown, 0.5)];
    case 'red':
      return [blend(C.red, C.skinShade, 0.375), C.darkRed];
    case 'ghoul':
      return [blend(C.lime, C.lightGray, 0.5), blend(C.grass, C.gray, 0.5)];
    default:
      return [C.skin, C.skinShade];
  }
}

const HEAD_Y = 13;
const BELT_Y = 31;
const HIP_Y = 34;

// 前手（左手）的位置：兵器都挂在这里
function handOf(f: Frame): [number, number] {
  if (f.arm === 'forward') return [BX - 17 + f.dx, 26];
  if (f.arm === 'up') return [BX - 10 + f.dx, 9];
  return [BX - 9 + f.dx, 33];
}

// 飘带：从 (x0,y0) 往身后飘，带一点波浪
function ribbon(g: Grid, x0: number, y0: number, len: number, drop: number, c: number, wave = 1): void {
  for (let i = 0; i <= len; i++) {
    const t = i / len;
    const y = y0 + drop * t * t + Math.sin(t * Math.PI * 2) * wave;
    g.set(x0 + i, y, c);
    g.set(x0 + i, y + 1, c);
  }
}

function drawBack(g: Grid, L: Look, f: Frame): void {
  const hx = BX + f.dx;
  const hy = HEAD_Y + f.dy;
  const [hm] = L.hair;
  const [sk] = skinOf(L);
  const hc = L.headColor ?? L.accent ?? C.red;
  if (L.cape) g.poly([[BX - 3, 22], [BX + 9, 22], [BX + 13, 46], [BX + 1, 46]], L.cape);
  // 披帛：从肩后绕出来往下飘
  if (L.sash !== undefined) {
    g.line(BX + 5, 21, BX + 13, 27, L.sash);
    g.line(BX + 6, 21, BX + 14, 27, L.sash);
    g.line(BX + 13, 27, BX + 12, 44, L.sash);
    g.line(BX + 14, 27, BX + 14, 43, L.sash);
  }
  if (L.style === 'long') g.poly([[hx + 1, hy - 4], [hx + 9, hy - 2], [hx + 11, hy + 22], [hx + 2, hy + 20]], hm);
  if (L.style === 'tail') g.poly([[hx + 6, hy - 4], [hx + 10, hy - 3], [hx + 12, hy + 12], [hx + 9, hy + 13]], hm);
  if (L.style === 'band' && L.accent !== undefined && !L.head) g.poly([[hx + 7, hy - 4], [hx + 9, hy - 5], [hx + 14, hy + 2], [hx + 12, hy + 3]], L.accent);
  // 头饰往后飘的带子
  if (L.head === 'guard') {
    ribbon(g, hx + 7, hy - 5, 11, 7, hc, 1);
    ribbon(g, hx + 7, hy - 4, 8, 11, hc, 0.6);
  }
  if (L.head === 'jin' || L.head === 'lunjin') {
    const c = L.headColor ?? L.outfit[1];
    g.line(hx + 5, hy - 8, hx + 11, hy + 8, c);
    g.line(hx + 6, hy - 8, hx + 13, hy + 6, c);
  }
  if (L.head === 'plume' || L.head === 'lion') {
    // 盔缨往后散开
    for (let k = 0; k < 4; k++) g.line(hx + 2, hy - 12, hx + 9 + k, hy - 10 + k * 3, hc);
  }
  // 后手臂（被身子挡住一半）
  const om = L.bare ? sk : L.outfit[0];
  let bh: [number, number];
  if (f.arm === 'forward') {
    g.rect(BX + 5 + f.dx, 23, 4, 7, om);
    g.rect(BX + 6 + f.dx, 29, 3, 3, sk);
    bh = [BX + 7 + f.dx, 30];
  } else {
    g.poly([[BX + 4 + f.dx, 22], [BX + 9 + f.dx, 23], [BX + 10 + f.dx, 31], [BX + 6 + f.dx, 31]], om);
    g.rect(BX + 7 + f.dx, 31, 3, 3, sk);
    bh = [BX + 8 + f.dx, 32];
  }
  // 双股剑：后手也握一把（藏在身后，只露出肩上那截）
  if (L.weapon === 'twin') {
    const metal = L.metal ?? C.white;
    if (f.arm === 'forward') g.rect(bh[0] - 12, bh[1], 12, 1, metal);
    else {
      g.rect(bh[0], bh[1] - 17, 2, 16, metal);
      g.rect(bh[0] - 1, bh[1] - 1, 4, 1, C.gold);
    }
  }
}

function drawLegs(g: Grid, L: Look, f: Frame): void {
  const boots = L.boots;
  if (robed(L)) {
    // 长袍：往下散开，下摆一道镶边，露出鞋尖
    const [om, od] = L.outfit;
    const spread = f.legs === 'lunge' ? 2 : 0;
    const fat = L.fat ? 2 : 0;
    for (let y = HIP_Y - 1; y <= 46; y++) {
      const t = y - (HIP_Y - 1);
      const l = BX - 7 - fat - t * 0.4 - spread;
      const r = BX + 7 + fat + t * 0.35;
      for (let x = Math.round(l); x <= Math.round(r); x++) g.set(x, y, y >= 45 ? L.trim : x > BX + 2 && x < BX + 4 ? od : om);
    }
    g.rect(BX - 9 - spread, 47, 6, 3, boots);
    g.rect(BX + 2, 47, 6, 3, boots);
    return;
  }
  const pants = L.pants ?? L.outfit[1];
  // 前腿、后腿：大裤脚，叉开站
  const front = f.legs === 'lunge' ? -6 : f.legs === 'brace' ? -2 : -4;
  const back = f.legs === 'lunge' ? 5 : f.legs === 'brace' ? 4 : 3;
  g.poly([[BX - 6, HIP_Y - 1], [BX, HIP_Y - 1], [BX - 1 + front / 2, 40], [BX + front / 2 + 0.5, 46], [BX - 7 + front, 46], [BX - 8 + front / 2, 40]], pants);
  g.poly([[BX + 1, HIP_Y - 1], [BX + 7, HIP_Y - 1], [BX + 8 + back / 2, 40], [BX + 7 + back, 46], [BX + 1 + back, 46], [BX + back / 2, 40]], pants);
  // 绑腿 + 靴子（靴尖朝前）
  g.rect(Math.round(BX - 6 + front), 45, 6, 1, L.trim);
  g.rect(Math.round(BX + 2 + back), 45, 5, 1, L.trim);
  g.rect(Math.round(BX - 8 + front), 46, 8, 4, boots);
  g.rect(Math.round(BX + 1 + back), 46, 7, 4, boots);
}

function drawTorso(g: Grid, L: Look, f: Frame): void {
  const [om, od] = L.outfit;
  const [sk, sks] = skinOf(L);
  const w = L.broad ? 2 : 0;
  const x0 = BX + f.dx;
  const body = L.bare ? sk : om;
  for (let y = 21; y <= HIP_Y; y++) {
    // 胖子：肚子往外鼓
    const belly = L.fat ? Math.round(Math.sin(Math.max(0, Math.min(1, (y - 23) / 11)) * Math.PI) * 4) : 0;
    const l = x0 - 7 - w - belly + (y < 23 ? 1 : 0);
    const r = x0 + 7 + w + Math.round(belly / 2) - (y < 23 ? 1 : 0);
    for (let x = l; x <= r; x++) g.set(x, y, body);
  }
  if (L.bare) {
    // 光膀子：胸肌和肚脐，斜挎一条布带
    g.line(x0 - 5, 25, x0 - 1, 26, sks);
    g.line(x0 + 1, 26, x0 + 4, 25, sks);
    g.set(x0 - 2, 29, sks);
    g.line(x0 + 5, 21, x0 - 6, BELT_Y - 1, om);
    g.line(x0 + 6, 21, x0 - 5, BELT_Y - 1, om);
  } else {
    // 交领：两道斜襟
    g.line(x0 - 4, 21, x0 + 1, 28, L.trim);
    g.line(x0 + 3, 21, x0 + 1, 25, L.trim);
    g.rect(x0 + 1, 28, 1, BELT_Y - 28, od);
  }
  if (L.armor) {
    const metal = L.metal ?? C.lightGray;
    g.rect(x0 - 5, 23, 10, 7, C.gray);
    g.rect(x0 - 4, 24, 8, 1, metal);
    g.rect(x0 - 4, 27, 8, 1, metal);
    // 护心镜
    g.ellipse(x0 - 1, 25.5, 1.6, 1.6, metal);
    g.ellipse(x0 - 7 - w / 2, 23, 3.2, 2.6, C.gray);
    g.ellipse(x0 - 7.5 - w / 2, 22.5, 1.6, 1.2, metal);
  }
  // 腰带 + 带扣
  const bw = L.fat ? 3 : 0;
  g.rect(x0 - 7 - w - bw, BELT_Y, 15 + 2 * w + bw + 1, 2, L.belt);
  g.rect(x0 - 1, BELT_Y, 2, 2, C.gold);
  // 甘宁：腰上挂铜铃
  if (L.bells) for (const bx of [x0 - 6, x0 - 2, x0 + 3]) {
    g.rect(bx, BELT_Y + 2, 2, 2, C.gold);
    g.set(bx, BELT_Y + 4, C.yellow);
  }
  // 下摆（短褂盖到胯）
  if (!robed(L)) g.poly([[x0 - 8 - w - bw, HIP_Y - 1], [x0 + 8 + w, HIP_Y - 1], [x0 + 9 + w, HIP_Y + 2], [x0 - 9 - w - bw, HIP_Y + 2]], om);
}

function drawFrontArm(g: Grid, L: Look, f: Frame): void {
  const [sk] = skinOf(L);
  const om = L.bare ? sk : L.outfit[0];
  const x0 = BX + f.dx;
  const [hx, hy] = handOf(f);
  if (f.arm === 'forward') {
    g.poly([[x0 - 6, 22], [x0 - 2, 24], [hx + 3, 28], [hx + 2, 24]], om);
    g.rect(hx, hy - 1, 3, 3, sk);
  } else if (f.arm === 'up') {
    g.poly([[x0 - 7, 22], [x0 - 3, 23], [hx + 3, hy + 3], [hx, hy + 3]], om);
    g.rect(hx - 1, hy - 1, 3, 3, sk);
  } else {
    // 宽袖口
    g.poly([[x0 - 8, 22], [x0 - 4, 22], [hx + 3, hy - 1], [hx - 2, hy - 1]], om);
    if (!L.bare) g.rect(hx - 2, hy - 2, 6, 1, L.trim);
    g.rect(hx - 1, hy - 1, 3, 3, sk);
  }
}

function drawHair(g: Grid, L: Look, hx: number, hy: number): void {
  const [hm] = L.hair;
  if (L.style === 'helmet') {
    const metal = L.metal ?? C.lightGray;
    const shell = L.head === 'lion' ? C.white : C.gray;
    g.ellipse(hx, hy, 9, 8.8, shell, (_x, y) => y + 0.5 < hy - 1);
    g.rect(hx - 9, hy - 2, 18, 2, metal);
    // 护耳
    g.ellipse(hx, hy, 9, 8.8, shell, (x, y) => y >= hy - 1 && x > hx + 3 && y < hy + 6);
    if (L.head === 'plume' || L.head === 'lion') {
      // 大红盔缨
      const hc = L.headColor ?? L.accent ?? C.red;
      g.rect(hx, hy - 11, 2, 3, metal);
      g.ellipse(hx + 1.5, hy - 13, 3.4, 2.6, hc);
    } else {
      g.rect(hx - 1, hy - 13, 3, 5, L.accent ?? C.red);
      g.rect(hx - 2, hy - 9, 5, 1, metal);
    }
    if (L.head === 'lion') {
      // 狮头：额前一圈金鬃，两点眼
      for (let x = hx - 8; x <= hx + 2; x++) g.set(x, hy - 3 - ((x + hx) % 2), C.gold);
      g.rect(hx - 6, hy - 7, 6, 3, C.gold);
      g.set(hx - 5, hy - 6, C.ink);
      g.set(hx - 2, hy - 6, C.ink);
    }
    return;
  }
  if (L.style === 'hood') {
    g.ellipse(hx, hy, 9.2, 9, hm, (x, y) => y + 0.5 < hy - 2 || (x > hx + 1 && y < hy + 9));
    g.rect(hx - 8, hy - 3, 10, 1, L.outfit[1]);
    return;
  }
  g.ellipse(hx, hy, 8.9, 8.6, hm, (x, y) => y + 0.5 < hy - 2.5 || (x + 0.5 > hx + 2.5 + (y - hy) * 0.3 && y < hy + 5));
  // 刘海：锯齿
  for (let x = hx - 8; x <= hx + 3; x++) {
    g.set(x, hy - 3, hm);
    if ((x - hx) % 3 === 0) g.set(x, hy - 2, hm);
  }
  if (L.style === 'short') for (let x = hx - 6; x <= hx + 6; x += 3) g.set(x, hy - 9, hm);
  if (L.style === 'topknot') {
    g.ellipse(hx + 2, hy - 10, 3.2, 2.8, hm);
    g.rect(hx, hy - 8, 5, 1, L.accent ?? C.gold);
  }
  if (L.style === 'band' && L.accent !== undefined && !L.head) g.rect(hx - 9, hy - 5, 18, 2, L.accent);
  if (L.style === 'buns') {
    g.ellipse(hx - 5, hy - 8, 3.2, 3, hm);
    g.ellipse(hx + 5, hy - 9, 3.2, 3, hm);
    g.set(hx - 5, hy - 11, L.accent ?? C.pink);
    g.set(hx + 5, hy - 12, L.accent ?? C.pink);
  }
  if (L.style === 'highbun') {
    g.ellipse(hx + 2, hy - 11, 4.2, 3.4, hm);
    g.line(hx - 3, hy - 13, hx + 7, hy - 9, L.accent ?? C.gold);
  }
}

// 雉鸡翎：一根长翎，一段一段红白相间
function featherLine(g: Grid, pts: [number, number][], c: number): void {
  let k = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
    for (let j = 0; j < n; j++, k++) g.set(ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n, Math.floor(k / 3) % 2 ? C.white : c);
  }
}

function drawHeadgear(g: Grid, L: Look, hx: number, hy: number): void {
  const hc = L.headColor ?? L.accent ?? C.red;
  const metal = L.metal ?? C.lightGray;
  switch (L.head) {
    case 'guard':
      // 护额：一道铁箍，额前一块金片
      g.rect(hx - 9, hy - 5, 16, 2, metal);
      g.rect(hx - 6, hy - 6, 4, 3, C.gold);
      g.set(hx - 5, hy - 5, C.red);
      break;
    case 'jin': {
      const c = L.headColor ?? L.outfit[1];
      g.ellipse(hx + 1, hy - 9, 6, 3.5, c, (_x, y) => y < hy - 7);
      g.rect(hx - 6, hy - 8, 13, 3, c);
      g.rect(hx - 6, hy - 6, 13, 1, L.trim);
      break;
    }
    case 'lunjin': {
      // 纶巾：高一点、有褶
      const c = L.headColor ?? L.outfit[1];
      g.ellipse(hx + 1, hy - 8, 7.5, 5, c, (_x, y) => y < hy - 5);
      for (const x of [hx - 3, hx + 1, hx + 5]) g.line(x, hy - 11, x - 1, hy - 6, blend(c, C.ink, 0.375));
      g.rect(hx - 6, hy - 6, 13, 1, L.trim);
      break;
    }
    case 'daoguan':
      // 道冠：髻上一顶小金冠，一根簪子横穿
      g.ellipse(hx + 2, hy - 10, 3.2, 2.8, L.hair[0]);
      g.rect(hx - 1, hy - 13, 6, 3, C.gold);
      g.set(hx - 1, hy - 14, C.gold);
      g.set(hx + 2, hy - 15, C.gold);
      g.set(hx + 4, hy - 14, C.gold);
      g.line(hx - 4, hy - 11, hx + 8, hy - 12, C.brown);
      g.set(hx + 2, hy - 12, L.orb ?? C.red);
      break;
    case 'zijin':
      // 紫金冠：额前金箍 + 顶上金冠，两根雉鸡翎往后弯
      g.rect(hx - 9, hy - 5, 16, 2, C.gold);
      g.set(hx - 6, hy - 6, C.red);
      g.rect(hx - 1, hy - 12, 6, 4, C.gold);
      g.set(hx + 1, hy - 11, C.red);
      featherLine(g, [[hx - 1, hy - 12], [hx + 1, hy - 14], [hx + 6, hy - 14], [hx + 12, hy - 12], [hx + 17, hy - 8], [hx + 20, hy - 2]], hc);
      featherLine(g, [[hx + 4, hy - 12], [hx + 7, hy - 12], [hx + 11, hy - 10], [hx + 15, hy - 6], [hx + 17, hy - 1], [hx + 18, hy + 5]], hc);
      break;
    case 'buyao': {
      // 步摇：金簪上吊两串珠子，鬓边一朵花
      const c = L.headColor ?? C.gold;
      g.line(hx - 5, hy - 12, hx + 6, hy - 9, c);
      for (let k = 0; k < 4; k++) {
        g.set(hx - 5, hy - 11 + k, k % 2 ? C.red : c);
        g.set(hx - 3, hy - 10 + k, k % 2 ? c : C.red);
      }
      g.ellipse(hx + 6, hy - 7, 1.6, 1.6, C.pink);
      g.set(hx + 6, hy - 7, C.yellow);
      break;
    }
    case 'flower':
      for (const [fx, fy] of [[hx - 5, hy - 9], [hx + 5, hy - 10], [hx + 7, hy - 6]] as [number, number][]) {
        g.ellipse(fx, fy, 1.7, 1.7, hc);
        g.set(fx, fy, C.yellow);
      }
      break;
    case 'cap':
      // 捕快帽：黑帽顶上一撮红缨
      g.rect(hx - 6, hy - 11, 12, 6, L.hat ?? C.ink);
      g.rect(hx - 8, hy - 6, 16, 2, L.hat ?? C.ink);
      g.ellipse(hx, hy - 12, 3, 2, hc);
      break;
    case 'crown':
      // 高冠：前高后低，金色冠梁
      g.poly([[hx - 7, hy - 5], [hx + 6, hy - 5], [hx + 6, hy - 11], [hx - 7, hy - 15]], L.hat ?? C.ink);
      g.line(hx - 6, hy - 13, hx + 5, hy - 10, C.gold);
      g.rect(hx - 9, hy - 5, 17, 1, C.gold);
      break;
    case 'feather':
      // 一根翎羽插在头上
      featherLine(g, [[hx + 2, hy - 8], [hx + 4, hy - 13], [hx + 9, hy - 15], [hx + 14, hy - 13]], hc);
      break;
    default:
      break;
  }
}

function drawFace(g: Grid, L: Look, f: Frame, hx: number, hy: number): void {
  const ink = C.ink;
  const [, sks] = skinOf(L);
  const ey = hy;
  const e1 = hx - 6;
  const e2 = hx - 1;
  const eyes: Eyes = L.eyes ?? (L.female ? 'gentle' : 'round');
  const brow = L.beard !== undefined ? L.beard : L.female ? L.hair[0] : ink;
  if (f.eyesClosed) {
    g.rect(e1, ey + 2, 2, 1, ink);
    g.rect(e2, ey + 2, 2, 1, ink);
  } else {
    switch (eyes) {
      case 'fierce':
        // 怒目：眼小一点、眉毛压下来
        for (const ex of [e1, e2]) {
          g.rect(ex, ey + 1, 2, 3, ink);
          g.set(ex + 1, ey + 1, C.white);
        }
        g.line(e1 - 2, ey - 2, e1 + 2, ey, brow);
        g.line(e1 - 2, ey - 3, e1 + 1, ey - 1, brow);
        g.line(e2, ey, e2 + 3, ey - 2, brow);
        g.line(e2 + 1, ey - 1, e2 + 3, ey - 3, brow);
        break;
      case 'narrow':
        // 细长眼：一道横线，眉毛细而上挑
        for (const ex of [e1, e2]) {
          g.rect(ex - 1, ey + 1, 3, 1, ink);
          g.set(ex, ey + 2, ink);
        }
        if (!L.female) {
          g.line(e1 - 1, ey - 1, e1 + 2, ey - 2, brow);
          g.line(e2, ey - 2, e2 + 3, ey - 2, brow);
        }
        break;
      case 'old':
        // 眯眼：两道弯，长寿眉往下垂
        for (const ex of [e1, e2]) {
          g.set(ex - 1, ey + 2, ink);
          g.set(ex, ey + 1, ink);
          g.set(ex + 1, ey + 2, ink);
        }
        g.line(e1 - 2, ey, e1 + 1, ey - 2, brow);
        g.line(e2, ey - 2, e2 + 3, ey, brow);
        break;
      case 'gentle':
        for (const ex of [e1, e2]) {
          g.rect(ex, ey + 1, 2, 3, ink);
          g.set(ex + 1, ey + 1, C.white);
        }
        g.set(e1 - 1, ey + 1, ink);
        g.set(e2 + 2, ey + 1, ink);
        break;
      case 'sparkle':
        // 亮眼：大眼、双高光、睫毛上翘
        for (const ex of [e1, e2]) {
          g.rect(ex, ey, 2, 4, ink);
          g.set(ex + 1, ey + 1, C.white);
          g.set(ex, ey + 3, C.lightBlue);
        }
        g.set(e1 - 1, ey - 1, ink);
        g.set(e2 + 2, ey - 1, ink);
        break;
      case 'ring':
        // 环眼（豹眼）：白眼圈 + 黑眼珠，粗眉倒竖
        for (const ex of [e1 - 1, e2]) {
          g.rect(ex, ey, 3, 3, C.white);
          g.set(ex, ey + 1, ink);
          g.set(ex + 1, ey + 1, ink);
        }
        g.line(e1 - 2, ey - 3, e1 + 2, ey - 1, brow);
        g.line(e1 - 2, ey - 2, e1 + 2, ey, brow);
        g.line(e2, ey - 1, e2 + 3, ey - 3, brow);
        g.line(e2, ey, e2 + 3, ey - 2, brow);
        break;
      case 'blank':
        for (const ex of [e1, e2]) g.rect(ex, ey + 1, 2, 2, C.white);
        break;
      default:
        for (const ex of [e1, e2]) {
          g.rect(ex, ey, 2, 4, ink);
          g.set(ex + 1, ey + 1, C.white);
        }
        if (L.female) {
          g.set(e1 - 1, ey, ink);
          g.set(e2 + 2, ey, ink);
        }
    }
  }
  if (!L.female && (eyes === 'round' || f.eyesClosed)) {
    g.rect(e1 - 1, ey - 2, 3, 1, brow);
    g.rect(e2, ey - 2, 3, 1, brow);
  }
  if (L.female) {
    g.set(e1 - 1, ey + 5, C.pink);
    g.set(e2 + 2, ey + 5, C.pink);
  }
  // 独眼罩（夏侯惇）：盖住前眼，带子勒到脑后
  if (L.patch) {
    g.rect(e1 - 1, ey - 1, 4, 4, ink);
    g.line(e1 + 2, ey - 1, hx + 8, hy - 4, ink);
  }
  if (L.scar) g.line(e2 + 3, ey - 3, e2 + 1, ey + 4, C.darkRed);
  g.set(hx + 3, hy + 2, sks);
  if (L.mask !== undefined) g.rect(hx - 9, hy + 4, 11, 3, L.mask);
  drawBeard(g, L, hx, hy);
  drawMouth(g, L, hx, hy, sks);
  // 黄符贴在脑门上，一直垂到下巴
  if (L.head === 'talisman') {
    g.rect(hx - 6, hy - 5, 4, 11, C.yellow);
    g.line(hx - 5, hy - 4, hx - 4, hy + 4, C.red);
    g.set(hx - 3, hy - 2, C.red);
  }
}

function drawMouth(g: Grid, L: Look, hx: number, hy: number, sks: number): void {
  const m: Mouth = L.mouth ?? (L.beardStyle === 'bushy' ? 'grin' : 'line');
  switch (m) {
    case 'grin':
      g.rect(hx - 6, hy + 5, 4, 2, C.darkRed);
      g.rect(hx - 6, hy + 5, 4, 1, C.white);
      break;
    case 'smile':
      g.set(hx - 6, hy + 5, sks);
      g.rect(hx - 5, hy + 6, 2, 1, L.female ? C.red : sks);
      g.set(hx - 3, hy + 5, sks);
      break;
    case 'frown':
      g.rect(hx - 5, hy + 6, 3, 1, C.darkBrown);
      g.set(hx - 6, hy + 7, C.darkBrown);
      break;
    case 'fang':
      g.rect(hx - 6, hy + 6, 4, 1, C.ink);
      g.set(hx - 6, hy + 7, C.white);
      g.set(hx - 3, hy + 7, C.white);
      break;
    default:
      if (L.beardStyle !== 'full') g.rect(hx - 4, hy + 6, 2, 1, L.female ? C.red : sks);
  }
}

function drawBeard(g: Grid, L: Look, hx: number, hy: number): void {
  const b = L.beard;
  if (b === undefined) return;
  const lite = blend(b, C.white, 0.25);
  const must = () => {
    g.line(hx - 8, hy + 6, hx - 6, hy + 5, b);
    g.line(hx - 3, hy + 5, hx - 1, hy + 6, b);
  };
  switch (L.beardStyle) {
    case 'mustache':
      must();
      return;
    case 'goatee':
      must();
      g.rect(hx - 6, hy + 7, 3, 3, b);
      g.rect(hx - 5, hy + 10, 2, 2, b);
      return;
    case 'long':
      // 美髯：从下巴垂到胸前，几道亮丝，末端分三绺
      must();
      g.poly([[hx - 8, hy + 7], [hx + 1, hy + 7], [hx, hy + 14], [hx - 2, hy + 21], [hx - 6, hy + 21], [hx - 8, hy + 14]], b);
      g.line(hx - 6, hy + 9, hx - 5, hy + 19, lite);
      g.line(hx - 3, hy + 9, hx - 3, hy + 18, lite);
      g.set(hx - 7, hy + 22, b);
      g.set(hx - 4, hy + 23, b);
      g.set(hx - 1, hy + 22, b);
      return;
    case 'bushy':
      // 虎须：一圈短硬的胡子往外扎
      g.rect(hx - 9, hy + 4, 11, 6, b);
      g.ellipse(hx - 4, hy + 9, 5.5, 3, b);
      g.line(hx - 9, hy + 5, hx - 12, hy + 3, b);
      g.line(hx - 9, hy + 8, hx - 12, hy + 9, b);
      g.line(hx - 7, hy + 11, hx - 9, hy + 14, b);
      g.line(hx - 3, hy + 12, hx - 3, hy + 15, b);
      g.line(hx + 1, hy + 10, hx + 3, hy + 13, b);
      return;
    case 'full':
      // 络腮胡：整个下巴一大团
      g.ellipse(hx - 3, hy + 8, 6.5, 4.5, b);
      g.rect(hx + 2, hy + 2, 2, 6, b);
      must();
      g.rect(hx - 5, hy + 6, 3, 1, C.darkRed);
      return;
    case 'stubble':
      for (let y = hy + 5; y <= hy + 8; y++) for (let x = hx - 8; x <= hx + 2; x++) if ((x + y) % 2 === 0 && g.get(x, y) !== 0) g.set(x, y, blend(skinOf(L)[0], b, 0.5));
      return;
    default:
      // 原来的画法：短胡子，或者垂到胸前的长胡子
      g.rect(hx - 6, hy + 5, 2, 1, b);
      g.rect(hx - 2, hy + 5, 2, 1, b);
      for (let x = hx - 7; x <= hx + 1; x++) g.set(x, hy + 7, b);
      g.rect(hx - 5, hy + 8, 4, 1, b);
      if (L.longBeard) g.poly([[hx - 7, hy + 7], [hx + 1, hy + 7], [hx - 2, hy + 18], [hx - 5, hy + 18]], b);
  }
}

function drawHead(g: Grid, L: Look, f: Frame): void {
  const hx = BX + f.dx;
  const hy = HEAD_Y + f.dy;
  const [sk, sks] = skinOf(L);
  // 脖子
  g.rect(hx - 2, hy + 7, 4, 3, sks);
  g.ellipse(hx, hy, 8.4, 8, sk);
  drawHair(g, L, hx, hy);
  if (L.hat !== undefined && !L.head) {
    g.rect(hx - 5, hy - 13, 10, 5, L.hat);
    g.rect(hx - 7, hy - 9, 14, 2, L.hat);
    g.rect(hx + 6, hy - 9, 2, 6, L.hat);
  }
  if (L.head === 'talisman' && L.hat !== undefined) {
    g.rect(hx - 5, hy - 13, 10, 5, L.hat);
    g.rect(hx - 7, hy - 9, 14, 2, L.hat);
  }
  drawHeadgear(g, L, hx, hy);
  drawFace(g, L, f, hx, hy);
}

// 长兵器（枪、刀、戟）的头：idle 时竖着朝上，攻击时横着朝前（左）；dir=1 朝上，坐标 (x,y) 是杆头
function polearmHead(g: Grid, L: Look, x: number, y: number, up: boolean): void {
  const metal = L.metal ?? C.white;
  const acc = L.accent ?? C.red;
  // up：沿 -y 方向伸；横着：沿 -x 方向伸。用 (a,b) 表示“沿杆往外 a、往前侧 b”
  const P = (a: number, b: number): [number, number] => (up ? [x - b, y - a] : [x - a, y - b]);
  const set = (a: number, b: number, c: number) => {
    const [px, py] = P(a, b);
    g.set(px, py, c);
  };
  const tri = (pts: [number, number][], c: number) => g.poly(pts.map(([a, b]) => P(a, b)), c);
  switch (L.weapon) {
    case 'guandao':
      // 偃月刀：一大片月牙刀身朝前侧，刀背一个小钩，吞口一圈绿（青龙）
      tri([[0, 0], [3, 4], [9, 5], [13, 3], [12, 0], [8, -1], [2, -1]], metal);
      for (let a = 3; a <= 11; a++) set(a, 4 + (a > 6 && a < 11 ? 1 : 0), C.white);
      set(4, -2, metal);
      set(5, -3, metal);
      for (let b = -1; b <= 2; b++) set(-1, b, C.green);
      set(-2, 0, C.green);
      return;
    case 'snake':
      // 蛇矛：弯弯曲曲的矛头
      for (let a = 0; a <= 9; a++) {
        const b = [0, 1, 1, 0, -1, -1, 0, 1, 1, 0][a];
        set(a, b, metal);
        set(a, b + 1, a % 3 === 0 ? C.white : metal);
      }
      set(-1, -1, acc);
      set(-1, 1, acc);
      set(-2, 0, acc);
      return;
    case 'halberd':
      // 方天画戟：中间枪尖，两边月牙
      tri([[0, -1], [0, 2], [8, 0.5]], metal);
      tri([[1, 2], [4, 5], [1, 6], [-1, 4]], metal);
      tri([[1, -1], [4, -4], [1, -5], [-1, -3]], metal);
      set(2, 4, C.white);
      set(2, -3, C.white);
      set(-1, 0, acc);
      set(-2, 0, acc);
      set(-2, 1, acc);
      return;
    default:
      // 普通长枪：枪尖 + 红缨
      tri([[0, -2], [0, 3], [7, 0.5]], metal);
      set(-1, -1, acc);
      set(-1, 1, acc);
      set(-2, 0, acc);
      set(-2, 1, acc);
      set(-1, 0, acc);
  }
}

function drawWeapon(g: Grid, L: Look, f: Frame): void {
  const metal = L.metal ?? C.white;
  const wood = C.lightBrown;
  const [hx, hy] = handOf(f);
  const pole = L.weapon === 'spear' || L.weapon === 'guandao' || L.weapon === 'snake' || L.weapon === 'halberd';
  if (f.arm === 'forward') {
    // 攻击：兵器朝前平伸（画布左边只剩 11 像素，长兵器的头收在画布里）
    const y = hy;
    if (pole) {
      g.rect(hx - 4, y, 16, 1, L.weapon === 'guandao' ? C.darkBrown : wood);
      polearmHead(g, L, hx - 4, y, false);
      return;
    }
    switch (L.weapon) {
      case 'sword':
      case 'saber':
      case 'twin':
        g.rect(hx - 18, y, 18, 2, metal);
        g.rect(hx - 18, y, 18, 1, C.white);
        if (L.weapon === 'saber') g.rect(hx - 19, y - 1, 3, 1, metal);
        g.rect(hx - 1, y - 2, 2, 6, C.gold);
        return;
      case 'staff':
      case 'cane':
        g.rect(hx - 16, y, 24, 1, C.brown);
        if (L.orb) g.ellipse(hx - 17, y + 0.5, 2.6, 2.6, L.orb);
        return;
      case 'fan':
        g.ellipse(hx - 4, y + 0.5, 4.5, 5, C.white);
        g.line(hx - 7, y - 3, hx - 1, y + 1, C.sand);
        g.line(hx - 7, y + 4, hx - 1, y + 1, C.sand);
        return;
      case 'feather':
        g.ellipse(hx - 5, y + 0.5, 5.5, 4, C.white);
        for (let k = -3; k <= 3; k += 2) g.line(hx, y + 0.5, hx - 9, y + 0.5 + k, C.lightGray);
        g.rect(hx - 11, y - 2, 1, 5, C.gray);
        return;
      case 'bow':
        // 弓横举，搭一支箭
        for (let k = -9; k <= 9; k++) g.set(hx - Math.round(Math.cos((k / 9) * Math.PI / 2) * 3), y + k, C.brown);
        g.line(hx, y - 9, hx, y + 9, C.lightGray);
        g.rect(hx - 10, y, 14, 1, C.tan);
        g.poly([[hx - 10, y - 2], [hx - 10, y + 3], [hx - 13, y + 0.5]], metal);
        return;
      case 'whip':
        g.rect(hx - 16, y, 16, 2, C.darkGray);
        for (let x = hx - 15; x < hx; x += 3) g.rect(x, y, 1, 2, C.gray);
        g.rect(hx - 1, y - 2, 2, 6, C.gold);
        return;
      case 'dagger':
        g.rect(hx - 7, y, 7, 1, metal);
        return;
      case 'axe':
        g.rect(hx - 14, y, 18, 1, wood);
        g.poly([[hx - 18, y - 5], [hx - 12, y - 4], [hx - 12, y + 5], [hx - 18, y + 6]], metal);
        return;
      case 'club':
        g.rect(hx - 14, y - 1, 15, 3, wood);
        g.ellipse(hx - 15, y + 0.5, 3, 3, wood);
        return;
      case 'scroll':
        g.rect(hx - 5, y - 1, 5, 4, C.paper);
        g.rect(hx - 5, y - 1, 1, 4, C.tan);
        return;
      default:
        return;
    }
  }
  // 待机/施法：兵器竖着拿在手里
  const up = f.arm === 'up';
  if (pole) {
    const top = Math.max(L.weapon === 'guandao' || L.weapon === 'halberd' ? 13 : 9, hy - 22);
    g.rect(hx, top, 1, Math.min(UNIT_H - top, 46), L.weapon === 'guandao' ? C.darkBrown : wood);
    polearmHead(g, L, hx, top, true);
    return;
  }
  switch (L.weapon) {
    case 'sword':
    case 'saber':
    case 'twin':
      g.rect(hx, hy - 18, 2, 16, metal);
      g.rect(hx, hy - 18, 1, 16, C.white);
      if (L.weapon === 'saber') g.rect(hx - 1, hy - 19, 2, 2, metal);
      g.rect(hx - 2, hy - 2, 6, 1, C.gold);
      g.rect(hx, hy + 1, 2, 3, C.brown);
      return;
    case 'staff': {
      const top = Math.max(3, hy - (up ? 6 : 24));
      g.rect(hx, top, 1, up ? 24 : 34, C.brown);
      g.ellipse(hx + 0.5, top - 1, 2.8, 2.8, L.orb ?? C.yellow);
      g.set(hx, top - 2, C.white);
      return;
    }
    case 'cane':
      g.rect(hx, hy - 8, 1, 50 - (hy - 8), C.brown);
      g.rect(hx - 2, hy - 9, 3, 1, C.brown);
      return;
    case 'fan':
      g.ellipse(hx + 0.5, hy - 5, 5, 5.5, C.white, (_x, y) => y < hy - 2);
      for (let k = -4; k <= 4; k += 2) g.line(hx + 0.5, hy - 2, hx + 0.5 + k, hy - 9, C.sand);
      g.rect(hx, hy - 2, 1, 3, C.brown);
      return;
    case 'feather':
      // 羽扇：一片片白羽，羽梗灰色，扇柄下垂一缕红穗
      g.ellipse(hx + 0.5, hy - 7, 4.5, 6.5, C.white, (_x, y) => y < hy - 1);
      for (let k = -3; k <= 3; k += 2) g.line(hx + 0.5, hy - 1, hx + 0.5 + k, hy - 11, C.lightGray);
      g.rect(hx - 3, hy - 13, 7, 1, C.gray);
      g.rect(hx, hy - 1, 1, 4, C.brown);
      g.set(hx, hy + 3, C.red);
      g.set(hx, hy + 4, C.red);
      return;
    case 'bow':
      // 弓竖着拿，弓背朝前
      for (let k = -12; k <= 12; k++) g.set(hx - Math.round(Math.cos((k / 12) * Math.PI / 2) * 4), hy - 6 + k, C.brown);
      g.line(hx, hy - 18, hx, hy + 6, C.lightGray);
      return;
    case 'whip':
      g.rect(hx, hy - 17, 2, 16, C.darkGray);
      for (let y = hy - 16; y < hy - 1; y += 3) g.rect(hx, y, 2, 1, C.gray);
      g.rect(hx - 2, hy - 2, 6, 1, C.gold);
      g.rect(hx, hy + 1, 2, 3, C.brown);
      return;
    case 'dagger':
      g.rect(hx, hy - 7, 1, 6, metal);
      g.rect(hx - 1, hy - 1, 3, 1, C.gold);
      return;
    case 'axe':
      g.rect(hx, hy - 18, 1, 26, wood);
      g.poly([[hx + 0.5, hy - 19], [hx - 6, hy - 21], [hx - 6, hy - 11], [hx + 0.5, hy - 13]], metal);
      return;
    case 'club':
      g.rect(hx - 1, hy - 14, 3, 16, wood);
      g.ellipse(hx + 0.5, hy - 14, 3, 3, wood);
      return;
    case 'scroll':
      g.rect(hx - 2, hy - 1, 6, 4, C.paper);
      g.rect(hx - 2, hy - 1, 1, 4, C.tan);
      g.rect(hx + 3, hy - 1, 1, 4, C.tan);
      return;
    default:
      return;
  }
}

export function drawUnit(L: Look, pose: Pose): Grid {
  const f = frameOf(pose);
  const g = new Grid(UNIT_W, UNIT_H);
  drawBack(g, L, f);
  drawLegs(g, L, f);
  drawTorso(g, L, f);
  drawHead(g, L, f);
  drawFrontArm(g, L, f);
  drawWeapon(g, L, f);
  const [sk, sks] = skinOf(L);
  const shades: Record<number, number> = { [L.outfit[0]]: L.outfit[1], [L.hair[0]]: L.hair[1], [sk]: sks };
  const pants = L.pants ?? L.outfit[1];
  if (pants !== L.outfit[1]) shades[pants] = L.outfit[1];
  if (L.cape) shades[L.cape] = L.outfit[1];
  g.shadeRight(shades, 2);
  g.outline(C.ink);
  if (pose === 'down') {
    // 倒地：顺时针转 90 度，往下挪到贴地
    const r = g.rotateCW();
    const out = new Grid(UNIT_W, UNIT_H);
    out.blit(r, -4, 12);
    return out;
  }
  return g;
}

// 头像 24×24：取头和肩
export function drawAvatar(L: Look): Grid {
  const g = drawUnit(L, 'idle');
  return g.crop(BX - 12, 2, 24, 24);
}
