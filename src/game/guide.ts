// 江湖指引该出哪几条：新系统第一次用得上、而且还没提示过的（显示在 ui/tips.ts）
import { FORMS, FORM_ORDER } from './formation';
import { campSummary } from './camp';
import { milestoneReady, suppliesReady } from './welfare';
import { advancedSkills, skills } from '../data';
import { XINFA_LEVEL } from './growth';
import type { Save } from './state';

export interface Tip {
  key: string;
  title: string;
  body: string;
}

// 现在该出哪几条（还没出过的）
export function pendingTips(s: Save): Tip[] {
  const out: Tip[] = [];
  const seen = (k: string) => !!s.flags[`tip_${k}`];
  for (const id of FORM_ORDER) {
    const f = FORMS[id];
    if (f.lv <= 10 || s.player.level < f.lv || seen(`form_${id}`)) continue;
    out.push({ key: `form_${id}`, title: `新阵法：${f.name}`, body: `${f.desc}。「功能 → 阵法」能布，开打前看一眼对面的阵，能克就换。` });
  }
  const bond = campSummary(s).find((b) => b.on);
  if (bond && !seen('bond')) out.push({ key: 'bond', title: `羁绊成形：${bond.label}`, body: `${bond.desc}。「副将」里能看到眼下有哪些羁绊，同阵营带满三个还能更多。` });
  if (milestoneReady(s) && !seen('mile')) out.push({ key: 'mile', title: '江湖行记', body: '一路上做到的几件事能领奖了：「功能 → 福利 → 江湖行记」。一共七件，第七件送大乔。' });
  if (suppliesReady(s) > 0 && !seen('supply')) out.push({ key: 'supply', title: '战备补给', body: '每打十场仗，军需官给你攒一份补给，最多攒三份：「功能 → 福利 → 战备补给」。' });
  // 进阶招式、心法开了（老存档早过了这个等级的，进游戏也提示一次）
  const [own, ult] = advancedSkills(s.player.classId, s.player.gender);
  for (const id of [own, ult]) {
    const def = skills[id];
    if (s.player.level < def.learnLevel || s.player.skills.some((x) => x.id === id) || seen(`adv_${id}`)) continue;
    out.push({ key: `adv_${id}`, title: `新招式：${def.name}`, body: `${def.desc}。去城里的技能学校学，直接${def.learnLevel >= 100 ? 5 : 3}级起步。` });
  }
  if (s.player.level >= XINFA_LEVEL && !s.player.xinfa && !seen('xinfa')) out.push({ key: 'xinfa', title: '心法可修', body: '技能学校能修一门心法，两门二选一，头一回免费，以后还能改修。转职后心法升成「·极」。' });
  return out;
}

