// 武将专属被动：每位名将一个，让人一眼记住。按人（招来的武将 id / 名将的怪物 id）查表。
// 机制是一小撮通用的（追击、无双、连击、开局加成、残血发狂、回血、治疗、计策加成、格挡、暴击、带毒、逗乐、招降、发财），数值各人不同
export type PassiveKind =
  | 'chase' | 'wushuang' | 'combo' | 'opening' | 'berserk' | 'regen' | 'heal' | 'spell' | 'block' | 'crit' | 'venom' | 'jest' | 'persuade' | 'loot';

export interface Passive {
  name: string;
  desc: string;
  kind: PassiveKind;
  v: number;
  // opening：管几回合、加在攻击还是防御上
  n?: number;
  stat?: 'atk' | 'def';
}

export const PASSIVES: Record<string, Passive> = {
  // ===== 招得到的武将 =====
  zhaoyun: { name: '七进七出', desc: '普攻打倒一人后，立刻冲向下一个再打一次（每回合一次）', kind: 'chase', v: 1 },
  daqiao: { name: '流离', desc: '每回合开始，给气血最少的队友回复6%气血', kind: 'heal', v: 0.06 },
  xiaoqiao: { name: '天香', desc: '技能伤害+15%', kind: 'spell', v: 0.15 },
  chendeng: { name: '湖海豪气', desc: '前三回合防御+25%', kind: 'opening', v: 0.25, n: 3, stat: 'def' },
  caobao: { name: '丹阳兵', desc: '挨普攻时20%机会格挡，伤害减半', kind: 'block', v: 0.2 },
  weixu: { name: '陷阵', desc: '普攻15%机会连击', kind: 'combo', v: 0.15 },
  songxian: { name: '陷阵', desc: '普攻15%机会连击', kind: 'combo', v: 0.15 },
  houcheng: { name: '陷阵', desc: '普攻15%机会连击', kind: 'combo', v: 0.15 },
  sunqian: { name: '说客', desc: '同场时主角招降成功率+15%', kind: 'persuade', v: 0.15 },
  jianyong: { name: '滑稽', desc: '挨普攻时15%机会把对方逗得发愣（混乱1回合）', kind: 'jest', v: 0.15 },
  mifang: { name: '资财', desc: '出战打赢后银两+20%', kind: 'loot', v: 0.2 },
  // ===== 剧情里的名将 =====
  lvbu: { name: '无双', desc: '每打倒一人，之后每回合普攻多打一次（最多三次）', kind: 'wushuang', v: 3 },
  huaxiong: { name: '骁勇', desc: '前两回合攻击+30%', kind: 'opening', v: 0.3, n: 2, stat: 'atk' },
  dongzhuo: { name: '暴虐', desc: '气血不到一半时攻击+25%', kind: 'berserk', v: 0.25 },
  zhanglu: { name: '五斗米道', desc: '每回合开始回复8%气血', kind: 'regen', v: 0.08 },
  liru: { name: '鸩毒', desc: '普攻附带中毒', kind: 'venom', v: 0.3 },
  // ===== 国战里的名将 =====
  gz_guanyu: { name: '青龙偃月', desc: '暴击率+12', kind: 'crit', v: 12 },
  gz_zhangfei: { name: '燕人咆哮', desc: '普攻打倒一人后，接着打下一个', kind: 'chase', v: 1 },
  gz_machao: { name: '西凉锦马', desc: '普攻25%机会连击', kind: 'combo', v: 0.25 },
  gz_huangzhong: { name: '百步穿杨', desc: '暴击率+15', kind: 'crit', v: 15 },
  gz_xiahoudun: { name: '拔矢啖睛', desc: '气血不到一半时攻击+30%', kind: 'berserk', v: 0.3 },
  gz_caoren: { name: '铁壁', desc: '挨普攻时30%机会格挡，伤害减半', kind: 'block', v: 0.3 },
  gz_zhangliao: { name: '威震逍遥', desc: '前两回合攻击+35%', kind: 'opening', v: 0.35, n: 2, stat: 'atk' },
  gz_xuchu: { name: '虎痴', desc: '气血不到一半时攻击+30%', kind: 'berserk', v: 0.3 },
  gz_guojia: { name: '遗计', desc: '技能伤害+20%', kind: 'spell', v: 0.2 },
  gz_simayi: { name: '鹰视狼顾', desc: '每回合开始回复6%气血', kind: 'regen', v: 0.06 },
  gz_zhugeliang: { name: '卧龙', desc: '技能伤害+25%', kind: 'spell', v: 0.25 },
  gz_pangtong: { name: '凤雏', desc: '技能伤害+20%', kind: 'spell', v: 0.2 },
  gz_zhouyu: { name: '英姿', desc: '技能伤害+20%', kind: 'spell', v: 0.2 },
  gz_lvmeng: { name: '白衣渡江', desc: '前三回合攻击+25%', kind: 'opening', v: 0.25, n: 3, stat: 'atk' },
  gz_ganning: { name: '锦帆', desc: '普攻30%机会连击', kind: 'combo', v: 0.3 },
  gz_taishici: { name: '神亭酣战', desc: '普攻打倒一人后，接着打下一个', kind: 'chase', v: 1 },
  gz_huanggai: { name: '苦肉', desc: '气血不到一半时攻击+30%', kind: 'berserk', v: 0.3 },
  gz_luxun: { name: '火烧连营', desc: '技能伤害+20%', kind: 'spell', v: 0.2 },
  gz_xurong: { name: '荥阳设伏', desc: '前三回合攻击+20%', kind: 'opening', v: 0.2, n: 3, stat: 'atk' },
  gz_lijue: { name: '西凉兵', desc: '普攻15%机会连击', kind: 'combo', v: 0.15 },
  gz_guosi: { name: '西凉兵', desc: '普攻15%机会连击', kind: 'combo', v: 0.15 },
  gz_zhangji: { name: '西凉兵', desc: '普攻15%机会连击', kind: 'combo', v: 0.15 },
  gz_zhangxiu: { name: '北地枪王', desc: '普攻打倒一人后，接着打下一个', kind: 'chase', v: 1 },
  gz_jiaxu: { name: '乱武', desc: '普攻附带中毒', kind: 'venom', v: 0.3 },
};

export function passiveOf(key: string | undefined): Passive | undefined {
  return key ? PASSIVES[key] : undefined;
}
