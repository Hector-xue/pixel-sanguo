// Q 版人物纸娃娃：头身 + 发型 + 服饰 + 武器分层拼，自动描边和阴影。
// 照原版老版的比例：约 2.5 头身、大眼、叉腿站，原尺寸（1 像素 = 1 逻辑像素）显示，约 26×50。
// 画布 52×52，人物朝左，身体中线在 BX；左边留给攻击时伸出去的兵器。
import { Grid } from './pixel';
import { C } from './palette';

export type Weapon = 'sword' | 'saber' | 'spear' | 'staff' | 'fan' | 'dagger' | 'axe' | 'club' | 'cane' | 'scroll' | 'none';
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

export function heroLook(classId: string, gender: string, variant: number): Look {
  const female = gender === 'female';
  const v = ((variant % 3) + 3) % 3;
  return { ...HERO[classId], female, hair: HAIRS[v], style: (female ? FEMALE_STYLES : MALE_STYLES)[v] };
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
  m_zuoci: { outfit: [C.white, C.lightGray], trim: C.sky, belt: C.sky, boots: C.gray, hair: [C.lightGray, C.gray], style: 'topknot', weapon: 'staff', orb: C.sky, beard: C.white, longBeard: true },
};

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
  return !!L.female || (!L.armor && ['fan', 'staff', 'scroll', 'cane', 'none'].includes(L.weapon));
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

function drawBack(g: Grid, L: Look, f: Frame): void {
  const hx = BX + f.dx;
  const hy = HEAD_Y + f.dy;
  const [hm] = L.hair;
  if (L.cape) g.poly([[BX - 3, 22], [BX + 9, 22], [BX + 13, 46], [BX + 1, 46]], L.cape);
  if (L.style === 'long') g.poly([[hx + 1, hy - 4], [hx + 9, hy - 2], [hx + 11, hy + 22], [hx + 2, hy + 20]], hm);
  if (L.style === 'tail') g.poly([[hx + 6, hy - 4], [hx + 10, hy - 3], [hx + 12, hy + 12], [hx + 9, hy + 13]], hm);
  if (L.style === 'band' && L.accent !== undefined) g.poly([[hx + 7, hy - 4], [hx + 9, hy - 5], [hx + 14, hy + 2], [hx + 12, hy + 3]], L.accent);
  // 后手臂（被身子挡住一半）
  const om = L.outfit[0];
  if (f.arm === 'forward') {
    g.rect(BX + 5 + f.dx, 23, 4, 7, om);
    g.rect(BX + 6 + f.dx, 29, 3, 3, C.skin);
  } else {
    g.poly([[BX + 4 + f.dx, 22], [BX + 9 + f.dx, 23], [BX + 10 + f.dx, 31], [BX + 6 + f.dx, 31]], om);
    g.rect(BX + 7 + f.dx, 31, 3, 3, C.skin);
  }
}

function drawLegs(g: Grid, L: Look, f: Frame): void {
  const boots = L.boots;
  if (robed(L)) {
    // 长袍：往下散开，下摆一道镶边，露出鞋尖
    const [om, od] = L.outfit;
    const spread = f.legs === 'lunge' ? 2 : 0;
    for (let y = HIP_Y - 1; y <= 46; y++) {
      const t = y - (HIP_Y - 1);
      const l = BX - 7 - t * 0.4 - spread;
      const r = BX + 7 + t * 0.35;
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
  const w = L.broad ? 2 : 0;
  const x0 = BX + f.dx;
  for (let y = 21; y <= HIP_Y; y++) {
    const l = x0 - 7 - w + (y < 23 ? 1 : 0);
    const r = x0 + 7 + w - (y < 23 ? 1 : 0);
    for (let x = l; x <= r; x++) g.set(x, y, om);
  }
  // 交领：两道斜襟
  g.line(x0 - 4, 21, x0 + 1, 28, L.trim);
  g.line(x0 + 3, 21, x0 + 1, 25, L.trim);
  g.rect(x0 + 1, 28, 1, BELT_Y - 28, od);
  if (L.armor) {
    const metal = L.metal ?? C.lightGray;
    g.rect(x0 - 5, 23, 10, 7, C.gray);
    g.rect(x0 - 4, 24, 8, 1, metal);
    g.rect(x0 - 4, 27, 8, 1, metal);
    g.ellipse(x0 - 7 - w / 2, 23, 3.2, 2.6, C.gray);
    g.ellipse(x0 - 7.5 - w / 2, 22.5, 1.6, 1.2, metal);
  }
  // 腰带 + 带扣
  g.rect(x0 - 7 - w, BELT_Y, 15 + 2 * w, 2, L.belt);
  g.rect(x0 - 1, BELT_Y, 2, 2, C.gold);
  // 下摆（短褂盖到胯）
  if (!robed(L)) g.poly([[x0 - 8 - w, HIP_Y - 1], [x0 + 8 + w, HIP_Y - 1], [x0 + 9 + w, HIP_Y + 2], [x0 - 9 - w, HIP_Y + 2]], om);
}

function drawFrontArm(g: Grid, L: Look, f: Frame): void {
  const om = L.outfit[0];
  const x0 = BX + f.dx;
  const [hx, hy] = handOf(f);
  if (f.arm === 'forward') {
    g.poly([[x0 - 6, 22], [x0 - 2, 24], [hx + 3, 28], [hx + 2, 24]], om);
    g.rect(hx, hy - 1, 3, 3, C.skin);
  } else if (f.arm === 'up') {
    g.poly([[x0 - 7, 22], [x0 - 3, 23], [hx + 3, hy + 3], [hx, hy + 3]], om);
    g.rect(hx - 1, hy - 1, 3, 3, C.skin);
  } else {
    // 宽袖口
    g.poly([[x0 - 8, 22], [x0 - 4, 22], [hx + 3, hy - 1], [hx - 2, hy - 1]], om);
    g.rect(hx - 2, hy - 2, 6, 1, L.trim);
    g.rect(hx - 1, hy - 1, 3, 3, C.skin);
  }
}

function drawHead(g: Grid, L: Look, f: Frame): void {
  const hx = BX + f.dx;
  const hy = HEAD_Y + f.dy;
  const [hm] = L.hair;
  // 脖子
  g.rect(hx - 2, hy + 7, 4, 3, C.skinShade);
  g.ellipse(hx, hy, 8.4, 8, C.skin);
  const ink = C.ink;
  // 头发：盖住头顶和后脑勺，前面一排刘海
  if (L.style === 'helmet') {
    const metal = L.metal ?? C.lightGray;
    g.ellipse(hx, hy, 9, 8.8, C.gray, (_x, y) => y + 0.5 < hy - 1);
    g.rect(hx - 9, hy - 2, 18, 2, metal);
    g.ellipse(hx, hy, 9, 8.8, C.gray, (x, y) => y >= hy - 1 && x > hx + 3 && y < hy + 6);
    g.rect(hx - 1, hy - 13, 3, 5, L.accent ?? C.red);
    g.rect(hx - 2, hy - 9, 5, 1, metal);
  } else if (L.style === 'hood') {
    g.ellipse(hx, hy, 9.2, 9, hm, (x, y) => y + 0.5 < hy - 2 || (x > hx + 1 && y < hy + 9));
    g.rect(hx - 8, hy - 3, 10, 1, L.outfit[1]);
  } else {
    g.ellipse(hx, hy, 8.9, 8.6, hm, (x, y) => y + 0.5 < hy - 2.5 || (x + 0.5 > hx + 2.5 + (y - hy) * 0.3 && y < hy + 5));
    // 刘海：锯齿
    for (let x = hx - 8; x <= hx + 3; x++) {
      g.set(x, hy - 3, hm);
      if ((x - hx) % 3 === 0) g.set(x, hy - 2, hm);
    }
    if (L.style === 'short') for (let x = hx - 6; x <= hx + 6; x += 3) g.set(x, hy - 9, hm);
  }
  if (L.style === 'topknot') {
    g.ellipse(hx + 2, hy - 10, 3.2, 2.8, hm);
    g.rect(hx, hy - 8, 5, 1, L.accent ?? C.gold);
  }
  if (L.style === 'band' && L.accent !== undefined) g.rect(hx - 9, hy - 5, 18, 2, L.accent);
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
  if (L.hat !== undefined) {
    g.rect(hx - 5, hy - 13, 10, 5, L.hat);
    g.rect(hx - 7, hy - 9, 14, 2, L.hat);
    g.rect(hx + 6, hy - 9, 2, 6, L.hat);
  }
  // 五官（朝左：前眼在左，大眼带高光）
  const ey = hy;
  const e1 = hx - 6;
  const e2 = hx - 1;
  const brow = L.beard !== undefined ? L.beard : ink;
  if (f.eyesClosed) {
    g.rect(e1, ey + 2, 2, 1, ink);
    g.rect(e2, ey + 2, 2, 1, ink);
  } else {
    for (const ex of [e1, e2]) {
      g.rect(ex, ey, 2, 4, ink);
      g.set(ex + 1, ey + 1, C.white);
    }
    if (L.female) {
      g.set(e1 - 1, ey, ink);
      g.set(e2 + 2, ey, ink);
    }
  }
  if (!L.female) {
    g.rect(e1 - 1, ey - 2, 3, 1, brow);
    g.rect(e2, ey - 2, 3, 1, brow);
  }
  if (L.female) {
    g.set(e1 - 1, ey + 5, C.pink);
    g.set(e2 + 2, ey + 5, C.pink);
  }
  g.rect(hx - 4, hy + 6, 2, 1, L.female ? C.red : C.skinShade);
  g.set(hx + 3, hy + 2, C.skinShade);
  if (L.mask !== undefined) g.rect(hx - 9, hy + 4, 11, 3, L.mask);
  if (L.beard !== undefined) {
    g.rect(hx - 6, hy + 5, 2, 1, L.beard);
    g.rect(hx - 2, hy + 5, 2, 1, L.beard);
    for (let x = hx - 7; x <= hx + 1; x++) g.set(x, hy + 7, L.beard);
    g.rect(hx - 5, hy + 8, 4, 1, L.beard);
    if (L.longBeard) g.poly([[hx - 7, hy + 7], [hx + 1, hy + 7], [hx - 2, hy + 18], [hx - 5, hy + 18]], L.beard);
  }
}

function drawWeapon(g: Grid, L: Look, f: Frame): void {
  const metal = L.metal ?? C.white;
  const wood = C.lightBrown;
  const [hx, hy] = handOf(f);
  if (f.arm === 'forward') {
    // 攻击：兵器朝前平伸
    const y = hy;
    switch (L.weapon) {
      case 'sword':
      case 'saber':
        g.rect(hx - 18, y, 18, 2, metal);
        g.rect(hx - 18, y, 18, 1, C.white);
        if (L.weapon === 'saber') g.rect(hx - 19, y - 1, 3, 1, metal);
        g.rect(hx - 1, y - 2, 2, 6, C.gold);
        return;
      case 'spear':
        g.rect(hx - 20, y, 30, 1, wood);
        g.poly([[hx - 20, y - 2], [hx - 20, y + 3], [hx - 27, y + 0.5]], metal);
        g.rect(hx - 19, y + 1, 3, 3, L.accent ?? C.red);
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
  switch (L.weapon) {
    case 'sword':
    case 'saber':
      g.rect(hx, hy - 18, 2, 16, metal);
      g.rect(hx, hy - 18, 1, 16, C.white);
      if (L.weapon === 'saber') g.rect(hx - 1, hy - 19, 2, 2, metal);
      g.rect(hx - 2, hy - 2, 6, 1, C.gold);
      g.rect(hx, hy + 1, 2, 3, C.brown);
      return;
    case 'spear': {
      const top = Math.max(1, hy - 30);
      g.rect(hx, top, 1, Math.min(UNIT_H - top, 46), wood);
      g.poly([[hx - 2, top + 6], [hx + 3, top + 6], [hx + 0.5, top - 1]], metal);
      g.rect(hx - 1, top + 6, 3, 3, L.accent ?? C.red);
      return;
    }
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
  const shades: Record<number, number> = { [L.outfit[0]]: L.outfit[1], [L.hair[0]]: L.hair[1], [C.skin]: C.skinShade };
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
