// 单机版的"此地玩家"和聊天频道氛围：AI 玩家名字、等级、闲聊都由种子生成
import { CLASS_IDS, classes, locations } from '../data';
import type { ClassId, Gender } from '../core/types';
import { Rng } from '../core/rng';
import type { Channel } from './state';

const SUR = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦许何吕施张孔曹严华金魏陶姜谢邹柏水窦章苏潘葛范彭鲁马方袁柳';
const GIV = ['子龙', '孟德', '云长', '小乔', '无忌', '青云', '若雪', '飞扬', '寒烟', '凌霄', '星河', '无名', '冰心', '长风', '紫嫣', '破军', '逍遥', '惊鸿', '慕白', '听雨', '不凡', '明月', '一刀', '霸天'];

export interface AiPlayer {
  id: string;
  name: string;
  level: number;
  classId: ClassId;
  gender: Gender;
  variant: number;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function aiName(rng: Rng): string {
  return rng.pick([...SUR]) + rng.pick(GIV);
}

// 某地点的玩家每半小时换一批
export function playersAt(locId: string, now = Date.now()): AiPlayer[] {
  const slot = Math.floor(now / 1800000);
  const rng = new Rng(hashStr(locId) ^ slot);
  const loc = locations[locId];
  const levels = loc.groups.length ? loc.groups.map((g) => g.level[1]) : [8];
  const base = Math.max(...levels);
  const n = rng.int(loc.town ? 4 : 1, loc.town ? 9 : 4);
  return Array.from({ length: n }, (_, i) => ({
    id: `${locId}-${slot}-${i}`,
    name: aiName(rng),
    level: Math.max(1, base + rng.int(-4, 6)),
    classId: rng.pick(CLASS_IDS),
    gender: rng.chance(0.5) ? 'male' : 'female',
    variant: rng.int(0, 2),
  }));
}

export function playerClassName(p: AiPlayer): string {
  return classes[p.classId].name;
}

const LINES: Record<Exclude<Channel, 'sys'>, string[]> = {
  qu: ['有人一起去山贼营寨吗？', '新手求带，刚出村', '村北山林小偷好多', '招降要先把血打残，亲测', '有人知道翠竹山庄怎么走吗', '文人的四面楚歌太好用了', '异人前期好难练啊', '武士加满体质，扛得住', '组队打头目，来个奶', '刚招到一个草寇，成长1.08', '医馆10级以前不要钱，赶紧多治', '下邳之路那边的逃兵挺凶', '许昌铁匠铺打出精良了！', '跑环第九环卡住了，招降不到', '叛军统领好难打，术士群攻太疼', '军马场的逍遥灰影好帅', '有人去颍川刷街匪吗', '将军令洗资质洗出1.4成长了', '宝洞第三铲的守卫有点猛', '乱葬岗的僵尸抗物理好高', '先锋领军那里记得带药', '濮阳郊外的恶棍皮真厚', '巨野泽刷大盗，银子多', '黄巾宝窟的白银大盗，一只顶十只', '华雄被我温酒斩了哈哈', '吕布太猛了，三个人都打不过', '刚转职，换成异人了', '化境的五雷轰顶一下两千', '擂台冲进前十了', '斗将台副将单挑好刺激', '天师坛的张鲁谁打过了', '教派任务每天五个别忘了'],
  pai: ['今天的教派任务做完了吗', '教派声望又涨了', '谁要升护法了，恭喜', '本教排名又上去了', '活力不够了，明天再来'],
  shang: ['收铁矿石，价格好说', '出2级钻石，便宜卖', '收精钢矿，量大', '出高级心法', '出金创药，比医馆便宜', '收竹笋，十两一个', '出一把好扇子，私聊', '跳蚤市场摆摊了，来看看', '收寒铁矿，打五十级装备', '出乌金矿三块', '收大将军令，价高', '庐江逃兵掉的军资谁要'],
  shi: ['今晚抢宝谁去', '赤壁娱乐场又开了', '这局赤壁押蜀，赔率五倍了', '猜猜看连中三把，收手了', '求组跑环，40级文人', '国战什么时候开始', '有没有人一起去洛阳', '九点抢宝，宝藏在哪', '十一点那场抢宝我去了', '月老那里送礼好贵', '今天文曲星的题好难', '幸运王又抽到金砖了', '决斗场被人抢了，恶人值好高的那个'],
};

export interface ChatLine {
  t: number;
  ch: Channel;
  who: string;
  text: string;
}

const recent: ChatLine[] = [];
const rng = new Rng(Date.now() >>> 0);

export function chatterTick(): ChatLine {
  const ch = rng.pick(['qu', 'qu', 'qu', 'pai', 'shang', 'shi'] as const);
  const line: ChatLine = { t: Date.now(), ch, who: aiName(rng), text: rng.pick(LINES[ch]) };
  recent.push(line);
  if (recent.length > 60) recent.shift();
  return line;
}

export function chatterLines(): ChatLine[] {
  return recent;
}

export function seedChatter(n: number): void {
  for (let i = 0; i < n; i++) {
    const l = chatterTick();
    l.t -= (n - i) * 40000;
  }
}
