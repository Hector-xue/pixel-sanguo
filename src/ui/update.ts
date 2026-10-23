// 安卓 App 里提醒有新版本：启动时后台查一次（查不到就算了，不打扰），标题页或进主界面后弹一次；
// 「以后再说」记下这个版本不再弹，出了更新的版本再弹。设置里能手动查。
import type Phaser from 'phaser';
import { C } from '../art/palette';
import { isApp } from '../game/cloud';
import { newerThan, parseUpdate, type UpdateInfo } from '../game/update';
import { APP_VERSION } from './changelog';
import { Button, Modal, ScrollArea, text, textLines, toast } from './widgets';

const SITE: string = (import.meta.env.VITE_SITE_BASE as string | undefined) ?? 'https://sanguo.ivyea.com/';
const SKIP_KEY = 'pxsg.skipUpdate';

let pending: Promise<UpdateInfo | null> | null = null;
let offered = false;

// 拿网站上的 version.json；超时、断网、文件不对都返回 null
async function fetchLatest(): Promise<UpdateInfo | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(new URL(`version.json?t=${Date.now()}`, SITE).href, { cache: 'no-store', signal: ctl.signal });
    if (!r.ok) return null;
    return parseUpdate(await r.json(), SITE);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function skipped(): string | null {
  try {
    return localStorage.getItem(SKIP_KEY);
  } catch {
    return null;
  }
}

function skip(v: string): void {
  try {
    localStorage.setItem(SKIP_KEY, v);
  } catch {
    // 记不住就下次再提醒
  }
}

// App 一启动就开查（只查一次）；网页版不查
export function startUpdateCheck(): void {
  if (!pending && isApp()) pending = fetchLatest();
}

// 查到比自己新、没点过「以后再说」、这次启动还没弹过：弹一次。scene 换走了就留给下一个场景
export function maybeOfferUpdate(scene: Phaser.Scene, delay = 600): void {
  startUpdateCheck();
  if (!pending || offered) return;
  void pending.then((info) => {
    if (offered || !info || !newerThan(info.v, APP_VERSION) || skipped() === info.v) return;
    scene.time.delayedCall(delay, () => {
      if (offered || !scene.scene.isActive()) return;
      offered = true;
      updatePanel(scene, info, true);
    });
  });
}

// 设置里点「检查更新」：不管点没点过「以后再说」都说结果
export function checkUpdateNow(scene: Phaser.Scene): void {
  toast(scene, '正在检查……', 1200);
  pending = fetchLatest();
  void pending.then((info) => {
    if (!scene.scene.isActive()) return;
    if (!info) toast(scene, '没查到：网络不通，或者网站暂时没放安装包。过会儿再试。', 3000);
    else if (!newerThan(info.v, APP_VERSION)) toast(scene, `已经是最新版（${APP_VERSION}）`);
    else updatePanel(scene, info, false);
  });
}

export function updatePanel(scene: Phaser.Scene, info: UpdateInfo, auto: boolean): void {
  // 弹窗宽 300，内容区宽 284：先量好字有多高再定弹窗高度，更新要点太长就在框里滚
  const cw = 284;
  const note = '下载新的安装包，装上就是新版，存档还在。';
  const noteH = textLines(note, cw, 2);
  const lines = info.items.map((it) => `· ${it}`);
  const listH = lines.reduce((s, l) => s + textLines(l, cw - 10, 2) + 6, 0);
  const viewH = Math.min(listH, 260);
  const m = new Modal(scene, `有新版本 ${info.v}`, { w: 300, h: 30 + 18 + noteH + 8 + (viewH ? viewH + 10 : 0) + 42 });
  let y = m.cy;
  m.inner.add(text(scene, m.cx, y, `现在是 ${APP_VERSION}${info.date ? `，新版 ${info.date} 发布` : ''}`, { color: C.darkRed }));
  y += 18;
  m.inner.add(text(scene, m.cx, y, note, { wrap: m.cw, color: C.darkBrown, lineGap: 2 }));
  y += noteH + 8;
  if (viewH) {
    const area = new ScrollArea(scene, m.cx, y, m.cw, viewH, m.inner);
    let ly = 0;
    for (const l of lines) {
      area.content.add(text(scene, 0, ly, l, { wrap: m.cw - 10, color: C.brown, lineGap: 2 }));
      ly += textLines(l, m.cw - 10, 2) + 6;
    }
    area.setContentHeight(ly);
  }
  const bw = Math.floor((m.cw - 8) / 2);
  const by = m.py + m.ph - 34;
  m.inner.add(new Button(scene, m.cx, by, bw, 24, '去下载', () => {
    m.close();
    // App 里跳到别的网站会交给系统浏览器打开，下载完点通知就能装
    location.href = `${info.apk}?v=${info.v}`;
  }, { style: 'red' }));
  m.inner.add(new Button(scene, m.cx + bw + 8, by, bw, 24, '以后再说', () => {
    m.close();
    if (auto) skip(info.v);
  }));
}
