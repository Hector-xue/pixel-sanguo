// 江湖侠客：在各地游荡的 AI 人物（名字、等级、职业由种子生成），可以切磋、雇来同行
import { CLASS_IDS, classes, locations } from '../data';
import type { ClassId, Gender } from '../core/types';
import { Rng } from '../core/rng';

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

// 某地游荡的侠客每半小时换一批
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
