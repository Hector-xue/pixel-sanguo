// 今日事务面板：今天还剩什么、点「去办」直接打开那个面板；设施里的事（幸运王、抢宝）和 NPC 的事（文曲星、银两环）先寻路过去
import { C } from '../art/palette';
import { locations, npcs } from '../data';
import { tomorrowHint } from '../game/calendar';
import { dailyItems } from '../game/daily';
import type { DailyGo } from '../game/daily';
import { findPath } from '../game/state';
import { store } from '../game/store';
import { welfarePanel } from './fun';
import * as X from './p3';
import * as G4 from './p4';
import type { Host } from './panels';
import { talkTo } from './panels';
import { battlefieldPanel, casinoPanel } from './town';
import { fit } from './textfit';
import { Button, Modal, ScrollArea, frame, text, toast } from './widgets';

// 离得最近的、有这个设施或这位 NPC 的地方
function nearest(from: string, ok: (id: string) => boolean): string | null {
  let best: string | null = null;
  let len = Infinity;
  for (const id of Object.keys(locations)) {
    if (!ok(id)) continue;
    const p = id === from ? [id] : findPath(from, id);
    if (p && p.length < len) {
      best = id;
      len = p.length;
    }
  }
  return best;
}

function goThen(h: Host, ok: (id: string) => boolean, what: string, open: () => void): void {
  const s = store.save;
  if (ok(s.location)) return open();
  const to = nearest(s.location, ok);
  if (!to) return toast(h, `找不到${what}`);
  toast(h, `去${locations[to].name}（${what}）`, 1400);
  h.autoPath(to);
}

const hasNpc = (npc: string) => (id: string) => locations[id].npcs.includes(npc);
const hasFac = (f: string) => (id: string) => !!locations[id].facilities?.includes(f);
const npcWith = (key: 'wenqu' | 'silverRing') => Object.keys(npcs).find((k) => npcs[k][key]) ?? '';

function open(h: Host, go: DailyGo): void {
  switch (go) {
    case 'welfare': return welfarePanel(h);
    case 'festival': return welfarePanel(h, 2);
    case 'arena': return X.arenaPanel(h, 0);
    case 'duel': return X.arenaPanel(h, 1);
    case 'guozhan': return G4.guozhanPanel(h, 0);
    case 'league': return G4.guozhanPanel(h, 3);
    case 'kuaqu': return G4.guozhanPanel(h, 4);
    case 'claims': return G4.guozhanPanel(h);
    case 'lucky': return goThen(h, hasFac('casino'), '娱乐场', () => casinoPanel(h, 2));
    case 'treasure': return goThen(h, hasFac('battlefield'), '战场', () => X.treasurePanel(h, () => battlefieldPanel(h)));
    case 'wenqu': {
      const id = npcWith('wenqu');
      return goThen(h, hasNpc(id), npcs[id]?.name ?? '文曲星', () => talkTo(h, id));
    }
    case 'silverRing': {
      const id = npcWith('silverRing');
      return goThen(h, hasNpc(id), npcs[id]?.name ?? '庐江都尉', () => talkTo(h, id));
    }
  }
}

export function dailyPanel(h: Host): void {
  const s = store.save;
  const list = dailyItems(s);
  const todo = list.filter((x) => x.todo).length;
  const m = new Modal(h, '今日事务');
  m.inner.add(text(h, m.cx, m.cy, todo ? `今天还有${todo}件事没办。${tomorrowHint(s)}。` : `今天的都办完了，${tomorrowHint(s)}。`, { wrap: m.cw, color: C.brown }));
  const top = m.cy + 24;
  const area = new ScrollArea(h, m.cx, top, m.cw, m.py + m.ph - 16 - top, m.inner);
  list.forEach((it, i) => {
    const y = i * 38;
    const g = h.add.graphics();
    frame(g, 0, y, m.cw - 6, 34, it.todo ? 'paper' : 'disabled');
    area.content.add(g);
    area.content.add(text(h, 8, y + 3, it.name, { color: it.todo ? C.darkRed : C.gray }));
    area.content.add(text(h, 8, y + 18, fit(it.detail, m.cw - 80), { color: it.todo ? C.darkBrown : C.gray }));
    area.content.add(new Button(h, m.cw - 62, y + 6, 52, 22, '去办', () => {
      m.close();
      open(h, it.go);
    }, { clip: area, style: it.todo ? 'red' : 'tan' }));
  });
  area.setContentHeight(list.length * 38);
}
