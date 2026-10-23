// 版本号和「更新了什么」：老玩家更新后第一次进游戏弹一次；设置里能翻全部更新记录
import pkg from '../../package.json';
import changelog from '../data/changelog.json';
import { C } from '../art/palette';
import type { Host } from './panels';
import { Modal, ScrollArea, text, textLines } from './widgets';

export const APP_VERSION: string = pkg.version;
const SEEN_KEY = 'pxsg.seenVersion';

function seen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return APP_VERSION;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, APP_VERSION);
  } catch {
    // 记不住就下次再弹
  }
}

// 进主界面时看一眼：新角色（还没打过仗、也没看过）直接记下不弹；老玩家换了版本弹一次
export function maybeWhatsNew(h: Host, battles: number): void {
  const v = seen();
  if (v === APP_VERSION) return;
  markSeen();
  if (v === null && battles === 0) return;
  changelogPanel(h, true);
}

export function changelogPanel(h: Host, latest = false): void {
  const list = latest ? changelog.slice(0, 1) : changelog;
  const m = new Modal(h, latest ? `更新了什么（${APP_VERSION}）` : '更新记录', { w: 300 });
  const area = new ScrollArea(h, m.cx, m.cy, m.cw, m.py + m.ph - 16 - m.cy, m.inner);
  const w = m.cw - 10;
  let y = 0;
  for (const r of list) {
    area.content.add(text(h, 0, y, `${r.v}　${r.date}`, { color: C.darkRed }));
    y += 20;
    for (const it of r.items) {
      area.content.add(text(h, 0, y, `· ${it}`, { wrap: w, color: C.darkBrown, lineGap: 2 }));
      y += textLines(`· ${it}`, w, 2) + 6;
    }
    y += 8;
  }
  area.setContentHeight(y);
}
