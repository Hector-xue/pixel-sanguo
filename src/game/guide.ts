// 江湖指引该出哪几条：新系统第一次用得上、而且还没提示过的（显示在 ui/tips.ts）
import { FORMS, FORM_ORDER } from './formation';
import { campSummary } from './camp';
import { milestoneReady, suppliesReady } from './welfare';
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
  return out;
}

